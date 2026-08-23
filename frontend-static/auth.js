// auth.js
// Login memakai Google Identity Services (GSI). Alur normal:
//   1. Tombol "Sign in with Google" dirender GSI (bukan tombol custom).
//   2. User pilih akun -> GSI panggil handleCredentialResponse() dengan
//      ID token (JWT) yang SUDAH ditandatangani Google -- frontend TIDAK
//      pernah memutuskan sendiri siapa usernya, itu murni tanggung jawab
//      Google + verifikasi backend (Auth.gs verifyIdTokenAndGetUser).
//   3. Token dikirim ke backend lewat apiCall('login', ...) untuk
//      diverifikasi & dicocokkan ke sheet USERS -- baru setelah itu
//      currentUser (nama, role) dianggap sah dan UI utama dirender.
//
// currentUser TIDAK PERNAH dipercaya dari sisi client saja -- setiap
// request lain ke backend tetap menyertakan idToken dan diverifikasi ULANG
// di server (lihat Code.gs) -- currentUser di client murni untuk keperluan
// tampilan (render menu sesuai role), bukan sumber otorisasi.
//
// "Tetap login besok tanpa klik apapun": token ID Google cuma berlaku
// ~1 jam, jadi menyimpannya lama sendirian tidak cukup. Solusinya dua
// lapis (lihat tryRestoreSession()):
//   (a) token tersimpan (localStorage) dicoba dulu -- cepat, cukup untuk
//       "buka lagi beberapa menit/jam kemudian";
//   (b) kalau sudah kedaluwarsa/tidak ada, coba Google One Tap auto-select
//       (attemptSilentSignIn()) -- selama user MASIH login Google di
//       browser/HP itu, Google akan memberi token baru tanpa user klik
//       apapun. Hanya kalau ini juga gagal (mis. sudah logout dari Google,
//       atau ganti akun), baru layar login manual (tombol) ditampilkan.

let currentUser = null;

function initGoogleSignIn() {
  // Jaga-jaga tambahan di luar perbaikan urutan <script> (lihat index.html):
  // kalau karena sesuatu hal accounts.google.com/gsi/client BENAR-BENAR belum
  // siap saat fungsi ini pertama dipanggil, coba lagi sebentar lagi alih-alih
  // gagal diam-diam (tombol tidak pernah muncul tanpa pesan apapun).
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    setTimeout(initGoogleSignIn, 200);
    return;
  }
  google.accounts.id.initialize({
    client_id: window.APP_CONFIG.GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse
  });
  google.accounts.id.renderButton(
    document.getElementById('google-signin-button'),
    { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular' }
  );
}

/**
 * Coba minta token baru dari Google TANPA menampilkan dialog pemilihan
 * akun (auto_select) -- ini yang membuat "buka besok tidak perlu login
 * lagi" bekerja, selama browser/HP masih dalam sesi Google yang sama.
 * Kalau Google TIDAK BISA/TIDAK MAU melakukan ini diam-diam (belum pernah
 * login sebelumnya, banyak akun tersedia, atau One Tap pernah ditutup
 * berkali-kali oleh user), tampilkan layar login manual sebagai fallback
 * -- ini kondisi NORMAL, bukan error.
 */
function attemptSilentSignIn() {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    setTimeout(attemptSilentSignIn, 200);
    return;
  }
  google.accounts.id.initialize({
    client_id: window.APP_CONFIG.GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: true
  });
  google.accounts.id.prompt(function (notification) {
    var silentFailed =
      (typeof notification.isNotDisplayed === 'function' && notification.isNotDisplayed()) ||
      (typeof notification.isSkippedMoment === 'function' && notification.isSkippedMoment());
    if (silentFailed) {
      showLoginScreen();
      initGoogleSignIn();
    }
  });
}

async function handleCredentialResponse(response) {
  setStoredIdToken(response.credential);
  showLoginLoading();

  const result = await apiCall('login', {});
  if (!result.success) {
    // Token dari Google sah secara mekanisme GSI, tapi backend menolaknya
    // (mis. email tidak terdaftar di USERS, atau akun dinonaktifkan) --
    // ini KEPUTUSAN SERVER, client tidak boleh mengira dirinya berhasil.
    setStoredIdToken(null);
    showLoginError(result.error.message);
    return;
  }

  currentUser = result.data;
  onLoginSuccess(currentUser);
}

/**
 * Dipanggil saat halaman dimuat. Urutan: (1) token tersimpan kalau ada &
 * masih valid -> langsung masuk, cepat; (2) kalau tidak ada/sudah
 * kedaluwarsa -> coba auto-sign-in diam-diam; (3) kalau itu juga gagal ->
 * layar login manual (ditangani di dalam attemptSilentSignIn()).
 */
async function tryRestoreSession() {
  const token = getStoredIdToken();
  if (token) {
    showLoginLoading();
    const result = await apiCall('login', {});
    if (result.success) {
      currentUser = result.data;
      onLoginSuccess(currentUser);
      return;
    }
    // Token tersimpan sudah tidak valid (kedaluwarsa ~1 jam, dst.) --
    // JANGAN tampilkan sebagai error mencolok, ini kondisi normal. Buang,
    // lalu coba jalur auto-sign-in diam-diam di bawah.
    setStoredIdToken(null);
  }
  attemptSilentSignIn();
}

function signOut() {
  setStoredIdToken(null);
  currentUser = null;
  google.accounts.id.disableAutoSelect();
  showLoginScreen();
}

// --- UI state switching (elemen HTML disiapkan di index.html) ---
function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-loading').style.display = 'none';
  document.getElementById('login-error').style.display = 'none';
}
function showLoginLoading() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-loading').style.display = 'block';
  document.getElementById('login-error').style.display = 'none';
}
function showLoginError(message) {
  const el = document.getElementById('login-error');
  el.textContent = message;
  el.style.display = 'block';
  document.getElementById('login-loading').style.display = 'none';
}
function onLoginSuccess(user) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  renderSidebar(user, 'dashboard');
  renderUserChip(user);
  renderView('dashboard');
}
