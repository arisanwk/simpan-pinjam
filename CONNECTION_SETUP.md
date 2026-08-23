# CONNECTION_SETUP.md — Menyambungkan Spreadsheet ↔ Backend ↔ Frontend

Ini bagian yang **tidak bisa saya lakukan dari sandbox saya** — butuh akses akun Google/GitHub/Cloudflare Anda sendiri. 110 test logika sudah membuktikan kodenya benar; langkah di bawah ini membuktikannya di dunia nyata.

## 1. Deploy Apps Script Web App

1. Buka spreadsheet (`Database_Simpan_Pinjam.xlsx` yang sudah diimpor) → **Extensions → Apps Script**.
2. Salin seluruh isi `src/*.gs` yang ada sekarang (12 file: `Config, Utils, ErrorHandler, SheetRepository, Auth, TransactionService, IdGenerator, AuditService, CalculationService, ReportService, IntegrityService, Code`) sebagai file baru dengan nama persis sama.
3. **Project Settings → Script Properties**, tambahkan:
   - `SPREADSHEET_ID` = ID spreadsheet Anda (dari URL, antara `/d/` dan `/edit`)
   - `GOOGLE_OAUTH_CLIENT_ID` = (isi setelah langkah 2 di bawah selesai)
4. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (perlu ini supaya frontend eksternal bisa memanggil — otorisasi sesungguhnya tetap dijaga `verifyIdTokenAndGetUser`, bukan oleh setting ini)
5. Salin **URL Web App** yang muncul (format `https://script.google.com/macros/s/XXXXX/exec`) — dipakai di langkah 4.

## 2. Buat Google OAuth Client ID (untuk Sign in with Google)

1. [Google Cloud Console](https://console.cloud.google.com/) → buat/pilih project → **APIs & Services → Credentials**.
2. **Create Credentials → OAuth client ID → Application type: Web application**.
3. **Authorized JavaScript origins**, tambahkan:
   - Domain Cloudflare Pages Anda nanti (mis. `https://simpan-pinjam-tvri.pages.dev`)
   - `http://localhost:8080` (atau port lain) untuk pengembangan lokal
4. Salin **Client ID** yang dihasilkan (format `xxxxx-yyyy.apps.googleusercontent.com`) — **bukan** Client Secret, kita tidak butuh itu untuk alur ini.
5. Kembali ke Script Properties (langkah 1.3) dan isi `GOOGLE_OAUTH_CLIENT_ID` dengan nilai ini.

## 3. Isi `frontend-static/config.js`

```js
window.APP_CONFIG = {
  API_BASE_URL: 'https://script.google.com/macros/s/XXXXX/exec', // dari langkah 1.5
  GOOGLE_CLIENT_ID: 'xxxxx-yyyy.apps.googleusercontent.com'       // dari langkah 2.4
};
```

## 4. Isi USERS!B2 dengan email Google Anda sungguhan

Kalau belum dilakukan (lihat `database/README.md`): sel `USERS!B2` di spreadsheet harus berisi email Google **persis** yang akan Anda pakai untuk Sign in with Google — ini yang dicocokkan `verifyIdTokenAndGetUser()`.

## 5. Uji lokal SEBELUM push ke GitHub/Cloudflare

```bash
cd frontend-static
python3 -m http.server 8080
# buka http://localhost:8080
```

Coba **Sign in with Google** pakai akun yang emailnya ada di `USERS`. Kalau berhasil, sidebar & nama muncul sesuai role. Kalau gagal, buka Console browser (F12) — pesan error dari `AuthService`/`Code.gs` akan tampil di sana (bukan stack trace mentah, tapi pesan `error.message` dari backend).

## 6. Checklist verifikasi manual (menggantikan yang tidak bisa diuji dari sandbox saya)

- [ ] Sign in with Google berhasil untuk email yang terdaftar & AKTIF di USERS
- [ ] Sign in DITOLAK untuk email yang tidak ada di USERS (coba akun Google pribadi Anda yang lain)
- [ ] Sign in DITOLAK setelah `USERS.status` diubah jadi NONAKTIF untuk akun uji
- [ ] Buka DevTools → Network saat login: pastikan TIDAK ada request `OPTIONS` yang gagal (kalau ada, berarti browser memicu preflight — cek `Content-Type` di `api.js` masih `text/plain`)
- [ ] Refresh halaman setelah login: sesi harus pulih otomatis (`tryRestoreSession`) tanpa perlu klik Sign in lagi (selama token belum kedaluwarsa, ~1 jam)
- [ ] Setelah token sengaja dibuat kedaluwarsa/dihapus manual (`sessionStorage.clear()` di Console), refresh harus kembali ke layar login, bukan error mencolok

## Setelah semua checklist di atas ✅, baru lanjut ke GitHub + Cloudflare Pages

1. `git init` di root proyek (atau di `frontend-static/` saja jika backend `.gs` disimpan repo terpisah — pilihan Anda), commit, push ke GitHub.
2. Cloudflare Dashboard → **Pages → Create a project → Connect to Git** → pilih repo.
3. Build settings: **Framework preset: None**, **Build command: (kosong)**, **Build output directory: `frontend-static`** (atau `/` jika repo cuma berisi folder ini).
4. Deploy. Setelah dapat domain `*.pages.dev`, **tambahkan domain itu ke Authorized JavaScript origins** di Google Cloud Console (langkah 2.3) — kalau lupa, Sign in with Google akan gagal di production walau bekerja di localhost.

Saya belum menyusun langkah ini secara rinci (build command custom, custom domain, dst.) karena menunggu checklist di atas ✅ dulu, sesuai permintaan Anda untuk memastikan koneksi jalan lebih dulu.
