/**
 * ReportService.gs
 * Lapisan Service untuk laporan — tipis, hanya memanggil CalculationService
 * (Tahap 5 §39: satu Calculation Service, semua laporan pemakai). Bagian
 * dari STEP 5.2 (Dashboard Summary). Laporan per-modul (Anggota/Simpanan/
 * Infaq/Pinjaman/Pembayaran individual, §12-§21) menyusul di STEP 5.3-5.9.
 */

/**
 * Dashboard utama (Tahap 5 §6). SELALU kondisi terkini — parameter periode
 * TIDAK memengaruhi angka current-balance (totalPiutang dkk); lihat
 * getPeriodReport() untuk aktivitas dalam rentang tanggal.
 */
function getDashboardSummary(currentUser) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  return calcCurrentBalanceSummary();
}

/**
 * Laporan Rekap Periode (Tahap 5 §19) / aktivitas periode untuk filter
 * dashboard (§35 — TIDAK menggantikan current balance, lihat catatan di
 * CalculationService.gs). `startDateStr`/`endDateStr` format "YYYY-MM-DD".
 */
function getPeriodReport(currentUser, startDateStr, endDateStr) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  const start = toDate_(startDateStr);
  const end = toDate_(endDateStr);
  if (!start || !end || start > end) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Rentang tanggal tidak valid.');
  }
  // Set end ke akhir hari supaya tanggal akhir inklusif penuh (00:00 -> 23:59:59).
  end.setHours(23, 59, 59, 999);
  return calcPeriodActivitySummary(start, end);
}

/**
 * Laporan Simpanan §13 — Rekap: Anggota | Wajib | Sukarela | Total.
 * Satu baris per anggota (termasuk yang belum pernah menabung, total 0).
 */
function getSavingRekapPerMember(currentUser) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  return getAllRecords(SHEET_NAMES.ANGGOTA).map((m) => {
    const s = calcMemberSavings(m.member_id);
    return { member_id: m.member_id, nama: m.nama, wajib: s.wajib, sukarela: s.sukarela, total: s.total };
  });
}

/**
 * Laporan Infaq §14 — Rekap: Anggota | Total Infaq. Hanya anggota dengan
 * infaq > 0 (infaq dari donatur non-anggota tidak muncul di rekap PER
 * ANGGOTA ini — itu tetap masuk getInfaqSummary().total global).
 */
function getInfaqRekapPerMember(currentUser) {
  requireRole(currentUser, [ROLES.ADMIN, ROLES.PETUGAS, ROLES.PIMPINAN, ROLES.VIEWER]);
  return getAllRecords(SHEET_NAMES.ANGGOTA)
    .map((m) => ({ member_id: m.member_id, nama: m.nama, total: calcMemberInfaq(m.member_id) }))
    .filter((r) => r.total > 0);
}
