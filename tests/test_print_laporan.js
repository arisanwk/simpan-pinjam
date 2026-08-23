const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function assertTrue(cond, label) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label);
  cond ? pass++ : fail++;
}

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend-static');

function setupDom(mockApiResponses) {
  const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND_DIR, 'index.html'), 'utf8'), { url: 'http://localhost/', runScripts: 'dangerously' });
  const ctx = dom.getInternalVMContext();
  dom.window.google = { accounts: { id: { initialize() {}, renderButton() {}, disableAutoSelect() {} } } };
  dom.window.tryRestoreSession = async function () {};
  dom.window.initGoogleSignIn = function () {};
  let printCalled = false;
  dom.window.print = function () { printCalled = true; };
  const calls = [];
  dom.window.apiCall = async function (action, payload) {
    calls.push({ action, payload });
    const h = mockApiResponses[action];
    if (!h) return { success: false, error: { code: 'NOT_FOUND', message: 'no mock: ' + action } };
    return typeof h === 'function' ? h(payload) : h;
  };
  ['config.js', 'views.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(FRONTEND_DIR, f), 'utf8'), ctx, { filename: f }));
  vm.runInContext(fs.readFileSync(path.join(FRONTEND_DIR, 'app.js'), 'utf8'), ctx, { filename: 'app.js' });
  vm.runInContext('var currentUser = ' + JSON.stringify({ nama: 'Nining', email: 'admin@tvri.go.id', role: 'ADMIN' }) + ';', ctx);
  return { dom, ctx, calls, isPrintCalled: () => printCalled };
}

async function run() {
  console.log('=== Cetak Laporan ===');
  const { dom, ctx, isPrintCalled } = setupDom({
    getMembers: { success: true, data: [{ member_id: 'MBR-2026-00001', nomor_anggota: 'A-001', nama: 'Budi', unit: 'IT', status: 'AKTIF' }] }
  });
  await vm.runInContext('renderLaporan()', ctx);
  await new Promise((r) => setTimeout(r, 20));

  const printBtn = dom.window.document.getElementById('btn-cetak-laporan');
  assertTrue(!!printBtn, 'Tombol "Cetak Laporan" ada di halaman');
  assertTrue(printBtn.closest('.no-print') !== null, 'Tombol Cetak & tab ikut disembunyikan saat print (tidak muncul di hasil PDF)');

  const sidebar = dom.window.document.getElementById('sidebar-nav');
  assertTrue(sidebar.className.indexOf('no-print') > -1, 'Sidebar ditandai no-print (hilang saat dicetak)');

  printBtn.click();
  assertTrue(isPrintCalled(), 'window.print() terpanggil saat tombol Cetak diklik');

  const title = dom.window.document.getElementById('print-report-title').textContent;
  assertTrue(title === 'Laporan Anggota', 'Judul cetak terisi sesuai tab aktif ("Laporan Anggota")');

  const meta = dom.window.document.getElementById('print-report-meta').textContent;
  assertTrue(meta.indexOf('Kondisi terkini per') > -1, 'Meta cetak berisi keterangan periode/tanggal (tab non-periode)');

  const footer = dom.window.document.getElementById('print-footer-text').textContent;
  assertTrue(footer.indexOf('Nining') > -1 && footer.indexOf('admin@tvri.go.id') > -1,
    'Footer cetak berisi nama & email user yang mencetak (Tahap 5 §27: "Dicetak oleh")');

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail > 0 ? 1 : 0);
}
run();
