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

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_spreadsheet.json'), 'utf8'));
const mockSs = createMockSpreadsheetFromFixture(fixture);
const globals = buildGasGlobals(mockSs, { SPREADSHEET_ID: 'FAKE_ID' });
globals.AppError = class AppError extends Error {
  constructor(code, message) { super(message); this.name = 'AppError'; this.code = code; }
};

const context = vm.createContext(globals);
['Config.gs', 'Utils.gs', 'SheetRepository.gs', 'Auth.gs', 'CalculationService.gs', 'ReportService.gs']
  .forEach((f) => loadGasFile(context, f));

function call(fnName) {
  const args = Array.prototype.slice.call(arguments, 1);
  globals.__args = args;
  const argRefs = args.map((_, i) => `__args[${i}]`).join(',');
  return vm.runInContext(`${fnName}(${argRefs})`, context);
}

console.log('=== STEP 3.2 — SheetRepository.gs ===');
const anggota = call('getAllRecords', 'ANGGOTA');
assertEqual(anggota.length, 5, 'getAllRecords(ANGGOTA) -> 5 baris data contoh');
assertEqual(anggota[0].member_id, 'MBR-2026-00001', 'Baris pertama ANGGOTA = MBR-2026-00001');

const budi = call('findRecordById', 'ANGGOTA', 'member_id', 'MBR-2026-00001');
assertEqual(budi.nama, 'Budi Santoso', 'findRecordById menemukan Budi Santoso');

const notFound = call('findRecordById', 'ANGGOTA', 'member_id', 'MBR-2026-99999');
assertEqual(notFound, null, 'findRecordById mengembalikan null jika tidak ditemukan');

// appendRecord + updateRecordFields terhadap sheet CONFIG (aman, tidak mengubah fixture inti)
call('appendRecord', 'CONFIG', { key: 'test_key', value: 'nilai_awal', keterangan: 'dari test' });
assertEqual(call('getConfigValue', 'test_key'), 'nilai_awal', 'appendRecord menambah baris baru di CONFIG');
const testRow = call('findRecordById', 'CONFIG', 'key', 'test_key');
call('updateRecordFields', 'CONFIG', testRow._rowIndex, { value: 'nilai_baru' });
assertEqual(call('getConfigValue', 'test_key'), 'nilai_baru', 'updateRecordFields mengubah kolom yang diminta saja');

console.log('\n=== STEP 5.1 — CalculationService.gs (terhadap data contoh ASLI dari xlsx) ===');

const savingsBudi = call('calcMemberSavings', 'MBR-2026-00001');
assertEqual(savingsBudi, { wajib: 200000, sukarela: 0, total: 200000 }, 'calcMemberSavings(Budi) = wajib 200rb (SP1+SP2)');

const savingsSiti = call('calcMemberSavings', 'MBR-2026-00002');
assertEqual(savingsSiti, { wajib: 0, sukarela: 250000, total: 250000 }, 'calcMemberSavings(Siti) = sukarela 250rb');

const totalSavings = call('calcTotalSavings');
assertEqual(totalSavings, { wajib: 300000, sukarela: 750000, total: 1050000 },
  'calcTotalSavings() = wajib 300rb + sukarela 750rb = 1.050.000');

assertEqual(call('calcMemberInfaq', 'MBR-2026-00001'), 50000, 'calcMemberInfaq(Budi) = 50.000');
assertEqual(call('calcTotalInfaq'), 275000, 'calcTotalInfaq() = 50rb+200rb(non-member)+25rb = 275.000');

const pinjamanRows = call('getAllRecords', 'PINJAMAN');
const loanPJ1 = call('calcLoan', pinjamanRows[0]);
assertEqual(loanPJ1.totalPinjaman, 10000000, 'PJ-2026-00001 totalPinjaman = 10.000.000');
assertEqual(loanPJ1.totalPembayaran, 4450000, 'PJ-2026-00001 totalPembayaran = 4.450.000 (BY9 VOID tidak dihitung, BY10 koreksinya dihitung)');
assertEqual(loanPJ1.sisa, 5550000, 'PJ-2026-00001 sisa = 5.550.000');
assertEqual(loanPJ1.isAktif, true, 'PJ-2026-00001 isAktif = true (DICAIRKAN, sisa>0)');
assertEqual(loanPJ1.statusView, 'AKTIF', 'PJ-2026-00001 statusView = "AKTIF" (label), status DB tetap DICAIRKAN');
assertEqual(loanPJ1.status, 'DICAIRKAN', 'PJ-2026-00001 status DATABASE tetap DICAIRKAN (kontrak Tahap 2 tidak berubah)');

