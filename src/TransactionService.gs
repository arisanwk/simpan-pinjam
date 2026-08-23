/**
 * TransactionService.gs
 * Satu-satunya titik pemanggilan LockService di seluruh backend (Tahap 3 §9:
 * menghindari nested-lock acquisition). Setiap operasi tulis yang butuh
 * konsistensi baca-lalu-tulis (ID generation, pembayaran, void, perubahan
 * status pinjaman) membungkus langkahnya lewat runInLock().
 */
function runInLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new AppError(ERROR_CODES.DATABASE_ERROR, 'Sistem sedang sibuk, coba lagi.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Idempotency (Tahap 3 §11 / Tahap 6 §7) — cegah klik ganda mencatat dua
 * transaksi. Kalau client tidak mengirim clientRequestId (klien lama/tanpa
 * dukungan ini), fn() tetap dijalankan seperti biasa — parameter ini
 * opsional, bukan syarat wajib supaya tidak mematahkan pemanggil lama.
 */
function withIdempotency(currentUser, clientRequestId, fn) {
  if (!clientRequestId) {
    return fn();
  }
  const cache = CacheService.getScriptCache();
  const key = 'idem:' + (currentUser ? currentUser.email : 'anon') + ':' + clientRequestId;
  const cached = cache.get(key);
  if (cached) {
    return JSON.parse(cached);
  }
  const result = fn();
  cache.put(key, JSON.stringify(result), 600); // TTL 10 menit
  return result;
}
