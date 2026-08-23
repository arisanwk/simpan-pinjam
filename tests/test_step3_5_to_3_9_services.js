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
function assertThrows(fn, expectedCode, label) {
  try {
    fn();
    assertEqual('NO_ERROR_THROWN', expectedCode, label);
  } catch (e) {
    assertEqual(e.code, expectedCode, label);
  }
}

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_spreadsheet.json'), 'utf8'));
const mockSs = createMockSpreadsheetFromFixture(fixture);
const globals = buildGasGlobals(mockSs, { SPREADSHEET_ID: 'FAKE_ID', GOOGLE_OAUTH_CLIENT_ID: 'test-client' });
const context = vm.createContext(globals);

['Config.gs', 'Utils.gs', 'ErrorHandler.gs', 'SheetRepository.gs', 'Auth.gs', 'ValidationService.gs',
  'TransactionService.gs', 'IdGenerator.gs', 'AuditService.gs', 'CalculationService.gs', 'ReportService.gs',
  'IntegrityService.gs', 'AnggotaService.gs', 'SimpananService.gs', 'InfaqService.gs', 'PinjamanService.gs',
  'PembayaranService.gs', 'Code.gs']
  .forEach((f) => loadGasFile(context, f));

function call(fnName) {
  const args = Array.prototype.slice.call(arguments, 1);
  globals.__args = args;
  const argRefs = args.map((_, i) => `__args[${i}]`).join(',');
  return vm.runInContext(`${fnName}(${argRefs})`, context);
}

const ADMIN = { user_id: 'USR-00001', email: 'admin@tvri.go.id', nama: 'Admin', role: 'ADMIN', status: 'AKTIF' };
const PETUGAS = { user_id: 'USR-00002', email: 'petugas@tvri.go.id', nama: 'Petugas', role: 'PETUGAS', status: 'AKTIF' };
const VIEWER = { user_id: 'USR-00003', email: 'viewer@tvri.go.id', nama: 'Viewer', role: 'VIEWER', status: 'AKTIF' };

console.log('=== AnggotaService.gs ===');
const newMember = call('createMember', PETUGAS, { nomor_anggota: 'A-999', nama: 'Dewi Lestari' });
assertEqual(newMember.member_id, 'MBR-2026-00006', 'createMember() lanjut dari counter contoh (5) -> MBR-2026-00006');

assertThrows(() => call('createMember', PETUGAS, { nomor_anggota: 'A-001', nama: 'Nama Lain' }),
  'DUPLICATE_RECORD', 'createMember() menolak nomor_anggota yang sudah dipakai (A-001 milik Budi)');
assertThrows(() => call('createMember', PETUGAS, { nomor_anggota: '', nama: 'X' }),
  'VALIDATION_ERROR', 'createMember() menolak nomor_anggota kosong');
assertThrows(() => call('createMember', VIEWER, { nomor_anggota: 'A-998', nama: 'Y' }),
  'PERMISSION_DENIED', 'createMember() ditolak untuk role VIEWER');

const gotMember = call('getMember', ADMIN, newMember.member_id);
assertEqual(gotMember.nama, 'Dewi Lestari', 'getMember() mengembalikan data yang baru dibuat');
assertEqual(gotMember.savings, { wajib: 0, sukarela: 0, total: 0 }, 'getMember() anggota baru -> savings nol');

call('deactivateMember', ADMIN, newMember.member_id);
assertEqual(call('getMember', ADMIN, newMember.member_id).status, 'TIDAK AKTIF', 'deactivateMember() mengubah status jadi TIDAK AKTIF');

console.log('\n=== SimpananService.gs ===');
const saving = call('createSaving', PETUGAS, { member_id: 'MBR-2026-00002', jenis: 'WAJIB', nominal: 150000 });
assertEqual(saving.transaction_id, 'SP-2026-00006', 'createSaving() lanjut dari counter contoh (5)');
assertEqual(call('getMemberSavings', ADMIN, 'MBR-2026-00002'), { wajib: 150000, sukarela: 250000, total: 400000 },
  'Saldo Siti bertambah 150rb wajib (sebelumnya 0 wajib + 250rb sukarela)');

