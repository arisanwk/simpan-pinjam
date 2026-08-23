// api.js
// Satu-satunya tempat frontend berbicara ke backend (Code.gs). Semua
// pemanggilan lain di aplikasi HARUS lewat apiCall(), tidak fetch() manual
// di tempat lain -- supaya aturan CORS di bawah ini tidak pernah dilanggar
// tanpa sengaja.
//
// ATURAN CORS (lihat juga komentar di Code.gs backend):
//   - Content-Type WAJIB 'text/plain;charset=utf-8', BUKAN 'application/json'.
//     Apps Script Web App tidak bisa menjawab CORS preflight (OPTIONS) --
//     browser hanya tidak akan mengirim preflight sama sekali kalau request
//     dianggap "simple request", dan itu mensyaratkan Content-Type di atas.
//   - idToken (dari Google Identity Services) dikirim DI DALAM body JSON,
//     BUKAN sebagai header Authorization -- header custom apapun juga
//     memicu preflight yang sama gagalnya.
//   - Body tetap string JSON biasa -- backend membacanya sebagai teks lalu
//     JSON.parse() manual, jadi Content-Type yang "salah" ini tidak masalah
//     di sisi server.

async function apiCall(action, payload) {
  const body = Object.assign({ action: action }, payload || {});
  const token = getStoredIdToken();
  if (token && !body.idToken) {
    body.idToken = token;
  }

  let response;
  try {
    response = await fetch(window.APP_CONFIG.API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // lihat catatan CORS di atas
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    // Request tidak pernah sampai/kembali (offline, DNS gagal, dst.) --
    // JANGAN pernah menganggap ini berarti transaksi pasti gagal tersimpan
    // (Tahap 6 §54) -- tampilkan sebagai error koneksi, bukan "gagal".
    return { success: false, error: { code: 'CONNECTION_ERROR', message: 'Tidak dapat terhubung ke server. Silakan coba lagi.' } };
  }

  let json;
  try {
    json = await response.json();
  } catch (parseErr) {
    return { success: false, error: { code: 'CONNECTION_ERROR', message: 'Respons server tidak dikenali. Silakan coba lagi.' } };
  }
  return json;
}

// --- Penyimpanan idToken (localStorage: bertahan lintas sesi browser --
//     ditutup lalu dibuka lagi besok pun tetap ada. Token Google sendiri
//     cuma berlaku ~1 jam, jadi menyimpannya lama TIDAK cukup sendirian --
//     auth.js memakai auto-sign-in diam-diam (Google One Tap) sebagai
//     jaring pengaman begitu token tersimpan ini kedaluwarsa, lihat
//     attemptSilentSignIn() di auth.js.) ---
function getStoredIdToken() {
  return localStorage.getItem('sp_id_token') || null;
}
function setStoredIdToken(token) {
  if (token) localStorage.setItem('sp_id_token', token);
  else localStorage.removeItem('sp_id_token');
}
