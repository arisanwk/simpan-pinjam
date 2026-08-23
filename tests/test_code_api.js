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
const globals = buildGasGlobals(mockSs, { SPREADSHEET_ID: 'FAKE_ID', GOOGLE_OAUTH_CLIENT_ID: 'my-app.apps.googleusercontent.com' });
const context = vm.createContext(globals);

['Config.gs', 'Utils.gs', 'ErrorHandler.gs', 'SheetRepository.gs', 'Auth.gs', 'TransactionService.gs',
  'IdGenerator.gs', 'AuditService.gs', 'CalculationService.gs', 'ReportService.gs', 'IntegrityService.gs', 'Code.gs']
  .forEach((f) => loadGasFile(context, f));

/** Simulasikan endpoint tokeninfo Google membalas "token valid milik ADMIN_EMAIL". */
function mockValidTokenFor(email) {
  globals.urlFetchMock.response = {
    code: 200,
    contentText: JSON.stringify({
      aud: 'my-app.apps.googleusercontent.com',
      email: email,
      email_verified: 'true'
    })
  };
}

/** Simulasikan objek `e` yang Apps Script kirim ke doGet/doPost. */
function simulateGet(params) {
  globals.__e = { parameter: params || {} };
  return vm.runInContext('doGet(__e)', context);
}
function simulatePost(bodyObj) {
  globals.__e = { parameter: {}, postData: { contents: JSON.stringify(bodyObj) } };
  return vm.runInContext('doPost(__e)', context);
}

const ADMIN_EMAIL = 'GANTI-DENGAN-EMAIL-ADMIN-ANDA@tvri.go.id'; // persis USERS!B2 di data contoh

console.log('=== Code.gs — doGet/doPost sebagai JSON API (autentikasi via Google Identity Services) ===');

// GET tanpa action -> error terstruktur, bukan exception mentah
const noAction = simulateGet({});
const noActionBody = JSON.parse(noAction.getContent());
assertEqual(noAction.getMimeType(), 'application/json', 'Response selalu Content-Type application/json');
assertEqual(noActionBody.success, false, 'Tanpa action -> success:false');
assertEqual(noActionBody.error.code, 'VALIDATION_ERROR', 'Tanpa action -> error.code VALIDATION_ERROR');

// 'ping' adalah satu-satunya aksi publik -> tidak butuh idToken sama sekali
const pingResp = simulateGet({ action: 'ping' });
assertEqual(JSON.parse(pingResp.getContent()).data, { pong: true }, 'Aksi publik "ping" tidak butuh idToken');

// Aksi terproteksi TANPA idToken -> ditolak (bukan lagi bisa lewat currentUser mentah!)
const noTokenResp = simulatePost({ action: 'getDashboardSummary' });
assertEqual(JSON.parse(noTokenResp.getContent()).error.code, 'AUTH_ERROR',
  'getDashboardSummary TANPA idToken -> AUTH_ERROR (celah "currentUser mentah" dari desain sebelumnya sudah TERTUTUP)');

// Mencoba klaim jadi ADMIN lewat payload.currentUser langsung (skema LAMA) -> TIDAK LAGI DIPAKAI, harus tetap ditolak
const fakeAdminResp = simulatePost({ action: 'getDashboardSummary', currentUser: { role: 'ADMIN', status: 'AKTIF', email: 'siapa@saja.com' } });
assertEqual(JSON.parse(fakeAdminResp.getContent()).error.code, 'AUTH_ERROR',
  'Mengaku ADMIN lewat field currentUser di payload (tanpa idToken sah) -> TETAP DITOLAK, buktikan celah lama sudah tertutup');

// Action tidak dikenal (dengan idToken sah)
mockValidTokenFor(ADMIN_EMAIL);
const unknownAction = simulatePost({ action: 'tidakAda', idToken: 'token-sah' });
assertEqual(JSON.parse(unknownAction.getContent()).error.code, 'NOT_FOUND', 'Action tidak dikenal -> NOT_FOUND');

// Login sungguhan: token sah + email terdaftar ADMIN -> getDashboardSummary berhasil
mockValidTokenFor(ADMIN_EMAIL);
const dashResp = simulatePost({ action: 'getDashboardSummary', idToken: 'token-sah-admin' });
const dashBody = JSON.parse(dashResp.getContent());
assertEqual(dashBody.success, true, 'POST getDashboardSummary + idToken sah -> success:true');
assertEqual(dashBody.data.totalPiutang, 5550000, 'data.totalPiutang benar (konsisten dgn test sebelumnya)');

// Aksi 'login' -> frontend dapat currentUser (nama, role) setelah Sign in with Google
const loginResp = simulatePost({ action: 'login', idToken: 'token-sah-admin' });
const loginBody = JSON.parse(loginResp.getContent());
assertEqual(loginBody.data.role, 'ADMIN', 'Aksi "login" mengembalikan role user yang sudah terverifikasi');

// Token sah tapi emailnya tidak ada di USERS -> ditolak walau tokennya asli dari Google
mockValidTokenFor('orang-luar-organisasi@gmail.com');
const outsiderResp = simulatePost({ action: 'getDashboardSummary', idToken: 'token-sah-tapi-bukan-anggota' });
assertEqual(JSON.parse(outsiderResp.getContent()).error.code, 'AUTH_ERROR',
  'Token Google sah tapi email tidak terdaftar di USERS -> tetap AUTH_ERROR');

// POST reconcileLoan (aksi diagnostik admin)
mockValidTokenFor(ADMIN_EMAIL);
const reconcileResp = simulatePost({ action: 'reconcileLoan', loanId: 'PJ-2026-00002', idToken: 'token-sah' });
const reconcileBody = JSON.parse(reconcileResp.getContent());
assertEqual(reconcileBody.data.consistent, true, 'POST reconcileLoan -> hasil konsisten utk PJ-2026-00002 (LUNAS)');

// POST findOrphanRecords / findDuplicateIds
mockValidTokenFor(ADMIN_EMAIL);
assertEqual(JSON.parse(simulatePost({ action: 'findOrphanRecords', idToken: 'token-sah' }).getContent()).data, [], 'POST findOrphanRecords -> []');
mockValidTokenFor(ADMIN_EMAIL);
assertEqual(JSON.parse(simulatePost({ action: 'findDuplicateIds', idToken: 'token-sah' }).getContent()).data, [], 'POST findDuplicateIds -> []');

// Body POST bukan JSON valid -> error terstruktur, bukan crash
globals.__e = { parameter: {}, postData: { contents: '{bukan json' } };
const badJsonResp = vm.runInContext('doPost(__e)', context);
assertEqual(JSON.parse(badJsonResp.getContent()).error.code, 'VALIDATION_ERROR', 'Body POST rusak -> VALIDATION_ERROR, bukan crash 500 mentah');

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
