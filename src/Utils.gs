/**
 * Utils.gs
 * Helper murni — tidak bergantung pada SpreadsheetApp/LockService/dst,
 * sehingga bisa diuji lepas dari layanan Google. STEP 3.1.
 */

/** Format angka jadi "Rp10.000.000". Nominal negatif -> "-Rp500.000". */
function formatRupiah(number) {
  const n = Math.round(Number(number) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n).toString();
  const withDots = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + 'Rp' + withDots;
}

/** Pad angka jadi string sepanjang `length` dengan nol di depan. 7 -> "00007". */
function padNumber(num, length) {
  return String(num).padStart(length, '0');
}

/** Format Date jadi "YYYY-MM-DD". */
function formatDateISO(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = padNumber(d.getMonth() + 1, 2);
  const dd = padNumber(d.getDate(), 2);
  return yyyy + '-' + mm + '-' + dd;
}

/** Validasi format email ringan (untuk field opsional seperti ANGGOTA.email). */
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Parse ke number; return null (bukan NaN) jika tidak valid — memudahkan pengecekan. */
function toPositiveNumber(value) {
  const n = Number(value);
  if (isNaN(n)) return null;
  return n;
}

function nowTimestamp() {
  return new Date();
}

/**
 * UUID v4 sederhana. Dipakai sebagai idempotency key fallback (server-side,
 * jika client tidak mengirim client_request_id) dan sebagai request_id di
 * logging (lihat dokumen pra-coding §11 Concurrency/Idempotency).
 * Catatan: berbasis Math.random() — cukup untuk idempotency key/request id,
 * BUKAN untuk kebutuhan kriptografis/secret.
 */
function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
