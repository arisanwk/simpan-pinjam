// config.js
// WAJIB DIISI setelah dua hal ini ada:
//   1. Apps Script Web App sudah di-deploy -> isi API_BASE_URL dengan URL
//      deployment-nya (Deploy > New deployment > Web app > Copy URL).
//   2. OAuth 2.0 Client ID sudah dibuat di Google Cloud Console (Web
//      application type, dengan "Authorized JavaScript origins" diisi
//      domain Cloudflare Pages Anda + http://localhost untuk pengembangan
//      lokal) -> isi GOOGLE_CLIENT_ID.
//
// Client ID Google TIDAK RAHASIA (aman ditaruh di kode frontend/repo
// publik) -- itu sebabnya boleh ada di sini. Yang TIDAK BOLEH pernah
// ditaruh di file ini atau di manapun di frontend: Client Secret, API key
// server-side, atau SPREADSHEET_ID (itu semua hanya boleh di Script
// Properties Apps Script, sisi server).
window.APP_CONFIG = {
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbyFaJUG2eRxrJRHok9sjSp9VVhpiwyOjRCTsKZW4REV9ARWT9Vzsuw2R3S_crWIZYZ3qw/exec',
  GOOGLE_CLIENT_ID: '792826243396-7dir5jivf17fvnc7ar0j8ros29dptuts.apps.googleusercontent.com'
};
