/**
 * IntegrityService.gs
 * Pemeriksaan integritas data untuk Final Acceptance Test (Tahap 6 §41/§42)
 * dan checklist rekonsiliasi admin (§66/§67). Dijalankan manual dari editor
 * Apps Script atau dijadwalkan (STEP lanjutan) — tidak dipanggil di jalur
 * transaksi normal (murni diagnostik, tidak mengubah data apapun).
 */

/** Cari baris yang referensinya (member_id/loan_id) tidak ada di tabel induk. */
function findOrphanRecords() {
  const anggotaIds = getAllRecords(SHEET_NAMES.ANGGOTA).map((r) => r.member_id);
  const loanIds = getAllRecords(SHEET_NAMES.PINJAMAN).map((r) => r.loan_id);
  const orphans = [];

  getAllRecords(SHEET_NAMES.SIMPANAN).forEach((r) => {
    if (r.member_id && anggotaIds.indexOf(r.member_id) === -1) {
      orphans.push({ module: 'SIMPANAN', record_id: r.transaction_id, issue: 'member_id tidak ditemukan: ' + r.member_id });
    }
  });
  getAllRecords(SHEET_NAMES.INFAQ).forEach((r) => {
    // member_id boleh kosong (infaq non-anggota, Tahap 2 §C.5) — hanya orphan jika DIISI tapi tidak valid.
    if (r.member_id && anggotaIds.indexOf(r.member_id) === -1) {
      orphans.push({ module: 'INFAQ', record_id: r.transaction_id, issue: 'member_id tidak ditemukan: ' + r.member_id });
    }
  });
  getAllRecords(SHEET_NAMES.PINJAMAN).forEach((r) => {
    if (r.member_id && anggotaIds.indexOf(r.member_id) === -1) {
      orphans.push({ module: 'PINJAMAN', record_id: r.loan_id, issue: 'member_id tidak ditemukan: ' + r.member_id });
    }
  });
  getAllRecords(SHEET_NAMES.PEMBAYARAN).forEach((r) => {
    if (r.loan_id && loanIds.indexOf(r.loan_id) === -1) {
      orphans.push({ module: 'PEMBAYARAN', record_id: r.payment_id, issue: 'loan_id tidak ditemukan: ' + r.loan_id });
    }
    const loan = getAllRecords(SHEET_NAMES.PINJAMAN).filter((l) => l.loan_id === r.loan_id)[0];
    if (loan && r.member_id !== loan.member_id) {
      orphans.push({ module: 'PEMBAYARAN', record_id: r.payment_id, issue: 'member_id (' + r.member_id + ') tidak cocok dengan PINJAMAN.member_id (' + loan.member_id + ')' });
    }
  });
  return orphans;
}

/** Cari nilai duplikat pada kolom ID (primary key) tiap sheet transaksional. */
function findDuplicateIds() {
  const checks = [
    [SHEET_NAMES.ANGGOTA, 'member_id'],
    [SHEET_NAMES.SIMPANAN, 'transaction_id'],
    [SHEET_NAMES.INFAQ, 'transaction_id'],
    [SHEET_NAMES.PINJAMAN, 'loan_id'],
    [SHEET_NAMES.PEMBAYARAN, 'payment_id']
  ];
  const duplicates = [];
  checks.forEach(function (pair) {
    const sheetName = pair[0];
    const idField = pair[1];
    const seen = {};
    getAllRecords(sheetName).forEach((r) => {
      const id = r[idField];
      seen[id] = (seen[id] || 0) + 1;
    });
    Object.keys(seen).forEach((id) => {
      if (seen[id] > 1) duplicates.push({ module: sheetName, id: id, count: seen[id] });
    });
  });
  return duplicates;
}

/**
 * Rekonsiliasi satu pinjaman: bandingkan sisa terhitung (CalculationService)
 * dengan status yang tersimpan. Tahap 6 §15/§16 — reconcileLoan().
 */
function reconcileLoan(loanId) {
  const loan = findRecordById(SHEET_NAMES.PINJAMAN, 'loan_id', loanId);
  if (!loan) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Pinjaman tidak ditemukan: ' + loanId);
  }
  const computed = calcLoan(loan);
  const expectedStatus = computed.sisa <= 0 && computed.isDisbursed ? PINJAMAN_STATUS.LUNAS : loan.status;
  const isConsistent = (loan.status === PINJAMAN_STATUS.LUNAS) === (computed.sisa <= 0 && computed.isDisbursed);
  return {
    loan_id: loanId,
    storedStatus: loan.status,
    calculatedSisa: computed.sisa,
    consistent: isConsistent,
    warning: isConsistent ? null : ('Status tersimpan (' + loan.status + ') tidak konsisten dengan sisa terhitung (' + computed.sisa + ')')
  };
}
