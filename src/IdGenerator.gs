/**
 * IdGenerator.gs
 * Pembuat ID terpusat (Tahap 2 §G / Tahap 3 §10 / Tahap 6 §4-6). TIDAK
 * mengunci sendiri — dipanggil dari dalam TransactionService.runInLock()
 * milik pemanggil (lihat Tahap 3 §9 untuk alasan menghindari nested lock).
 * Counter TIDAK PERNAH di-decrement, termasuk saat VOID — ID yang sudah
 * terpakai tidak pernah dipakai ulang (Tahap 6 §4: "ID tidak boleh berubah").
 */
function nextId(module) {
  const usesYear = ID_USES_YEAR[module];
  const prefix = ID_PREFIXES[module];
  if (!prefix) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Modul ID tidak dikenal: ' + module);
  }
  const year = new Date().getFullYear();
  // PENTING: key counter memakai PREFIX (PJ, MBR, dst.), bukan nama modul —
  // harus cocok persis dengan yang sudah diisi di sheet CONFIG (lihat
  // database/Database_Simpan_Pinjam.xlsx: COUNTER_PJ_2026, bukan
  // COUNTER_PINJAMAN_2026). Ditemukan & diperbaiki lewat test Tahap 6.
  const counterKey = usesYear ? ('COUNTER_' + prefix + '_' + year) : ('COUNTER_' + prefix);
  const current = Number(getConfigValue(counterKey)) || 0;
  const next = current + 1;
  setConfigValue(counterKey, next);
  const numberPart = padNumber(next, 5);
  return usesYear ? (prefix + '-' + year + '-' + numberPart) : (prefix + '-' + numberPart);
}
