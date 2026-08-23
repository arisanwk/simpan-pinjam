const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

let pass = 0;
let fail = 0;
function assertTrue(cond, label) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label);
  cond ? pass++ : fail++;
}
function assertEqual(actual, expected, label) {
  assertTrue(JSON.stringify(actual) === JSON.stringify(expected), label +
    (JSON.stringify(actual) === JSON.stringify(expected) ? '' : ` (dapat: ${JSON.stringify(actual)}, harap: ${JSON.stringify(expected)})`));
}

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend-static');

function setupDom(currentUserObj, mockApiResponses) {
  const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND_DIR, 'index.html'), 'utf8'), {
    url: 'http://localhost/', runScripts: 'dangerously'
  });
  const context = dom.getInternalVMContext();
  dom.window.google = { accounts: { id: { initialize() {}, renderButton() {}, disableAutoSelect() {} } } };
  // Stub -- test ini fokus ke views.js, bukan alur login (sudah diuji di
  // test_frontend_connection.js). Tanpa ini, event DOMContentLoaded bawaan
  // jsdom memanggil fungsi dari auth.js yang sengaja tidak dimuat di sini.
  dom.window.tryRestoreSession = async function () {};
  dom.window.initGoogleSignIn = function () {};

  // apiCall mock: baca dari mockApiResponses[action] (function atau value tetap)
  const calls = [];
  dom.window.apiCall = async function (action, payload) {
    calls.push({ action, payload });
    const handler = mockApiResponses[action];
    if (!handler) return { success: false, error: { code: 'NOT_FOUND', message: 'no mock for ' + action } };
    return typeof handler === 'function' ? handler(payload) : handler;
  };

  ['config.js', 'views.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(FRONTEND_DIR, f), 'utf8'), context, { filename: f });
  });
  // formatRupiah/getSimpleStatusView berasal dari app.js -- muat juga (tanpa auth.js/api.js asli, cukup fungsi murni)
  const appJsCode = fs.readFileSync(path.join(FRONTEND_DIR, 'app.js'), 'utf8');
  vm.runInContext(appJsCode, context, { filename: 'app.js' });

  vm.runInContext('var currentUser = ' + JSON.stringify(currentUserObj) + ';', context);
  return { dom, context, calls };
}

