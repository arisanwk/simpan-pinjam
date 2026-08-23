const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createMockSpreadsheet, buildGasGlobals } = require('../mocks/GasMocks');

function loadGasFile(context, file) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  vm.runInContext(code, context, { filename: file });
}

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    (ok ? 'PASS' : 'FAIL') +
      ' - ' +
      label +
      (ok ? '' : ` (dapat: ${JSON.stringify(actual)}, harap: ${JSON.stringify(expected)})`)
  );
  ok ? pass++ : fail++;
}

// ---- Siapkan mock spreadsheet dengan sheet CONFIG kosong (hanya header) ----
const mockSs = createMockSpreadsheet({
  CONFIG: ['key', 'value', 'keterangan']
});

const globals = buildGasGlobals(mockSs, { SPREADSHEET_ID: 'FAKE_SPREADSHEET_ID' });

// ErrorHandler.gs (AppError) adalah STEP terpisah dan belum dibuat.
// Stub minimal di sini HANYA untuk keperluan test STEP 3.1 ini.
globals.AppError = class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
};

const context = vm.createContext(globals);
loadGasFile(context, 'Config.gs');
loadGasFile(context, 'Utils.gs');

// Catatan teknis: top-level `const`/`let` di dalam vm context TIDAK menjadi
// properti context (hanya `var`/function declaration yang begitu) — beda
// dengan Apps Script sungguhan di mana semua deklarasi top-level di semua
// file .gs otomatis jadi satu global scope yang saling terlihat. Jadi untuk
// membaca nilai `const` (SHEET_NAMES, PINJAMAN_STATUS, dst.) dari luar,
// kita evaluasi nama variabelnya langsung di dalam context yang sama.
function readConst(name) {
  return vm.runInContext(name, context);
}

console.log('=== Utils.gs ===');
assertEqual(context.formatRupiah(10000000), 'Rp10.000.000', 'formatRupiah(10000000)');
assertEqual(context.formatRupiah(-500000), '-Rp500.000', 'formatRupiah(-500000)');
assertEqual(context.padNumber(7, 5), '00007', 'padNumber(7,5)');
assertEqual(context.formatDateISO(new Date(2026, 7, 23)), '2026-08-23', 'formatDateISO(23 Agu 2026)');
assertEqual(context.isValidEmail('admin@tvri.go.id'), true, 'isValidEmail(email valid)');
assertEqual(context.isValidEmail('bukan-email'), false, 'isValidEmail(email tidak valid)');
assertEqual(context.toPositiveNumber('12000'), 12000, 'toPositiveNumber("12000")');
assertEqual(context.toPositiveNumber('abc'), null, 'toPositiveNumber("abc") -> null, bukan NaN');
assertEqual(typeof context.generateUuid(), 'string', 'generateUuid() mengembalikan string');
assertEqual(context.generateUuid().length, 36, 'generateUuid() panjang 36 karakter');

console.log('\n=== Config.gs — konstanta (kontrak Tahap 2) ===');
assertEqual(Object.keys(readConst('SHEET_NAMES')).length, 8, 'SHEET_NAMES ada 8 entity');
assertEqual(
  readConst('PINJAMAN_STATUS'),
  {
    DIAJUKAN: 'DIAJUKAN',
    DISETUJUI: 'DISETUJUI',
    DITOLAK: 'DITOLAK',
    DICAIRKAN: 'DICAIRKAN',
    LUNAS: 'LUNAS',
    DIBATALKAN: 'DIBATALKAN'
  },
  'PINJAMAN_STATUS persis 6 nilai sesuai Tahap 2 (tanpa "AKTIF")'
);
assertEqual(readConst('ID_PREFIXES').PINJAMAN, 'PJ', 'ID_PREFIXES.PINJAMAN = "PJ"');
assertEqual(readConst('ID_PREFIXES').ANGGOTA, 'MBR', 'ID_PREFIXES.ANGGOTA = "MBR"');
assertEqual(readConst('ID_USES_YEAR').USERS, false, 'ID_USES_YEAR.USERS = false (USR- tanpa tahun)');
assertEqual(readConst('ID_USES_YEAR').PEMBAYARAN, true, 'ID_USES_YEAR.PEMBAYARAN = true (BY-YYYY-)');

console.log('\n=== Config.gs — getConfigValue / setConfigValue (via mock CONFIG sheet) ===');
assertEqual(context.getConfigValue('tahun_aktif'), null, 'getConfigValue pada sheet kosong -> null');

context.setConfigValue('tahun_aktif', 2026, 'Tahun operasional aktif');
assertEqual(context.getConfigValue('tahun_aktif'), 2026, 'getConfigValue setelah setConfigValue (create)');

context.setConfigValue('tahun_aktif', 2027);
assertEqual(context.getConfigValue('tahun_aktif'), 2027, 'setConfigValue meng-update key yang sudah ada');
assertEqual(
  mockSs._sheets.CONFIG._rows.length,
  2,
  'CONFIG tetap 2 baris (header + 1) setelah update -> tidak menduplikasi baris'
);

context.setConfigValue('nama_aplikasi', 'Simpan Pinjam TVRI');
assertEqual(context.getConfigValue('nama_aplikasi'), 'Simpan Pinjam TVRI', 'setConfigValue key kedua (create)');
assertEqual(mockSs._sheets.CONFIG._rows.length, 3, 'CONFIG jadi 3 baris setelah key kedua ditambahkan');

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
