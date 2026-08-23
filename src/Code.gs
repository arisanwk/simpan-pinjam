/**
 * Code.gs
 * Entry point Web App — JSON API (frontend hosting terpisah di Cloudflare,
 * memanggil lewat fetch()). Autentikasi memakai Google Identity Services:
 * frontend mengirim ID token Google di payload.idToken setiap request;
 * verifyIdTokenAndGetUser() (Auth.gs) memverifikasinya lewat endpoint
 * tokeninfo Google dan mencocokkan email ke sheet USERS.
 *
 * CATATAN PENTING SOAL CORS (baca sebelum mengubah bagian ini):
 * Apps Script Web App TIDAK bisa menjawab CORS preflight (OPTIONS) dengan
 * benar. Supaya browser tidak mengirim preflight sama sekali:
 *   (1) request POST dari frontend WAJIB pakai header
 *       `Content-Type: text/plain` (bukan application/json/Authorization
 *       header apapun) — body-nya tetap string JSON biasa;
 *   (2) idToken karena itu dikirim DI DALAM body JSON (payload.idToken),
 *       BUKAN sebagai header `Authorization: Bearer ...` — header custom
 *       apapun akan memicu preflight yang sama gagalnya.
 * parsePayload_() di bawah membaca body sebagai teks lalu JSON.parse
 * manual, jadi Content-Type yang diklaim browser tidak relevan di sisi server.
 */

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    const params = (e && e.parameter) || {};
    const payload = parsePayload_(e);
    const action = params.action || payload.action;
    if (!action) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Parameter "action" wajib diisi.');
    }

    // Aksi yang tidak butuh login sama sekali (dicek Google, bukan sheet
    // USERS) — daftar ini sengaja pendek & eksplisit, bukan default terbuka.
    const PUBLIC_ACTIONS = ['ping'];
    let currentUser = null;
    if (PUBLIC_ACTIONS.indexOf(action) === -1) {
      currentUser = verifyIdTokenAndGetUser(payload.idToken);
    }

    const result = routeAction_(action, currentUser, payload);
    return jsonResponse_(jsonSuccess_(result));
  } catch (err) {
    if (err instanceof AppError) {
      Logger.log('AppError: ' + err.code + ' - ' + err.message);
      return jsonResponse_(jsonError_(err.code, err.message));
    }
    Logger.log('UNEXPECTED: ' + (err && err.stack ? err.stack : err));
    return jsonResponse_(jsonError_(ERROR_CODES.INTERNAL_ERROR, 'Terjadi kesalahan pada sistem.'));
  }
}

/** Body POST dibaca sebagai teks mentah lalu di-parse manual (lihat catatan CORS di atas). */
function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Body request bukan JSON yang valid.');
    }
  }
  return {};
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Router aksi -> fungsi Service. Daftar ini akan bertambah seiring
 * AnggotaService/SimpananService/dst. ditulis. Untuk sekarang hanya
 * mencakup fungsi yang sudah benar-benar ada & teruji.
 */
function routeAction_(action, currentUser, payload) {
  switch (action) {
    case 'ping':
      return { pong: true };
    case 'login':
      // Token sudah diverifikasi di handleRequest_() sebelum sampai sini;
      // aksi ini murni supaya frontend dapat currentUser (nama, role) utk
      // dirender setelah proses Sign in with Google selesai.
      return currentUser;
    case 'getDashboardSummary':
      return getDashboardSummary(currentUser);
    case 'getPeriodReport':
      return getPeriodReport(currentUser, payload.startDate, payload.endDate);
    case 'reconcileLoan':
      return reconcileLoan(payload.loanId);
    case 'findOrphanRecords':
      return findOrphanRecords();
    case 'findDuplicateIds':
      return findDuplicateIds();

    // Anggota (STEP 3.5)
    case 'createMember': return createMember(currentUser, payload);
    case 'getMember': return getMember(currentUser, payload.memberId);
    case 'getMembers': return getMembers(currentUser, payload.filter);
    case 'updateMember': return updateMember(currentUser, payload.memberId, payload.patch || {});
    case 'deactivateMember': return deactivateMember(currentUser, payload.memberId);
    case 'searchMembers': return searchMembers(currentUser, payload.query);

    // Simpanan (STEP 3.6)
    case 'createSaving': return createSaving(currentUser, payload);
    case 'getSaving': return getSaving(currentUser, payload.transactionId);
    case 'getSavings': return getSavings(currentUser, payload.filter);
    case 'getMemberSavings': return getMemberSavings(currentUser, payload.memberId);
    case 'getSavingSummary': return getSavingSummary(currentUser);

    // Infaq (STEP 3.7)
    case 'createInfaq': return createInfaq(currentUser, payload);
    case 'getInfaq': return getInfaq(currentUser, payload.transactionId);
    case 'getInfaqList': return getInfaqList(currentUser, payload.filter);
    case 'getInfaqSummary': return getInfaqSummary(currentUser);

    // Pinjaman (STEP 3.8)
    case 'createLoanApplication': return createLoanApplication(currentUser, payload);
    case 'approveLoan': return approveLoan(currentUser, payload.loanId);
    case 'rejectLoan': return rejectLoan(currentUser, payload.loanId, payload.reason);
    case 'disburseLoan': return disburseLoan(currentUser, payload.loanId, payload.nominalPencairan);
    case 'getLoan': return getLoan(currentUser, payload.loanId);
    case 'getLoans': return getLoans(currentUser, payload.filter);
    case 'getActiveLoans': return getActiveLoans(currentUser);
    case 'getLoanSummary': return getLoanSummary(currentUser);

    // Pembayaran (STEP 3.9)
    case 'createPayment': return createPayment(currentUser, payload);
    case 'getPayment': return getPayment(currentUser, payload.paymentId);
    case 'getPayments': return getPayments(currentUser, payload.filter);
    case 'getLoanPayments': return getLoanPayments(currentUser, payload.loanId);
    case 'getMemberPayments': return getMemberPayments(currentUser, payload.memberId);
    case 'getPaymentSummary': return getPaymentSummary(currentUser, payload.loanId);

    // Laporan (Tahap 5)
    case 'getSavingRekapPerMember': return getSavingRekapPerMember(currentUser);
    case 'getInfaqRekapPerMember': return getInfaqRekapPerMember(currentUser);

    default:
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Aksi tidak dikenal: ' + action);
  }
}
