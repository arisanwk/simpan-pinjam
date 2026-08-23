/**
 * PinjamanService.gs — STEP 3.8.
 * Mesin status ketat (Tahap 2 §F.2): DIAJUKAN -> (DISETUJUI|DITOLAK),
 * DISETUJUI -> DICAIRKAN, DICAIRKAN -> LUNAS (otomatis, lihat
 * PembayaranService.createPayment). Approve/Reject/Disburse HANYA ADMIN
 * (Tahap 2 §5.5 — PIMPINAN view-only).
 */

function createLoanApplication(currentUser, payload) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS]);
  const nominalPengajuan = requirePositiveAmount(payload.nominal_pengajuan, 'Nominal pengajuan');
  const member = requireMemberActive(payload.member_id);

  return withIdempotency(currentUser, payload.clientRequestId, () => runInLock(() => {
    const loanId = nextId('PINJAMAN');
    const now = nowTimestamp();
    appendRecord(SHEET_NAMES.PINJAMAN, {
      loan_id: loanId, member_id: member.member_id,
      tanggal_pengajuan: payload.tanggal_pengajuan || now, nominal_pengajuan: nominalPengajuan,
      tanggal_persetujuan: '', tanggal_pencairan: '', nominal_pencairan: '',
      tujuan: payload.tujuan || '', status: PINJAMAN_STATUS.DIAJUKAN,
      petugas: currentUser.email, keterangan: payload.keterangan || '',
      created_at: now, updated_at: now, status_transaksi: TRANSAKSI_STATUS.NORMAL, ref_koreksi: ''
    });
    logActivityNoLock_(currentUser, 'CREATE_LOAN', SHEET_NAMES.PINJAMAN, loanId,
      formatRupiah(nominalPengajuan) + ' untuk ' + member.nama);
    return { loan_id: loanId };
  }));
}

function requireLoanInStatus_(loanId, expectedStatus) {
  const loan = findRecordById(SHEET_NAMES.PINJAMAN, 'loan_id', loanId);
  if (!loan) throw new AppError(ERROR_CODES.NOT_FOUND, 'Pinjaman tidak ditemukan: ' + loanId);
  if (loan.status !== expectedStatus) {
    throw new AppError(ERROR_CODES.INVALID_STATUS,
      'Pinjaman berstatus ' + loan.status + ', bukan ' + expectedStatus + '.');
  }
  return loan;
}

function approveLoan(currentUser, loanId) {
  requireRole(currentUser, [ROLES.ADMIN]);
  return runInLock(() => {
    const loan = requireLoanInStatus_(loanId, PINJAMAN_STATUS.DIAJUKAN);
    const now = nowTimestamp();
    updateRecordFields(SHEET_NAMES.PINJAMAN, loan._rowIndex, {
      status: PINJAMAN_STATUS.DISETUJUI, tanggal_persetujuan: now, petugas: currentUser.email, updated_at: now
    });
    logActivityNoLock_(currentUser, 'APPROVE_LOAN', SHEET_NAMES.PINJAMAN, loanId, 'Disetujui');
    return { loan_id: loanId, status: PINJAMAN_STATUS.DISETUJUI };
  });
}

function rejectLoan(currentUser, loanId, reason) {
  requireRole(currentUser, [ROLES.ADMIN]);
  if (!reason || !String(reason).trim()) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Alasan penolakan wajib diisi.');
  }
  return runInLock(() => {
    const loan = requireLoanInStatus_(loanId, PINJAMAN_STATUS.DIAJUKAN);
    const now = nowTimestamp();
    updateRecordFields(SHEET_NAMES.PINJAMAN, loan._rowIndex, {
      status: PINJAMAN_STATUS.DITOLAK, tanggal_persetujuan: now,
      petugas: currentUser.email, keterangan: reason, updated_at: now
    });
    logActivityNoLock_(currentUser, 'REJECT_LOAN', SHEET_NAMES.PINJAMAN, loanId, 'Ditolak: ' + reason);
    return { loan_id: loanId, status: PINJAMAN_STATUS.DITOLAK };
  });
}

function disburseLoan(currentUser, loanId, nominalPencairan) {
  requireRole(currentUser, [ROLES.ADMIN]);
  const nominal = requirePositiveAmount(nominalPencairan, 'Nominal pencairan');
  return runInLock(() => {
    const loan = requireLoanInStatus_(loanId, PINJAMAN_STATUS.DISETUJUI);
    const now = nowTimestamp();
    updateRecordFields(SHEET_NAMES.PINJAMAN, loan._rowIndex, {
      status: PINJAMAN_STATUS.DICAIRKAN, tanggal_pencairan: now,
      nominal_pencairan: nominal, petugas: currentUser.email, updated_at: now
    });
    logActivityNoLock_(currentUser, 'DISBURSE_LOAN', SHEET_NAMES.PINJAMAN, loanId, formatRupiah(nominal));
    return { loan_id: loanId, status: PINJAMAN_STATUS.DICAIRKAN, nominal_pencairan: nominal };
  });
}

function getLoan(currentUser, loanId) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  const loan = findRecordById(SHEET_NAMES.PINJAMAN, 'loan_id', loanId);
  if (!loan) throw new AppError(ERROR_CODES.NOT_FOUND, 'Pinjaman tidak ditemukan: ' + loanId);
  return calcLoan(loan);
}

function getLoans(currentUser, filter) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  let loans = calcAllLoans();
  if (filter) {
    if (filter.member_id) loans = loans.filter((l) => l.member_id === filter.member_id);
    if (filter.status) loans = loans.filter((l) => l.status === filter.status);
  }
  return loans;
}

function getActiveLoans(currentUser) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  return calcAllLoans().filter((l) => l.isAktif);
}

function getLoanSummary(currentUser) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  return calcCurrentBalanceSummary();
}
