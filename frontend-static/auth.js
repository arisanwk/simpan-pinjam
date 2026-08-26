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
// "Tetap login lama tanpa klik apapun": token ID Google cuma berlaku ~1
// jam, dan auto-sign-in diam-diam Google (One Tap) punya batas keandalan
// sendiri di luar kendali aplikasi ini (Google membatasi seberapa sering
// itu boleh muncul otomatis) -- jadi mengandalkan itu SAJA membuat user
// diminta login ulang lebih sering dari yang seharusnya. Solusinya: sesi
// aplikasi SENDIRI yang bertahan 30 hari (SessionService.gs di backend),
// dibuat SEKALI setelah login pertama berhasil lewat Google, dipakai untuk
// SEMUA request berikutnya -- Google cuma perlu dihubungi lagi kalau sesi
// 30 hari itu sendiri sudah habis atau di-logout manual.

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

  setStoredSessionToken(result.data.sessionToken); // sesi 30 hari, lihat SessionService.gs
  currentUser = result.data;
  onLoginSuccess(currentUser);
}

/**
 * Dipanggil saat halaman dimuat. Urutan: (1) sessionToken tersimpan
 * (bertahan 30 hari -- lihat SessionService.gs) ATAU idToken Google
 * tersimpan (~1 jam) dicoba lewat SATU panggilan 'login' -- backend yang
 * memutuskan mana yang dipakai (sessionToken diutamakan, lihat
 * resolveCurrentUser_ di Auth.gs); (2) kalau keduanya sudah tidak valid,
 * coba auto-sign-in diam-diam Google; (3) baru layar login manual.
 */
async function tryRestoreSession() {
  if (getStoredSessionToken() || getStoredIdToken()) {
    showLoginLoading();
    const result = await apiCall('login', {});
    if (result.success) {
      setStoredSessionToken(result.data.sessionToken);
      currentUser = result.data;
      onLoginSuccess(currentUser);
      return;
    }
    // Baik sessionToken maupun idToken (kalau ada) sudah tidak valid lagi
    // -- JANGAN tampilkan sebagai error mencolok, ini kondisi normal
    // (sesi kedaluwarsa setelah 30 hari, atau sudah logout). Buang semua,
    // lanjut coba jalur auto-sign-in diam-diam di bawah.
    setStoredSessionToken(null);
    setStoredIdToken(null);
  }
  attemptSilentSignIn();
}

function signOut() {
  // Batalkan sesi di SERVER juga (bukan cuma buang token di client) --
  // "fire and forget", tidak perlu ditunggu supaya tombol Keluar terasa
  // instan; kalaupun request ini gagal (mis. sedang offline), token di
  // client tetap dibuang sehingga user tetap ter-logout dari sisi dia.
  apiCall('logout', { sessionToken: getStoredSessionToken() });
  setStoredSessionToken(null);
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
