/**
 * Config.gs
 * Konstanta aplikasi & akses ke sheet CONFIG + Script Properties.
 * STEP 3.1 — Tahap 3 (Backend Google Apps Script).
 *
 * Kontrak: nama sheet, prefix ID, dan enum status DI BAWAH INI mengikuti
 * persis desain Tahap 2 yang sudah disetujui. Jangan diubah tanpa
 * persetujuan eksplisit.
 */

// ---- Nama sheet (8 entity, Tahap 2 §B) ----
const SHEET_NAMES = Object.freeze({
  CONFIG: 'CONFIG',
  USERS: 'USERS',
  ANGGOTA: 'ANGGOTA',
  SIMPANAN: 'SIMPANAN',
  INFAQ: 'INFAQ',
  PINJAMAN: 'PINJAMAN',
  PEMBAYARAN: 'PEMBAYARAN',
  AUDIT_LOG: 'AUDIT_LOG'
});

// ---- Prefix ID per entity (Tahap 2 §G) ----
const ID_PREFIXES = Object.freeze({
  ANGGOTA: 'MBR',
  SIMPANAN: 'SP',
  INFAQ: 'IF',
  PINJAMAN: 'PJ',
  PEMBAYARAN: 'BY',
  USERS: 'USR',
  AUDIT_LOG: 'LOG'
});

// Entity mana yang ID-nya mengandung tahun (Tahap 2 §G)
const ID_USES_YEAR = Object.freeze({
  ANGGOTA: true,
  SIMPANAN: true,
  INFAQ: true,
  PINJAMAN: true,
  PEMBAYARAN: true,
  USERS: false,
  AUDIT_LOG: false
});

// ---- Role (Tahap 2 §C.2 / §K) ----
const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  PETUGAS: 'PETUGAS',
  PIMPINAN: 'PIMPINAN',
  VIEWER: 'VIEWER'
});

// ---- Enum status (Tahap 2 §C) ----
const ANGGOTA_STATUS = Object.freeze({ AKTIF: 'AKTIF', TIDAK_AKTIF: 'TIDAK AKTIF' });
const USER_STATUS = Object.freeze({ AKTIF: 'AKTIF', NONAKTIF: 'NONAKTIF' });
const TRANSAKSI_STATUS = Object.freeze({ NORMAL: 'NORMAL', VOID: 'VOID' });
const SIMPANAN_JENIS = Object.freeze({ WAJIB: 'WAJIB', SUKARELA: 'SUKARELA' });

// Status siklus pinjaman — PERSIS 6 nilai sesuai Tahap 2 (§C.6/§F).
// "AKTIF" SENGAJA tidak ada di sini: itu status LOGIS (DICAIRKAN AND sisa>0),
// bukan nilai kolom `status` tersendiri. Lihat catatan di dokumen pra-coding.
const PINJAMAN_STATUS = Object.freeze({
  DIAJUKAN: 'DIAJUKAN',
  DISETUJUI: 'DISETUJUI',
  DITOLAK: 'DITOLAK',
  DICAIRKAN: 'DICAIRKAN',
  LUNAS: 'LUNAS',
  DIBATALKAN: 'DIBATALKAN'
});

// ---- Error codes (Tahap 3 §23) ----
const ERROR_CODES = Object.freeze({
  AUTH_ERROR: 'AUTH_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_STATUS: 'INVALID_STATUS',
  PAYMENT_EXCEEDS_BALANCE: 'PAYMENT_EXCEEDS_BALANCE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
});

/**
 * Ambil nilai dari Script Properties — khusus secret/konfigurasi sensitif
 * (SPREADSHEET_ID, ADMIN_EMAIL, DRIVE_FOLDER_ID, dst — Tahap 3 §4).
 * Data non-secret yang bisa berubah lewat sheet CONFIG, bukan di sini.
 */
function getScriptProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Buka spreadsheet database.
 * Prioritas: SPREADSHEET_ID di Script Properties (wajib untuk deployment
 * sebagai Web App berdiri sendiri). Fallback: getActiveSpreadsheet()
 * (berguna saat script di-bound langsung ke sheet untuk pengujian manual
 * dari editor Apps Script).
 */
function getSpreadsheet() {
  const id = getScriptProperty('SPREADSHEET_ID');
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new AppError(
      ERROR_CODES.DATABASE_ERROR,
      'SPREADSHEET_ID belum diatur di Script Properties dan tidak ada spreadsheet aktif.'
    );
  }
  return active;
}

function getSheet_(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new AppError(ERROR_CODES.DATABASE_ERROR, 'Sheet "' + sheetName + '" tidak ditemukan.');
  }
  return sheet;
}

/**
 * Baca satu nilai dari sheet CONFIG (kolom: key | value | keterangan).
 * Return null jika key belum ada.
 */
function getConfigValue(key) {
  const sheet = getSheet_(SHEET_NAMES.CONFIG);
  const data = sheet.getDataRange().getValues(); // batch read
  for (let i = 1; i < data.length; i++) { // baris 0 = header
    if (data[i][0] === key) {
      return data[i][1];
    }
  }
  return null;
}

/**
 * Tulis/update satu nilai di sheet CONFIG.
 * Jika key sudah ada, baris yang sama di-update (kolom value, dan
 * keterangan jika diberikan) — tidak pernah menduplikasi baris key yang sama.
 */
function setConfigValue(key, value, keterangan) {
  const sheet = getSheet_(SHEET_NAMES.CONFIG);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value); // +1: getRange 1-indexed
      if (keterangan !== undefined) {
        sheet.getRange(i + 1, 3).setValue(keterangan);
      }
      return;
    }
  }
  sheet.appendRow([key, value, keterangan || '']);
}
