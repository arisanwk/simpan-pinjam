/**
 * AuditService.gs
 * Pencatat jejak audit (Tahap 6 §36-38). Setiap pemanggilan membungkus
 * generateId+append dalam runInLock() milik sendiri (dipanggil terpisah,
 * bukan dari dalam lock service transaksi lain — lihat catatan di doPost
 * nanti: untuk operasi yang SUDAH di dalam lock transaksi, panggil
 * logActivityNoLock_() versi lock-free supaya tidak nested).
 */
function logActivity(currentUser, action, module, recordId, description) {
  return runInLock(function () {
    return logActivityNoLock_(currentUser, action, module, recordId, description);
  });
}

/** Versi lock-free — HANYA dipanggil dari dalam runInLock() milik caller lain. */
function logActivityNoLock_(currentUser, action, module, recordId, description) {
  const logId = nextId('AUDIT_LOG');
  appendRecord(SHEET_NAMES.AUDIT_LOG, {
    log_id: logId,
    timestamp: nowTimestamp(),
    user: currentUser ? currentUser.email : 'system',
    action: action,
    module: module,
    record_id: recordId,
    description: description || ''
  });
  return logId;
}
