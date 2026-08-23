# CHANGELOG — Aplikasi Simpan Pinjam TVRI

Belum mencapai rilis production (`v1.0.0`). Versi di bawah menandai progres pengembangan, bukan rilis yang bisa dipakai end-to-end.

## v0.3.0 — 2026-08-23 (Tahap 6: Final Testing, Security, Backup, Deployment — sebagian)
- Ditambahkan: `TransactionService.gs` (satu titik locking), `IdGenerator.gs`, `AuditService.gs`, `IntegrityService.gs` (orphan/duplicate/reconcile check).
- Diperbaiki: bug counter ID (`IdGenerator` sempat memakai key berbasis nama modul, tidak cocok dengan key berbasis prefix yang sudah ditulis ke `CONFIG` sheet) — ditemukan lewat test, langsung diperbaiki.
- Diperbaiki (keamanan): `SheetRepository.appendRecord()` sekarang menetralkan string yang diawali `= + - @` (formula/CSV injection).
- Ditambahkan: `FINAL_ACCEPTANCE_TEST.md`, `SECURITY_REVIEW.md`, `BACKUP_RESTORE.md` (desain), `DEPLOYMENT.md`, `USER_GUIDE.md`, `ADMIN_GUIDE.md`.
- 75/75 test logika lokal PASS (lihat `FINAL_ACCEPTANCE_TEST.md` untuk keterbatasan lingkungan pengujian).
- **Status: NOT PRODUCTION READY** — lihat `FINAL_ACCEPTANCE_TEST.md`.

## v0.2.0 — 2026-08-23 (Tahap 5: Laporan & Dashboard — sebagian)
- Ditambahkan: `SheetRepository.gs` (mengisi celah STEP 3.2), `CalculationService.gs`, `ReportService.gs` (`getDashboardSummary`, `getPeriodReport`).
- Diverifikasi terhadap data contoh asli dari spreadsheet: Total Piutang, Total Simpanan/Infaq, status LUNAS/AKTIF, pemisahan Current Balance vs Period Activity.
- Laporan per-modul (Anggota/Simpanan/Infaq/Pinjaman/Pembayaran individual), Export, PDF, Drive Archive: belum dikerjakan.

## v0.1.1 — 2026-08-23 (Database)
- Ditambahkan: `database/Database_Simpan_Pinjam.xlsx` — 8 sheet sesuai kontrak Tahap 2, dropdown validasi, CONFIG+counter, data contoh.

## v0.1.0 — 2026-08-23 (Tahap 3-4: Backend awal & Frontend Design System)
- Ditambahkan: `Config.gs`, `Utils.gs` (STEP 3.1), `Auth.gs` (sebagian — helper otorisasi saja).
- Ditambahkan: `Stylesheet.html`, `Index.html`, `JavaScript.html` (STEP 4.1-4.2) — design system & layout, data masih mock.

## v0.0.1 — 2026-08-23 (Tahap 1-2: Analisis & Database Design)
- Analisis requirement, arsitektur, entity-relationship, business rules, dan desain database lengkap (data dictionary, ID strategy, sample data, test case) disetujui sebagai kontrak untuk seluruh pengembangan berikutnya.
