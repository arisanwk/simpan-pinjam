/**
 * ErrorHandler.gs
 * AppError SUNGGUHAN — sebelumnya hanya di-stub di file test. Dibutuhkan
 * Code.gs (JSON API) supaya error dari service manapun selalu berakhir
 * sebagai response terstruktur, bukan stack trace mentah ke client.
 */
class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

function jsonSuccess_(data, message) {
  return { success: true, data: data, message: message || 'OK' };
}

function jsonError_(code, message) {
  return { success: false, error: { code: code, message: message } };
}
