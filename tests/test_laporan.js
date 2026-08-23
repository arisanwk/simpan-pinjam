const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createMockSpreadsheetFromFixture, buildGasGlobals } = require('../mocks/GasMocks');

function loadGasFile(context, file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), context, { filename: file });
}
let pass = 0, fail = 0;
function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label + (ok ? '' : ` (dapat: ${JSON.stringify(actual)}, harap: ${JSON.stringify(expected)})`));
  ok ? pass++ : fail++;
}

console.log('=== ReportService.gs — getSavingRekapPerMember / getInfaqRekapPerMember (backend) ===');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_spreadsheet.json'), 'utf8'));
const mockSs = createMockSpreadsheetFromFixture(fixture);
const globals = buildGasGlobals(mockSs, { SPREADSHEET_ID: 'FAKE_ID' });
const context = vm.createContext(globals);
['Config.gs', 'Utils.gs', 'ErrorHandler.gs', 'SheetRepository.gs', 'Auth.gs', 'CalculationService.gs', 'ReportService.gs']
  .forEach((f) => loadGasFile(context, f));
function call(fnName) {
  const args = Array.prototype.slice.call(arguments, 1);
  globals.__args = args;
  return vm.runInContext(`${fnName}(${args.map((_, i) => `__args[${i}]`).join(',')})`, context);
}
const ADMIN = { email: 'a@tvri.go.id', role: 'ADMIN', status: 'AKTIF' };

const savingRekap = call('getSavingRekapPerMember', ADMIN);
assertEqual(savingRekap.length, 5, 'getSavingRekapPerMember() -> 1 baris per anggota (5)');
const budiRow = savingRekap.filter((r) => r.member_id === 'MBR-2026-00001')[0];
assertEqual(budiRow, { member_id: 'MBR-2026-00001', nama: 'Budi Santoso', wajib: 200000, sukarela: 0, total: 200000 },
  'Rekap Budi: wajib 200rb (SP1+SP2), sukarela 0');
const rinaRow = savingRekap.filter((r) => r.member_id === 'MBR-2026-00004')[0];
assertEqual(rinaRow.total, 0, 'Anggota TIDAK AKTIF (Rina) tetap muncul di rekap dengan total 0 (bukan disembunyikan)');

const infaqRekap = call('getInfaqRekapPerMember', ADMIN);
assertEqual(infaqRekap.length, 2, 'getInfaqRekapPerMember() -> hanya 2 anggota yang punya infaq (Budi, Andi) - donatur umum tidak dihitung per-anggota');
assertEqual(infaqRekap.filter((r) => r.member_id === 'MBR-2026-00001')[0].total, 50000, 'Rekap infaq Budi = 50.000');

console.log('\n=== views.js — halaman Laporan (frontend) ===');
const { JSDOM } = require('jsdom');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend-static');
function setupDom(mockApiResponses) {
  const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND_DIR, 'index.html'), 'utf8'), { url: 'http://localhost/', runScripts: 'dangerously' });
  const ctx = dom.getInternalVMContext();
  dom.window.google = { accounts: { id: { initialize() {}, renderButton() {}, disableAutoSelect() {} } } };
  dom.window.tryRestoreSession = async function () {};
  dom.window.initGoogleSignIn = function () {};
  const calls = [];
  dom.window.apiCall = async function (action, payload) {
    calls.push({ action, payload });
    const h = mockApiResponses[action];
    if (!h) return { success: false, error: { code: 'NOT_FOUND', message: 'no mock: ' + action } };
    return typeof h === 'function' ? h(payload) : h;
  };
  ['config.js', 'views.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(FRONTEND_DIR, f), 'utf8'), ctx, { filename: f }));
  vm.runInContext(fs.readFileSync(path.join(FRONTEND_DIR, 'app.js'), 'utf8'), ctx, { filename: 'app.js' });
  vm.runInContext('var currentUser = ' + JSON.stringify({ nama: 'Admin', role: 'ADMIN' }) + ';', ctx);
  return { dom, ctx, calls };
}

async function runFrontendChecks() {
  const { dom, ctx } = setupDom({
    getMembers: { success: true, data: [{ member_id: 'MBR-2026-00001', nomor_anggota: 'A-001', nama: 'Budi', unit: 'IT', status: 'AKTIF' }] },
    getSavingRekapPerMember: { success: true, data: [{ member_id: 'MBR-2026-00001', nama: 'Budi', wajib: 200000, sukarela: 0, total: 200000 }] }
  });
  await vm.runInContext('renderLaporan()', ctx);
  await new Promise((r) => setTimeout(r, 20));
  let html = dom.window.document.getElementById('content-area').innerHTML;
  assertEqual(html.indexOf('Anggota') > -1, true, 'Halaman Laporan render, tab default (Anggota) tampil');
  assertEqual(html.indexOf('A-001') > -1, true, 'Tab Anggota menampilkan data anggota');

  // Klik tab Simpanan
  dom.window.document.querySelector('[data-laporan-tab="simpanan"]').click();
  await new Promise((r) => setTimeout(r, 20));
  html = dom.window.document.getElementById('content-area').innerHTML;
  assertEqual(html.indexOf('Rp200.000') > -1, true, 'Tab Simpanan menampilkan rekap wajib/sukarela/total terformat Rupiah');

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail > 0 ? 1 : 0);
}
runFrontendChecks();
