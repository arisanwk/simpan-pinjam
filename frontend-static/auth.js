// auth.js
// Login memakai Google Identity Services (GSI). Alur:
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

/** Dipanggil saat halaman dimuat -- coba pulihkan sesi dari token tersimpan. */
async function tryRestoreSession() {
  const token = getStoredIdToken();
  if (!token) {
    showLoginScreen();
    return;
  }
  showLoginLoading();
  const result = await apiCall('login', {});
  if (!result.success) {
    // Token kedaluwarsa (~1 jam) atau tidak valid lagi -- minta login ulang,
    // JANGAN tampilkan sebagai error mencolok, ini kondisi normal.
    setStoredIdToken(null);
    showLoginScreen();
    return;
  }
  currentUser = result.data;
  onLoginSuccess(currentUser);
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