const loanPJ2 = call('calcLoan', pinjamanRows[1]);
assertEqual(loanPJ2.totalPembayaran, 5000000, 'PJ-2026-00002 totalPembayaran = 5.000.000 (lunas)');
assertEqual(loanPJ2.sisa, 0, 'PJ-2026-00002 sisa = 0');
assertEqual(loanPJ2.isLunas, true, 'PJ-2026-00002 isLunas = true');
assertEqual(loanPJ2.isAktif, false, 'PJ-2026-00002 isAktif = false (LUNAS, bukan DICAIRKAN+sisa>0)');

const loanPJ3 = call('calcLoan', pinjamanRows[2]);
assertEqual(loanPJ3.totalPinjaman, 0, 'PJ-2026-00003 totalPinjaman = 0 (belum dicairkan, DIAJUKAN)');
assertEqual(loanPJ3.isDisbursed, false, 'PJ-2026-00003 isDisbursed = false');

console.log('\n=== STEP 5.2 — ReportService.getDashboardSummary() (Current Balance) ===');
const ADMIN_USER = { user_id: 'USR-00001', email: 'admin@tvri.go.id', nama: 'Admin', role: 'ADMIN', status: 'AKTIF' };
const dash = call('getDashboardSummary', ADMIN_USER);
assertEqual(dash.totalAnggota, 5, 'Dashboard totalAnggota = 5');
assertEqual(dash.anggotaAktif, 4, 'Dashboard anggotaAktif = 4 (Rina TIDAK AKTIF)');
assertEqual(dash.totalSimpanan, 1050000, 'Dashboard totalSimpanan = 1.050.000');
assertEqual(dash.totalInfaq, 275000, 'Dashboard totalInfaq = 275.000');
assertEqual(dash.totalPinjamanDicairkan, 15000000, 'Dashboard totalPinjamanDicairkan = 15.000.000 (PJ1+PJ2, PJ3 belum cair)');
assertEqual(dash.totalPembayaran, 9450000, 'Dashboard totalPembayaran = 9.450.000 (4.450.000 + 5.000.000)');
assertEqual(dash.totalPiutang, 5550000, 'Dashboard totalPiutang = 5.550.000 (HANYA sisa pinjaman AKTIF, PJ2 lunas tidak dihitung)');
assertEqual(dash.jumlahPinjamanAktif, 1, 'Dashboard jumlahPinjamanAktif = 1 (PJ1)');
assertEqual(dash.jumlahPinjamanLunas, 1, 'Dashboard jumlahPinjamanLunas = 1 (PJ2)');

// Permission: VIEWER tetap boleh lihat dashboard (Tahap 2 §K: semua role boleh lihat laporan)
const VIEWER_USER = { user_id: 'USR-00002', email: 'viewer@tvri.go.id', nama: 'Viewer', role: 'VIEWER', status: 'AKTIF' };
let viewerOk = true;
try { call('getDashboardSummary', VIEWER_USER); } catch (e) { viewerOk = false; }
assertEqual(viewerOk, true, 'VIEWER diizinkan memanggil getDashboardSummary (read-only, Tahap 2 §K)');

// Permission: user NONAKTIF ditolak
const NONAKTIF_USER = { user_id: 'USR-00003', email: 'x@tvri.go.id', nama: 'X', role: 'PETUGAS', status: 'NONAKTIF' };
let blocked = false;
try { call('getDashboardSummary', NONAKTIF_USER); } catch (e) { blocked = (e.code === 'AUTH_ERROR'); }
assertEqual(blocked, true, 'User berstatus NONAKTIF ditolak dengan AUTH_ERROR');

console.log('\n=== STEP 5.2 — ReportService.getPeriodReport() (Period Activity, BEDA dari Current Balance) ===');
// September 2026: hanya BY-2026-00001 (01 Sep, 500rb) & BY-2026-00002 (15 Sep, 1.5jt) yang jatuh di bulan ini.
const septReport = call('getPeriodReport', ADMIN_USER, '2026-09-01', '2026-09-30');
assertEqual(septReport.pembayaran, 2000000, 'Periode Sept 2026: pembayaran = 2.000.000 (hanya BY1+BY2, BY3/BY4 di bulan lain)');
assertEqual(septReport.simpananWajib, 0, 'Periode Sept 2026: simpananWajib = 0 (tidak ada simpanan tercatat bulan itu)');

// Buktikan Period Activity BEDA dari Current Balance (Tahap 5 §36) — total piutang TIDAK
// berubah walau kita "filter" ke periode yang tidak mencakup semua transaksi.
const dashAfterPeriodQuery = call('getDashboardSummary', ADMIN_USER);
assertEqual(dashAfterPeriodQuery.totalPiutang, 5550000,
  'Current Balance (totalPiutang) TIDAK berubah oleh query periode manapun — selalu kondisi terkini');

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