assertThrows(() => call('createSaving', PETUGAS, { member_id: 'MBR-2026-00002', jenis: 'WAJIB', nominal: -100 }),
  'INVALID_AMOUNT', 'createSaving() menolak nominal negatif');
assertThrows(() => call('createSaving', PETUGAS, { member_id: 'MBR-2026-00004', jenis: 'WAJIB', nominal: 100000 }),
  'VALIDATION_ERROR', 'createSaving() menolak anggota TIDAK AKTIF (Rina)');
assertThrows(() => call('createSaving', PETUGAS, { member_id: 'MBR-2026-00002', jenis: 'SALAH', nominal: 1000 }),
  'VALIDATION_ERROR', 'createSaving() menolak jenis selain WAJIB/SUKARELA');

console.log('\n=== InfaqService.gs ===');
const infaq = call('createInfaq', PETUGAS, { nominal: 75000 }); // tanpa member_id -- infaq umum
assertEqual(infaq.transaction_id, 'IF-2026-00004', 'createInfaq() tanpa member_id (donatur non-anggota) diperbolehkan');
assertEqual(call('getInfaqSummary', ADMIN).total, 350000, 'Total infaq bertambah 75rb (275rb + 75rb)');

console.log('\n=== PinjamanService.gs — siklus penuh DIAJUKAN->DISETUJUI->DICAIRKAN ===');
const loanApp = call('createLoanApplication', PETUGAS, { member_id: 'MBR-2026-00005', nominal_pengajuan: 2000000, tujuan: 'Uji coba' });
assertEqual(loanApp.loan_id, 'PJ-2026-00004', 'createLoanApplication() lanjut dari counter contoh (3)');
assertEqual(call('getLoan', ADMIN, loanApp.loan_id).status, 'DIAJUKAN', 'Status awal DIAJUKAN');

assertThrows(() => call('disburseLoan', ADMIN, loanApp.loan_id, 2000000), 'INVALID_STATUS',
  'disburseLoan() ditolak sebelum DISETUJUI (masih DIAJUKAN)');
assertThrows(() => call('approveLoan', PETUGAS, loanApp.loan_id), 'PERMISSION_DENIED',
  'approveLoan() ditolak untuk PETUGAS (hanya ADMIN, Tahap 2 §5.5)');

call('approveLoan', ADMIN, loanApp.loan_id);
assertEqual(call('getLoan', ADMIN, loanApp.loan_id).status, 'DISETUJUI', 'approveLoan() -> status DISETUJUI');

const disbursed = call('disburseLoan', ADMIN, loanApp.loan_id, 2000000);
assertEqual(disbursed.status, 'DICAIRKAN', 'disburseLoan() -> status DICAIRKAN');
assertEqual(call('getLoan', ADMIN, loanApp.loan_id).statusView, 'AKTIF', 'Label tampilan setelah dicairkan = AKTIF (bukan nilai DB)');

// Alur DITOLAK (loan kedua, terpisah)
const loanApp2 = call('createLoanApplication', PETUGAS, { member_id: 'MBR-2026-00005', nominal_pengajuan: 500000 });
assertThrows(() => call('rejectLoan', ADMIN, loanApp2.loan_id, ''), 'VALIDATION_ERROR', 'rejectLoan() wajib ada alasan');
call('rejectLoan', ADMIN, loanApp2.loan_id, 'Belum memenuhi syarat');
assertEqual(call('getLoan', ADMIN, loanApp2.loan_id).status, 'DITOLAK', 'rejectLoan() -> status DITOLAK');

console.log('\n=== PembayaranService.gs — paling kritikal ===');
assertThrows(() => call('createPayment', PETUGAS, { loan_id: loanApp.loan_id, nominal: 2500000 }),
  'PAYMENT_EXCEEDS_BALANCE', 'Overpayment DITOLAK (bayar 2.5jt utk pinjaman 2jt)');