async function run() {
  const ADMIN = { nama: 'Admin', role: 'ADMIN', email: 'admin@tvri.go.id' };
  const PETUGAS = { nama: 'Petugas', role: 'PETUGAS', email: 'petugas@tvri.go.id' };
  const VIEWER = { nama: 'Viewer', role: 'VIEWER', email: 'viewer@tvri.go.id' };

  console.log('=== Dashboard ===');
  {
    const { dom, context } = setupDom(ADMIN, {
      getDashboardSummary: { success: true, data: {
        totalAnggota: 5, anggotaAktif: 4, totalSimpanan: 1050000, totalSimpananWajib: 300000,
        totalSimpananSukarela: 750000, totalInfaq: 275000, totalPiutang: 5550000,
        totalPinjamanDicairkan: 15000000, totalPembayaran: 9450000, jumlahPinjamanAktif: 1, jumlahPinjamanLunas: 1
      }}
    });
    await vm.runInContext('renderDashboard()', context);
    await new Promise((r) => setTimeout(r, 10));
    const html = dom.window.document.getElementById('content-area').innerHTML;
    assertTrue(html.indexOf('Rp5.550.000') > -1, 'Dashboard menampilkan Total Piutang terformat Rupiah dengan benar');
    assertTrue(html.indexOf('Rp1.050.000') > -1, 'Dashboard menampilkan Total Simpanan');
  }

  console.log('\n=== Anggota — list + XSS escaping ===');
  {
    const { dom, context, calls } = setupDom(PETUGAS, {
      getMembers: { success: true, data: [
        { member_id: 'MBR-2026-00001', nomor_anggota: 'A-001', nama: '<script>alert(1)</script>', unit: 'IT', status: 'AKTIF' }
      ]}
    });
    await vm.runInContext('renderAnggotaList()', context);
    await new Promise((r) => setTimeout(r, 10));
    const html = dom.window.document.getElementById('content-area').innerHTML;
    assertTrue(html.indexOf('<script>alert(1)</script>') === -1, 'Nama anggota berisi <script> TIDAK dirender sebagai tag HTML aktif (XSS dicegah)');
    assertTrue(html.indexOf('&lt;script&gt;') > -1, 'Nama anggota tersimpan ter-escape sebagai teks di DOM');
    assertTrue(html.indexOf('+ Tambah Anggota') > -1, 'PETUGAS melihat tombol Tambah Anggota');
  }
  {
    const { dom, context } = setupDom(VIEWER, {
      getMembers: { success: true, data: [{ member_id: 'MBR-2026-00001', nomor_anggota: 'A-001', nama: 'Budi', unit: 'IT', status: 'AKTIF' }] }
    });
    await vm.runInContext('renderAnggotaList()', context);
    await new Promise((r) => setTimeout(r, 10));
    const html = dom.window.document.getElementById('content-area').innerHTML;
    assertTrue(html.indexOf('+ Tambah Anggota') === -1, 'VIEWER TIDAK melihat tombol Tambah Anggota (read-only)');
  }

  console.log('\n=== Simpanan — form submit terkirim dengan field yang benar ===');
  {
    const { dom, context, calls } = setupDom(PETUGAS, {
      getMembers: { success: true, data: [{ member_id: 'MBR-2026-00002', nomor_anggota: 'A-002', nama: 'Siti', status: 'AKTIF' }] },
      getSavings: { success: true, data: [] },
      createSaving: (payload) => ({ success: true, data: { transaction_id: 'SP-2026-00099' } })
    });
    await vm.runInContext('renderSimpananList()', context);
    await new Promise((r) => setTimeout(r, 10));
    dom.window.document.getElementById('btn-add-simpanan').click();
    const form = dom.window.document.getElementById('dynamic-modal-form');
    assertTrue(!!form, 'Modal form Catat Simpanan terbuka');
    form.querySelector('[name="member_id"]').value = 'MBR-2026-00002';
    form.querySelector('[name="jenis"]').value = 'WAJIB';
    form.querySelector('[name="nominal"]').value = '100000';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
    const createCall = calls.filter((c) => c.action === 'createSaving')[0];
    assertTrue(!!createCall, 'createSaving() terpanggil saat form disubmit');
    assertEqual(createCall.payload.nominal, 100000, 'Nominal dikirim sebagai NUMBER (bukan string) ke backend');
    assertEqual(createCall.payload.jenis, 'WAJIB', 'Jenis simpanan dikirim sesuai pilihan form');
    assertTrue(!!createCall.payload.clientRequestId, 'clientRequestId (idempotency key) otomatis disertakan');
  }

  console.log('\n=== Pinjaman — badge status pakai statusView dari backend, tombol aksi sesuai role ===');
  {
    const loans = [
      { loan_id: 'PJ-2026-00001', member_id: 'MBR-2026-00001', totalPinjaman: 10000000, sisa: 5550000, status: 'DICAIRKAN', statusView: 'AKTIF' },
      { loan_id: 'PJ-2026-00003', member_id: 'MBR-2026-00003', totalPinjaman: 0, sisa: 0, status: 'DIAJUKAN', statusView: 'DIAJUKAN' }
    ];
    const { dom, context } = setupDom(ADMIN, {
      getMembers: { success: true, data: [{ member_id: 'MBR-2026-00001', nomor_anggota: 'A-001', nama: 'Budi', status: 'AKTIF' }, { member_id: 'MBR-2026-00003', nomor_anggota: 'A-003', nama: 'Andi', status: 'AKTIF' }] },
      getLoans: { success: true, data: loans }
    });
    await vm.runInContext('renderPinjamanList()', context);
    await new Promise((r) => setTimeout(r, 10));
    const html = dom.window.document.getElementById('content-area').innerHTML;
    assertTrue(html.indexOf('badge-info">AKTIF') > -1, 'Pinjaman DICAIRKAN+sisa>0 tampil sebagai badge "AKTIF" (dari statusView backend)');
    assertTrue(html.indexOf('data-action="approve"') > -1, 'ADMIN melihat tombol Setujui untuk pinjaman DIAJUKAN');
    assertTrue(html.indexOf('data-action="reject"') > -1, 'ADMIN melihat tombol Tolak untuk pinjaman DIAJUKAN');
  }
  {
    const loans = [{ loan_id: 'PJ-2026-00003', member_id: 'MBR-2026-00003', totalPinjaman: 0, sisa: 0, status: 'DIAJUKAN', statusView: 'DIAJUKAN' }];
    const { dom, context } = setupDom(PETUGAS, {
      getMembers: { success: true, data: [] },
      getLoans: { success: true, data: loans }
    });
    await vm.runInContext('renderPinjamanList()', context);
    await new Promise((r) => setTimeout(r, 10));
    const html = dom.window.document.getElementById('content-area').innerHTML;
    assertTrue(html.indexOf('data-action="approve"') === -1, 'PETUGAS TIDAK melihat tombol Setujui (hanya ADMIN, Tahap 2 §5.5)');
  }

  console.log('\n=== Pembayaran — overpayment ditolak backend, pesan ditampilkan ===');
  {
    const { dom, context, calls } = setupDom(PETUGAS, {
      getMembers: { success: true, data: [{ member_id: 'MBR-2026-00001', nomor_anggota: 'A-001', nama: 'Budi', status: 'AKTIF' }] },
      getActiveLoans: { success: true, data: [{ loan_id: 'PJ-2026-00001', member_id: 'MBR-2026-00001', sisa: 5550000 }] },
      createPayment: (payload) => payload.nominal > 5550000
        ? { success: false, error: { code: 'PAYMENT_EXCEEDS_BALANCE', message: 'Pembayaran melebihi sisa pinjaman. Sisa saat ini: Rp5.550.000.' } }
        : { success: true, data: { payment_id: 'BY-2026-00099', sisa_baru: 5550000 - payload.nominal, status_pinjaman: 'DICAIRKAN' } }
    });
    await vm.runInContext('renderPembayaran()', context);
    await new Promise((r) => setTimeout(r, 10));
    dom.window.document.querySelector('[data-loan]').click();
    const form = dom.window.document.getElementById('dynamic-modal-form');
    form.querySelector('[name="nominal"]').value = '9999999';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
    assertTrue(!!dom.window.document.getElementById('dynamic-modal'),
      'Modal TETAP TERBUKA setelah overpayment ditolak (bukan optimis ditutup, Tahap 4 §47)');
    const overpayCall = calls.filter((c) => c.action === 'createPayment')[0];
    assertEqual(overpayCall.payload.nominal, 9999999, 'Nominal overpayment dikirim apa adanya ke backend (validasi di server, bukan diblokir diam-diam di client)');
  }

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail > 0 ? 1 : 0);
}

run();
