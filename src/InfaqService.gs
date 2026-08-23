/**
 * InfaqService.gs — STEP 3.7.
 */

function createInfaq(currentUser, payload) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS]);
  const nominal = requirePositiveAmount(payload.nominal, 'Nominal infaq');
  // member_id OPSIONAL (Tahap 2 §C.5: infaq umum dari donatur non-anggota
  // diperbolehkan) — kalau diisi, harus ada di ANGGOTA, tapi TIDAK harus
  // AKTIF (infaq bukan simpanan, tidak ada alasan menolak anggota nonaktif).
  let member = null;
  if (payload.member_id) {
    member = requireMemberExists(payload.member_id);
  }

  return withIdempotency(currentUser, payload.clientRequestId, () => runInLock(() => {
    const transactionId = nextId('INFAQ');
    const now = nowTimestamp();
    appendRecord(SHEET_NAMES.INFAQ, {
      transaction_id: transactionId, member_id: member ? member.member_id : '',
      tanggal: payload.tanggal || now, nominal: nominal, metode: payload.metode || 'TUNAI',
      petugas: currentUser.email, keterangan: payload.keterangan || '',
      created_at: now, status_transaksi: TRANSAKSI_STATUS.NORMAL, ref_koreksi: ''
    });
    logActivityNoLock_(currentUser, 'CREATE_INFAQ', SHEET_NAMES.INFAQ, transactionId, formatRupiah(nominal));
    return { transaction_id: transactionId };
  }));
}

function getInfaq(currentUser, transactionId) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  const row = findRecordById(SHEET_NAMES.INFAQ, 'transaction_id', transactionId);
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Transaksi infaq tidak ditemukan: ' + transactionId);
  return row;
}

function getInfaqList(currentUser, filter) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  let rows = getAllRecords(SHEET_NAMES.INFAQ).filter(isNormalTransaction);
  if (filter && filter.member_id) rows = rows.filter((r) => r.member_id === filter.member_id);
  return rows;
}

function getInfaqSummary(currentUser) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  return { total: calcTotalInfaq() };
}
