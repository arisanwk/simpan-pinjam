/**
 * SimpananService.gs — STEP 3.6.
 */

function createSaving(currentUser, payload) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS]);
  const nominal = requirePositiveAmount(payload.nominal, 'Nominal simpanan');
  if (payload.jenis !== SIMPANAN_JENIS.WAJIB && payload.jenis !== SIMPANAN_JENIS.SUKARELA) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Jenis simpanan harus WAJIB atau SUKARELA.');
  }
  const member = requireMemberActive(payload.member_id);

  return withIdempotency(currentUser, payload.clientRequestId, () => runInLock(() => {
    const transactionId = nextId('SIMPANAN');
    const now = nowTimestamp();
    appendRecord(SHEET_NAMES.SIMPANAN, {
      transaction_id: transactionId, member_id: member.member_id,
      tanggal: payload.tanggal || now, periode: payload.periode || '',
      jenis: payload.jenis, nominal: nominal, metode: payload.metode || 'TUNAI',
      petugas: currentUser.email, keterangan: payload.keterangan || '',
      created_at: now, status_transaksi: TRANSAKSI_STATUS.NORMAL, ref_koreksi: ''
    });
    logActivityNoLock_(currentUser, 'CREATE_SAVING', SHEET_NAMES.SIMPANAN, transactionId,
      formatRupiah(nominal) + ' (' + payload.jenis + ') untuk ' + member.nama);
    return { transaction_id: transactionId };
  }));
}

function getSaving(currentUser, transactionId) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  const row = findRecordById(SHEET_NAMES.SIMPANAN, 'transaction_id', transactionId);
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Transaksi simpanan tidak ditemukan: ' + transactionId);
  return row;
}

function getSavings(currentUser, filter) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  let rows = getAllRecords(SHEET_NAMES.SIMPANAN).filter(isNormalTransaction);
  if (filter) {
    if (filter.member_id) rows = rows.filter((r) => r.member_id === filter.member_id);
    if (filter.jenis) rows = rows.filter((r) => r.jenis === filter.jenis);
  }
  return rows;
}

function getMemberSavings(currentUser, memberId) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  return calcMemberSavings(memberId);
}

function getSavingSummary(currentUser) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  return calcTotalSavings();
}
