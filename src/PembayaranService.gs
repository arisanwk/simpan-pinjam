/**
 * PembayaranService.gs — STEP 3.9. Paling kritikal di seluruh backend.
 *
 * Urutan di dalam createPayment() PERSIS mengikuti Tahap 3 §15/§20:
 * validasi pinjaman -> (dalam lock) baca sisa TERBARU -> validasi ulang
 * nominal -> tulis -> update status jika lunas -> audit log. Baca sisa
 * TERJADI DI DALAM lock yang sama dengan penulisan — supaya dua pembayaran
 * hampir bersamaan tidak sama-sama lolos validasi terhadap sisa yang sudah
 * basi (race condition, Tahap 6 §9).
 */

function createPayment(currentUser, payload) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS]);
  const nominal = requirePositiveAmount(payload.nominal, 'Nominal pembayaran');

  return withIdempotency(currentUser, payload.clientRequestId, () => runInLock(() => {
    const loan = findRecordById(SHEET_NAMES.PINJAMAN, 'loan_id', payload.loan_id);
    if (!loan) throw new AppError(ERROR_CODES.NOT_FOUND, 'Pinjaman tidak ditemukan: ' + payload.loan_id);
    if (loan.status !== PINJAMAN_STATUS.DICAIRKAN) {
      throw new AppError(ERROR_CODES.INVALID_STATUS, 'Pinjaman tidak dalam status aktif untuk menerima pembayaran.');
    }
    if (payload.member_id && payload.member_id !== loan.member_id) {
      // Tahap 2 §25 / Tahap 6 §41: PEMBAYARAN.member_id wajib konsisten
      // dengan PINJAMAN.member_id — cegah pembayaran "nyasar".
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'member_id tidak cocok dengan pemilik pinjaman.');
    }

    // Baca sisa TERBARU di dalam lock (bukan dari nilai yang dikirim client).
    const computed = calcLoan(loan);
    if (nominal > computed.sisa) {
      throw new AppError(ERROR_CODES.PAYMENT_EXCEEDS_BALANCE,
        'Pembayaran melebihi sisa pinjaman. Sisa saat ini: ' + formatRupiah(computed.sisa) + '.');
    }

    const paymentId = nextId('PEMBAYARAN');
    const now = nowTimestamp();
    appendRecord(SHEET_NAMES.PEMBAYARAN, {
      payment_id: paymentId, loan_id: loan.loan_id, member_id: loan.member_id,
      tanggal: payload.tanggal || now, nominal: nominal, metode: payload.metode || 'TUNAI',
      petugas: currentUser.email, keterangan: payload.keterangan || '',
      created_at: now, status_transaksi: TRANSAKSI_STATUS.NORMAL, ref_koreksi: ''
    });

    const sisaBaru = computed.sisa - nominal;
    let statusBaru = loan.status;
    if (sisaBaru <= 0) {
      updateRecordFields(SHEET_NAMES.PINJAMAN, loan._rowIndex, { status: PINJAMAN_STATUS.LUNAS, updated_at: now });
      statusBaru = PINJAMAN_STATUS.LUNAS;
      logActivityNoLock_(currentUser, 'AUTO_LUNAS', SHEET_NAMES.PINJAMAN, loan.loan_id,
        'Otomatis LUNAS setelah pembayaran ' + paymentId);
    }
    logActivityNoLock_(currentUser, 'CREATE_PAYMENT', SHEET_NAMES.PEMBAYARAN, paymentId, formatRupiah(nominal));

    return { payment_id: paymentId, sisa_baru: Math.max(sisaBaru, 0), status_pinjaman: statusBaru };
  }));
}

function getPayment(currentUser, paymentId) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  const row = findRecordById(SHEET_NAMES.PEMBAYARAN, 'payment_id', paymentId);
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Pembayaran tidak ditemukan: ' + paymentId);
  return row;
}

function getPayments(currentUser, filter) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  let rows = getAllRecords(SHEET_NAMES.PEMBAYARAN).filter(isNormalTransaction);
  if (filter) {
    if (filter.loan_id) rows = rows.filter((r) => r.loan_id === filter.loan_id);
    if (filter.member_id) rows = rows.filter((r) => r.member_id === filter.member_id);
  }
  return rows;
}

function getLoanPayments(currentUser, loanId) {
  return getPayments(currentUser, { loan_id: loanId });
}

function getMemberPayments(currentUser, memberId) {
  return getPayments(currentUser, { member_id: memberId });
}

function getPaymentSummary(currentUser, loanId) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  const loan = findRecordById(SHEET_NAMES.PINJAMAN, 'loan_id', loanId);
  if (!loan) throw new AppError(ERROR_CODES.NOT_FOUND, 'Pinjaman tidak ditemukan: ' + loanId);
  return calcLoan(loan);
}
