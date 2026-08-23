# DEPLOYMENT.md — Aplikasi Simpan Pinjam TVRI

> **Status saat ini: TIDAK SIAP deploy ke production.** Dokumen ini berisi (A) langkah yang SUDAH bisa dilakukan sekarang, dan (B) langkah yang masih menunggu pekerjaan backend/frontend lanjutan.

## A. Yang Sudah Bisa Dilakukan Sekarang

1. **Impor spreadsheet** — ikuti `database/README.md` (upload `Database_Simpan_Pinjam.xlsx` ke Drive, buka dengan Google Sheets, ganti email admin di `USERS!B2`, catat Spreadsheet ID).
2. **Buat Apps Script project** terpisah (bound ke spreadsheet di atas, atau standalone) — belum ada `Code.gs` (entry point `doGet`/`doPost` + fungsi `include()`), jadi ini langkah lanjutan, bukan yang sudah selesai.
3. **Salin seluruh file `src/*.gs`** yang sudah ada (`Config.gs`, `Utils.gs`, `SheetRepository.gs`, `Auth.gs`, `TransactionService.gs`, `IdGenerator.gs`, `AuditService.gs`, `CalculationService.gs`, `ReportService.gs`, `IntegrityService.gs`) ke project itu, dengan nama file yang sama persis.
4. **Set Script Properties**: `SPREADSHEET_ID` = ID spreadsheet dari langkah 1.
5. **Jalankan `findOrphanRecords()`/`findDuplicateIds()`/`reconcileLoan()` manual** dari editor Apps Script (pilih fungsi → Run) untuk memvalidasi data — ini SUDAH bisa dipakai sekarang meski belum ada UI.

## B. Yang Masih Diblokir (harus selesai sebelum Web App bisa dipakai sungguhan)

| Blocker | Kenapa penting |
|---|---|
| `Code.gs` (doGet/doPost + `include()`) | Tanpa ini, `Index.html` (frontend) tidak bisa di-serve sama sekali |
| `Auth.identify()` | Tanpa ini, tidak ada yang benar-benar login — `requireRole()` yang sudah ada butuh objek user, sekarang tidak ada yang menyediakannya dari sesi asli |
| `AnggotaService`, `SimpananService`, `InfaqService`, `PinjamanService`, `PembayaranService` | Tanpa ini, aplikasi tidak bisa mencatat satupun transaksi baru |
| `ErrorHandler.gs` (`AppError` sungguhan) | Semua kode yang sudah ada masih memakai `AppError` yang di-stub di test — perlu jadi file nyata sebelum deploy |
| Frontend STEP 4.3 dst. | Halaman yang benar-benar memanggil `google.script.run` ke backend di atas belum ada |

## Deployment Checklist (Tahap 6 §60) — status jujur

```
[x] Database structure final
[ ] Backend final                 <- 6/13 STEP
[ ] Frontend final                <- 2/13 STEP
[ ] API tested                    <- sebagian (logika lokal), belum live
[ ] Permission tested              <- sebagian (read-only), belum untuk fungsi tulis
[ ] Backup tested                  <- belum ada
[ ] Restore tested                 <- belum ada
[x] Audit tested                   <- logActivity() bekerja & teruji
[ ] PDF tested                     <- belum ada
[ ] Export tested                  <- belum ada
[ ] Concurrent transaction tested  <- tidak bisa diuji dari sandbox ini
[ ] Overpayment tested             <- rumus benar, belum ada jalur REJECT nyata
[ ] VOID tested                    <- belum ada KoreksiService
[ ] Error handling tested          <- ErrorHandler.gs belum ada
[ ] Mobile tested                  <- CSS responsive ada, belum ada halaman nyata untuk diuji
[ ] Desktop tested                 <- idem
```

## Environment (§24-25)

Rencana pemisahan DEVELOPMENT/TESTING/PRODUCTION: gunakan 3 Google Spreadsheet + 3 Apps Script deployment terpisah (bukan 1 spreadsheet dengan flag environment) — supaya eksperimen di DEVELOPMENT tidak pernah bisa menyentuh data PRODUCTION secara tidak sengaja. Belum ada satupun dari ketiganya yang benar-benar dibuat; `Database_Simpan_Pinjam.xlsx` yang sudah diserahkan cocok dipakai sebagai titik awal DEVELOPMENT.

## Versioning

Lihat `CHANGELOG.md` — proyek ini belum mencapai `v1.0.0` (rilis production pertama). Versi saat ini: `v0.3.0` (lihat rincian perubahan).
