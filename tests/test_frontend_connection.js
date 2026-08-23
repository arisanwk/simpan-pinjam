const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label +
    (ok ? '' : ` (dapat: ${JSON.stringify(actual)}, harap: ${JSON.stringify(expected)})`));
  ok ? pass++ : fail++;
}

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend-static');

const vm = require('vm');

function loadIntoWindow(dom, files) {
  const context = dom.getInternalVMContext();
  files.forEach((f) => {
    const code = fs.readFileSync(path.join(FRONTEND_DIR, f), 'utf8');
    vm.runInContext(code, context, { filename: f });
  });
}

async function run() {
  console.log('=== api.js — aturan CORS & penanganan error jaringan ===');
  {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'dangerously' });
    let capturedRequest = null;
    dom.window.fetch = async (url, options) => {
      capturedRequest = { url, options };
      return { json: async () => ({ success: true, data: { pong: true }, message: 'OK' }) };
    };
    loadIntoWindow(dom, ['config.js', 'api.js']);
    dom.window.APP_CONFIG.API_BASE_URL = 'https://script.google.com/macros/s/FAKE/exec';
    dom.window.sessionStorage.setItem('sp_id_token', 'token-contoh');

    const result = await dom.window.apiCall('ping', {});
    assertEqual(capturedRequest.options.headers['Content-Type'], 'text/plain;charset=utf-8',
      'apiCall() selalu kirim Content-Type text/plain (hindari CORS preflight yang gagal di Apps Script)');
    const sentBody = JSON.parse(capturedRequest.options.body);
    assertEqual(sentBody.action, 'ping', 'Body request berisi action yang benar');
    assertEqual(sentBody.idToken, 'token-contoh', 'idToken otomatis disertakan dari sessionStorage, TIDAK lewat header (hindari preflight)');
    assertEqual(Object.keys(capturedRequest.options.headers), ['Content-Type'], 'TIDAK ADA header custom lain (mis. Authorization) yang bisa memicu preflight');
    assertEqual(result.data.pong, true, 'Response sukses diteruskan apa adanya ke pemanggil');
  }

  {
    // Simulasikan network benar-benar putus (Tahap 6 §54) -- fetch() reject.
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'dangerously' });
    dom.window.fetch = async () => { throw new Error('network down'); };
    loadIntoWindow(dom, ['config.js', 'api.js']);

    const result = await dom.window.apiCall('getDashboardSummary', {});
    assertEqual(result.success, false, 'Network gagal -> success:false (BUKAN exception mentah yang bisa merusak UI)');
    assertEqual(result.error.code, 'CONNECTION_ERROR', 'Network gagal -> error.code CONNECTION_ERROR, bukan diam-diam dianggap gagal permanen (§54)');
  }

  console.log('\n=== app.js — filter navigasi per role (Tahap 2 §K, dirender di client) ===');
  {
    const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND_DIR, 'index.html'), 'utf8'), {
      url: 'http://localhost/', runScripts: 'dangerously'
    });
    // google.accounts.id dipakai auth.js -- stub minimal supaya app.js bisa
    // dimuat tanpa error (fokus test ini murni renderSidebar/navigasi).
    dom.window.google = { accounts: { id: { initialize() {}, renderButton() {}, disableAutoSelect() {} } } };
    dom.window.fetch = async () => ({ json: async () => ({ success: false, error: { code: 'AUTH_ERROR', message: 'no session' } }) });
    loadIntoWindow(dom, ['config.js', 'api.js', 'auth.js', 'app.js']);

    const petugas = { nama: 'Siti', role: 'PETUGAS' };
    dom.window.renderSidebar(petugas, 'dashboard');
    const html = dom.window.document.getElementById('sidebar-nav').innerHTML;
    assertEqual(html.indexOf('Pengguna') === -1, true, 'PETUGAS TIDAK melihat menu "Pengguna" (Sistem, ADMIN-only)');
    assertEqual(html.indexOf('Pengajuan') > -1, true, 'PETUGAS MELIHAT menu "Pengajuan" pinjaman');

    const pimpinan = { nama: 'Ir. Hartono', role: 'PIMPINAN' };
    dom.window.renderSidebar(pimpinan, 'dashboard');
    const htmlPimpinan = dom.window.document.getElementById('sidebar-nav').innerHTML;
    assertEqual(htmlPimpinan.indexOf('Pengajuan') === -1, true, 'PIMPINAN TIDAK melihat menu "Pengajuan" (hanya lihat, sesuai Tahap 2 §K)');
    assertEqual(htmlPimpinan.indexOf('Daftar Pinjaman') > -1, true, 'PIMPINAN tetap melihat "Daftar Pinjaman" (read-only)');

    const admin = { nama: 'Admin', role: 'ADMIN' };
    dom.window.renderSidebar(admin, 'dashboard');
    const htmlAdmin = dom.window.document.getElementById('sidebar-nav').innerHTML;
    assertEqual(htmlAdmin.indexOf('Pengguna') > -1, true, 'ADMIN melihat semua menu, termasuk "Pengguna"');
  }

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail > 0 ? 1 : 0);
}

run();
