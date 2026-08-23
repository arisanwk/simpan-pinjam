/**
 * Auth.gs
 * requireAuth/requireRole (helper otorisasi) + verifyIdTokenAndGetUser
 * (autentikasi sungguhan via Google Identity Services — Opsi A yang dipilih
 * untuk arsitektur frontend-terpisah/Cloudflare).
 *
 * ALASAN memakai endpoint tokeninfo Google alih-alih verifikasi tanda
 * tangan JWT manual: Apps Script tidak punya library JWT/RS256 verification
 * bawaan yang praktis, sementara endpoint ini resmi didokumentasikan Google
 * untuk kebutuhan verifikasi server-side yang sederhana. Konsekuensinya:
 * setiap request butuh 1 pemanggilan UrlFetchApp tambahan (sedikit lebih
 * lambat dibanding verifikasi lokal) — dianggap sepadan untuk skala
 * aplikasi ini (Tahap 3 §20: "jangan optimasi berlebihan").
 */

function requireAuth(currentUser) {
  if (!currentUser || currentUser.status !== USER_STATUS.AKTIF) {
    throw new AppError(ERROR_CODES.AUTH_ERROR, 'Sesi tidak valid atau akun dinonaktifkan.');
  }
}

function requireRole(currentUser, allowedRoles) {
  requireAuth(currentUser);
  if (allowedRoles.indexOf(currentUser.role) === -1) {
    throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Anda tidak memiliki izin untuk aksi ini.');
  }
}

/**
 * Verifikasi ID token dari Google Identity Services (dikirim frontend
 * setiap request lewat payload.idToken — TIDAK lewat header, supaya request
 * tetap "simple request" dan tidak memicu CORS preflight yang gagal di
 * Apps Script, lihat catatan di Code.gs). Mengembalikan currentUser jika
 * valid & terdaftar; melempar AppError(AUTH_ERROR) untuk semua kasus gagal.
 */
function verifyIdTokenAndGetUser(idToken) {
  if (!idToken) {
    throw new AppError(ERROR_CODES.AUTH_ERROR, 'Token login tidak ditemukan.');
  }

  const expectedAud = getScriptProperty('GOOGLE_OAUTH_CLIENT_ID');
  if (!expectedAud) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'GOOGLE_OAUTH_CLIENT_ID belum diatur di Script Properties.');
  }

  const claims = fetchTokenInfo_(idToken);

  if (claims.aud !== expectedAud) {
    // Mencegah "token confusion": ID token sah tapi diterbitkan untuk
    // aplikasi Google lain tidak boleh diterima di sini.
    throw new AppError(ERROR_CODES.AUTH_ERROR, 'Token tidak valid untuk aplikasi ini.');
  }
  if (claims.email_verified !== 'true' && claims.email_verified !== true) {
    throw new AppError(ERROR_CODES.AUTH_ERROR, 'Email Google belum terverifikasi.');
  }

  const userRow = findRecordById(SHEET_NAMES.USERS, 'email', claims.email);
  if (!userRow) {
    throw new AppError(ERROR_CODES.AUTH_ERROR, 'Email tidak terdaftar sebagai pengguna aplikasi: ' + claims.email);
  }
  if (userRow.status !== USER_STATUS.AKTIF) {
    throw new AppError(ERROR_CODES.AUTH_ERROR, 'Akun dinonaktifkan.');
  }

  return {
    user_id: userRow.user_id,
    email: userRow.email,
    nama: userRow.nama,
    role: userRow.role,
    status: userRow.status
  };
}

/** Panggil endpoint tokeninfo Google. Melempar AUTH_ERROR untuk token tidak valid/kedaluwarsa. */
function fetchTokenInfo_(idToken) {
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  let body;
  try {
    body = JSON.parse(response.getContentText());
  } catch (err) {
    throw new AppError(ERROR_CODES.AUTH_ERROR, 'Respons verifikasi token tidak valid.');
  }
  if (response.getResponseCode() !== 200) {
    throw new AppError(ERROR_CODES.AUTH_ERROR, 'Token login tidak valid atau sudah kedaluwarsa.');
  }
  return body;
}
