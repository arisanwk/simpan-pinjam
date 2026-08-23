/**
 * AnggotaService.gs — STEP 3.5.
 */

function createMember(currentUser, payload) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS]);
  const nomorAnggota = (payload.nomor_anggota || '').trim();
  const nama = (payload.nama || '').trim();
  if (!nama) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Nama wajib diisi.');
  if (!nomorAnggota) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Nomor anggota wajib diisi.');
  if (payload.email && !isValidEmail(payload.email)) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Format email tidak valid.');
  }

  return withIdempotency(currentUser, payload.clientRequestId, () => runInLock(() => {
    const duplicate = getAllRecords(SHEET_NAMES.ANGGOTA).some((a) => a.nomor_anggota === nomorAnggota);
    if (duplicate) {
      throw new AppError(ERROR_CODES.DUPLICATE_RECORD, 'Nomor anggota sudah digunakan: ' + nomorAnggota);
    }
    const memberId = nextId('ANGGOTA');
    const now = nowTimestamp();
    appendRecord(SHEET_NAMES.ANGGOTA, {
      member_id: memberId, nomor_anggota: nomorAnggota, nama: nama,
      nik_nip: payload.nik_nip || '', jenis_kelamin: payload.jenis_kelamin || '',
      unit: payload.unit || '', jabatan: payload.jabatan || '',
      no_hp: payload.no_hp || '', email: payload.email || '',
      tanggal_bergabung: payload.tanggal_bergabung || now,
      status: ANGGOTA_STATUS.AKTIF, created_at: now, updated_at: now
    });
    logActivityNoLock_(currentUser, 'CREATE_MEMBER', SHEET_NAMES.ANGGOTA, memberId, 'Anggota baru: ' + nama);
    return { member_id: memberId };
  }));
}

function getMember(currentUser, memberId) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  const member = requireMemberExists(memberId);
  return Object.assign({}, member, {
    savings: calcMemberSavings(memberId),
    infaqTotal: calcMemberInfaq(memberId),
    loans: calcMemberLoans(memberId)
  });
}

function getMembers(currentUser, filter) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  let members = getAllRecords(SHEET_NAMES.ANGGOTA);
  if (filter && filter.status) {
    members = members.filter((m) => m.status === filter.status);
  }
  return members;
}

function updateMember(currentUser, memberId, patch) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS]);
  const member = requireMemberExists(memberId);
  if (patch.email && !isValidEmail(patch.email)) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Format email tidak valid.');
  }
  // nomor_anggota SENGAJA tidak termasuk field yang bisa diubah di sini
  // (Tahap 3 §10: "nomor anggota tidak boleh berubah sembarangan").
  const allowedFields = ['nama', 'nik_nip', 'jenis_kelamin', 'unit', 'jabatan', 'no_hp', 'email'];
  const fieldsToUpdate = {};
  allowedFields.forEach((f) => {
    if (Object.prototype.hasOwnProperty.call(patch, f)) fieldsToUpdate[f] = patch[f];
  });
  fieldsToUpdate.updated_at = nowTimestamp();

  return runInLock(() => {
    updateRecordFields(SHEET_NAMES.ANGGOTA, member._rowIndex, fieldsToUpdate);
    logActivityNoLock_(currentUser, 'UPDATE_MEMBER', SHEET_NAMES.ANGGOTA, memberId, 'Update data anggota');
    return { member_id: memberId, updated: true };
  });
}

function deactivateMember(currentUser, memberId) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS]);
  const member = requireMemberExists(memberId);
  return runInLock(() => {
    updateRecordFields(SHEET_NAMES.ANGGOTA, member._rowIndex, {
      status: ANGGOTA_STATUS.TIDAK_AKTIF, updated_at: nowTimestamp()
    });
    logActivityNoLock_(currentUser, 'UPDATE_MEMBER', SHEET_NAMES.ANGGOTA, memberId, 'Anggota dinonaktifkan');
    return { member_id: memberId, status: ANGGOTA_STATUS.TIDAK_AKTIF };
  });
}

function searchMembers(currentUser, query) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];
  return getAllRecords(SHEET_NAMES.ANGGOTA).filter((m) =>
    (m.nama || '').toLowerCase().indexOf(q) > -1 ||
    (m.nomor_anggota || '').toLowerCase().indexOf(q) > -1 ||
    (m.member_id || '').toLowerCase().indexOf(q) > -1
  );
}
