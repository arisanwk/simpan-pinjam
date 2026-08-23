# Backend Simpan Pinjam — Google Apps Script

## Cara pakai src/*.gs
Salin SEMUA file di `src/` (17 file) sebagai file baru di Apps Script
Editor dengan nama yang SAMA PERSIS, lalu deploy sebagai "New version" di
deployment Web App yang sudah ada. Lihat CONNECTION_SETUP.md untuk
langkah lengkap (OAuth Client ID, Script Properties, dst.).

## Menjalankan ulang test (butuh Node.js)
    node tests/test_step3_1.js
    node tests/test_step3_2_and_step5_1_5_2.js
    node tests/test_tahap6_integrity_audit_id.js
    node tests/test_auth_google_identity.js
    node tests/test_code_api.js
    node tests/test_frontend_connection.js
    node tests/test_step3_5_to_3_9_services.js

146/146 PASS — termasuk siklus penuh pinjaman (pengajuan->approve->
cair->bayar sebagian->lunas otomatis), penolakan overpayment/nominal
invalid, dan idempotency (klik ganda tidak dobel transaksi), semua
diuji terhadap data ASLI dari database/Database_Simpan_Pinjam.xlsx.

## Progres backend (12/13 STEP)
- [x] STEP 3.1 — Config.gs + Utils.gs
- [x] STEP 3.2 — SheetRepository.gs
- [x] STEP 3.3 — Auth.gs (requireAuth/requireRole + verifyIdTokenAndGetUser
      via Google Identity Services — TERBUKTI JALAN end-to-end)
- [x] STEP 3.4 — IdGenerator.gs, AuditService.gs, ErrorHandler.gs
- [x] STEP 3.5 — AnggotaService.gs
- [x] STEP 3.6 — SimpananService.gs
- [x] STEP 3.7 — InfaqService.gs
- [x] STEP 3.8 — PinjamanService.gs
- [x] STEP 3.9 — PembayaranService.gs (+ idempotency, TransactionService.gs)
- [x] STEP 3.10 — Audit terintegrasi penuh di semua *Service create/update
- [x] (setara 3.11) — CalculationService.gs + ReportService.gs (dashboard,
      rekap periode) — laporan per-modul individual (Tahap 5 §12-21) masih
      berupa fungsi getSavings/getLoans/dst. generik, belum halaman laporan
      khusus per jenis
- [ ] STEP 3.12 — BackupService.gs (P1, belum dikerjakan)
- [ ] STEP 3.13 — Integration testing di Apps Script SUNGGUHAN (baru diuji
      lokal via mock — lakukan smoke test manual sebelum go-live penuh)

Ditambah: Code.gs (JSON API + Google Identity Services), ValidationService.gs,
IntegrityService.gs. Frontend (frontend-static/) sudah tersambung penuh —
login sungguhan sudah dikonfirmasi jalan (lihat riwayat percakapan).

## Yang BELUM tersambung ke frontend
Backend sekarang punya semua fungsi CRUD inti, tapi frontend
(frontend-static/app.js) belum punya halaman/form untuk
memanggilnya (baru shell navigasi + dashboard placeholder). Menyambungkan
tiap halaman (Anggota/Simpanan/Infaq/Pinjaman/Pembayaran) ke fungsi-fungsi
ini adalah pekerjaan lanjutan berikutnya.
