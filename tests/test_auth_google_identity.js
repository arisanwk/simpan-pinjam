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
// CLIENT_ID contoh — akan diganti Client ID OAuth sungguhan saat setup nyata.
const globals = buildGasGlobals(mockSs, { SPREADSHEET_ID: 'FAKE_ID', GOOGLE_OAUTH_CLIENT_ID: 'my-app.apps.googleusercontent.com' });
const context = vm.createContext(globals);
['Config.gs', 'Utils.gs', 'ErrorHandler.gs', 'SheetRepository.gs', 'Auth.gs'].forEach((f) => loadGasFile(context, f));

function callVerify(idToken) {
  globals.__token = idToken;
  return vm.runInContext('verifyIdTokenAndGetUser(__token)', context);
}
function callVerifyExpectError(idToken, expectedCode, label) {
  try {
    callVerify(idToken);
    assertEqual('NO_ERROR_THROWN', expectedCode, label);
  } catch (e) {
    assertEqual(e.code, expectedCode, label);
  }
}

console.log('=== verifyIdTokenAndGetUser() — Auth.gs (Opsi A: Google Identity Services) ===');

// Tidak ada token sama sekali
callVerifyExpectError(null, 'AUTH_ERROR', 'Tanpa idToken -> AUTH_ERROR');
callVerifyExpectError('', 'AUTH_ERROR', 'idToken string kosong -> AUTH_ERROR');

// Token valid, email terdaftar & AKTIF di USERS (ganti dulu email di fixture
// USERS placeholder supaya cocok dgn skenario "berhasil login")
globals.urlFetchMock.response = {
  code: 200,
  contentText: JSON.stringify({
    aud: 'my-app.apps.googleusercontent.com',
    email: 'GANTI-DENGAN-EMAIL-ADMIN-ANDA@tvri.go.id', // persis email placeholder di USERS!B2
    email_verified: 'true',
    exp: String(Math.floor(Date.now() / 1000) + 3600)
  })
};
const user = callVerify('token-valid-dummy');
assertEqual(user.role, 'ADMIN', 'Token valid + email cocok USERS -> role ADMIN sesuai sheet');
assertEqual(user.status, 'AKTIF', 'currentUser.status ikut terbawa dari USERS');

// aud tidak cocok (token sah tapi utk aplikasi Google lain) -> DITOLAK
globals.urlFetchMock.response = {
  code: 200,
  contentText: JSON.stringify({
    aud: 'aplikasi-lain.apps.googleusercontent.com',
    email: 'GANTI-DENGAN-EMAIL-ADMIN-ANDA@tvri.go.id',
    email_verified: 'true'
  })
};
callVerifyExpectError('token-aud-salah', 'AUTH_ERROR', 'aud tidak cocok GOOGLE_OAUTH_CLIENT_ID -> AUTH_ERROR (cegah token confusion)');

// email_verified = false -> DITOLAK
globals.urlFetchMock.response = {
  code: 200,
  contentText: JSON.stringify({
    aud: 'my-app.apps.googleusercontent.com',
    email: 'siapa@gmail.com',
    email_verified: 'false'
  })
};
callVerifyExpectError('token-email-belum-verified', 'AUTH_ERROR', 'email_verified=false -> AUTH_ERROR');

// Email valid & verified tapi TIDAK ADA di sheet USERS -> DITOLAK
globals.urlFetchMock.response = {
  code: 200,
  contentText: JSON.stringify({
    aud: 'my-app.apps.googleusercontent.com',
    email: 'orang-luar@gmail.com',
    email_verified: 'true'
  })
};
callVerifyExpectError('token-tidak-terdaftar', 'AUTH_ERROR', 'Email valid tapi tidak ada di USERS -> AUTH_ERROR');

// Endpoint tokeninfo mengembalikan error (token kedaluwarsa/dipalsukan) -> DITOLAK
globals.urlFetchMock.response = { code: 400, contentText: JSON.stringify({ error: 'invalid_token' }) };
callVerifyExpectError('token-kedaluwarsa', 'AUTH_ERROR', 'Endpoint tokeninfo balas error (expired/invalid) -> AUTH_ERROR');

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