assertThrows(() => call('createPayment', PETUGAS, { loan_id: loanApp.loan_id, nominal: 0 }),
  'INVALID_AMOUNT', 'Pembayaran Rp0 DITOLAK');
assertThrows(() => call('createPayment', PETUGAS, { loan_id: loanApp.loan_id, nominal: -500 }),
  'INVALID_AMOUNT', 'Pembayaran negatif DITOLAK');
assertThrows(() => call('createPayment', PETUGAS, { loan_id: loanApp.loan_id, member_id: 'MBR-2026-00001', nominal: 100000 }),
  'VALIDATION_ERROR', 'member_id yang tidak cocok pemilik pinjaman DITOLAK');

const pay1 = call('createPayment', PETUGAS, { loan_id: loanApp.loan_id, nominal: 800000 });
assertEqual(pay1.sisa_baru, 1200000, 'Pembayaran sebagian 800rb -> sisa 1.200.000');
assertEqual(pay1.status_pinjaman, 'DICAIRKAN', 'Status masih DICAIRKAN (belum lunas)');

const pay2 = call('createPayment', PETUGAS, { loan_id: loanApp.loan_id, nominal: 1200000 });
assertEqual(pay2.sisa_baru, 0, 'Pembayaran pelunas -> sisa 0');
assertEqual(pay2.status_pinjaman, 'LUNAS', 'Status OTOMATIS jadi LUNAS setelah sisa 0');
assertEqual(call('getLoan', ADMIN, loanApp.loan_id).status, 'LUNAS', 'getLoan() konfirmasi status LUNAS tersimpan');

assertThrows(() => call('createPayment', PETUGAS, { loan_id: loanApp.loan_id, nominal: 1 }),
  'INVALID_STATUS', 'Pembayaran Rp1 setelah LUNAS DITOLAK (pinjaman tidak lagi DICAIRKAN)');

console.log('\n=== Idempotency (Tahap 3 §11 / Tahap 6 §7) ===');
const reqId = 'REQ-TEST-DOUBLE-CLICK-001';
const loanApp3 = call('createLoanApplication', PETUGAS, { member_id: 'MBR-2026-00003', nominal_pengajuan: 1000000 });
call('approveLoan', ADMIN, loanApp3.loan_id);
call('disburseLoan', ADMIN, loanApp3.loan_id, 1000000);

const first = call('createPayment', PETUGAS, { loan_id: loanApp3.loan_id, nominal: 300000, clientRequestId: reqId });
const second = call('createPayment', PETUGAS, { loan_id: loanApp3.loan_id, nominal: 300000, clientRequestId: reqId });
assertEqual(second, first, 'Request KEDUA dengan clientRequestId SAMA -> hasil identik (bukan transaksi baru)');
const paymentsForLoan3 = call('getLoanPayments', ADMIN, loanApp3.loan_id);
assertEqual(paymentsForLoan3.length, 1, 'Hanya SATU baris PEMBAYARAN tercatat walau createPayment dipanggil 2x (klik ganda tercegah)');

console.log('\n=== Code.gs router — pastikan semua fungsi baru tersambung (bukan cuma dites langsung) ===');
function mockValidTokenFor(email) {
  globals.urlFetchMock.response = { code: 200, contentText: JSON.stringify({ aud: 'test-client', email: email, email_verified: 'true' }) };
}
function simulatePost(bodyObj) {
  globals.__e = { parameter: {}, postData: { contents: JSON.stringify(bodyObj) } };
  return JSON.parse(vm.runInContext('doPost(__e)', context).getContent());
}
mockValidTokenFor('GANTI-DENGAN-EMAIL-ADMIN-ANDA@tvri.go.id'); // persis email placeholder ADMIN di fixture USERS
const viaRouter = simulatePost({ action: 'getSavingSummary', idToken: 'sah' });
assertEqual(viaRouter.success, true, 'Router Code.gs -> getSavingSummary tersambung dgn benar');

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
