# FINAL_ACCEPTANCE_TEST.md — Aplikasi Simpan Pinjam TVRI

**Tanggal:** 23 Agustus 2026
**Lingkungan pengujian:** Sandbox lokal (Node.js, layanan Google Apps Script disimulasikan lewat mock) — **BUKAN** Apps Script/Google Sheets sungguhan. Lihat catatan keterbatasan di akhir dokumen.

## Ringkasan

**75 dari 75 test logika yang bisa dijalankan di sandbox ini — PASS, 0 FAIL.** Tapi ini bukan berarti aplikasi selesai: sebagian besar skenario yang diminta Tahap 6 (§9 concurrent test sungguhan, §22 restore test, §48 performance test, §31 direct API test terhadap endpoint yang benar-benar ter-deploy) **tidak dapat dijalankan sama sekali** dari sini karena tidak ada Apps Script/Google Sheets sungguhan yang ter-deploy, dan sebagian besar modul (CRUD Anggota/Simpanan/Infaq/Pinjaman/Pembayaran, Export, PDF, Backup) **belum ditulis**.

Lihat verdict lengkap di bagian akhir dan di pesan utama.

---

## A. Data Immutability & Transaction ID (§3-6)

| Test ID | Skenario | Expected | Actual | Status | Bukti |
|---|---|---|---|---|---|
| TEST-001 | ID transaksi tidak pernah berdasarkan nomor baris | ID dari counter tersendiri | `IdGenerator.nextId()` pakai counter di CONFIG, bukan posisi baris | **PASS** | `tests/test_tahap6_integrity_audit_id.js` |
| TEST-002 | Dua panggilan `nextId()` berturutan tidak pernah sama | ID unik | `PJ-2026-00004` ≠ `PJ-2026-00005` | **PASS** | idem |
| TEST-003 | ID tidak pernah didaur ulang setelah VOID | Counter tidak di-decrement | Tidak ada kode yang men-decrement counter (diverifikasi lewat pembacaan kode) | **PASS** (verifikasi desain) | `IdGenerator.gs` |
| TEST-004 | Transaksi keuangan tidak bisa di-hard-delete | Tidak ada fungsi `deleteRow` dipanggil pada data transaksi | `SheetRepository.gs` tidak punya fungsi delete sama sekali — hanya append & update field terbatas | **PASS** | `SheetRepository.gs` |
| TEST-005 | Edit diam-diam pada baris transaksi lama | Field selain `status_transaksi`/`ref_koreksi`/status siklus pinjaman tidak boleh berubah pasca-tulis | **Belum ada mekanisme VOID/REVERSAL nyata** (`KoreksiService`/`voidTransaction()` belum ditulis) | **NOT IMPLEMENTED** | — |

## B. Idempotency & Locking (§7-9)

| Test ID | Skenario | Expected | Actual | Status | Bukti |
|---|---|---|---|---|---|
| TEST-006 | Klik "Simpan" dua kali tidak membuat 2 transaksi | Idempotency key dicek sebelum tulis | **Desain sudah ada** (Tahap 3 §11, CacheService), **belum diimplementasikan di kode** — `PembayaranService.createPayment()` sendiri belum ditulis | **NOT IMPLEMENTED** | `Tahap3_Backend_PraCoding_Design.md` §11 |
| TEST-007 | `LockService` dipakai utk generate ID & tulis transaksi keuangan | Satu titik lock (`runInLock`) | `TransactionService.runInLock()` dibangun & dipakai `IdGenerator`/`AuditService` | **PASS (desain+kode ada)** | `TransactionService.gs` |
| TEST-008 | Concurrent payment (2 user hampir bersamaan) tidak membuat saldo salah | Saldo akhir benar, tidak race | **TIDAK BISA DIUJI DI SINI** — sandbox Node ini single-threaded per test, mock `LockService` tidak benar-benar menyerialkan proses paralel sungguhan. Butuh 2 eksekusi Apps Script nyata secara bersamaan. | **NOT TESTABLE HERE** | — |

## C. Payment Validation (§10-14)

| Test ID | Skenario | Expected | Actual | Status | Bukti |
|---|---|---|---|---|---|
| TEST-009 | Overpayment ditolak | REJECT, pesan jelas | Rumus `sisa` di `CalculationService.calcLoan()` benar dan teruji, **tapi validasi REJECT ada di `PembayaranService.createPayment()` yang belum ditulis** — jadi belum ada jalur nyata yang menolak | **NOT IMPLEMENTED** | — |
| TEST-010 | Pembayaran Rp0 ditolak | REJECT | Sama seperti di atas — validasi ini bagian dari `PembayaranService` yang belum ada | **NOT IMPLEMENTED** | — |
| TEST-011 | Pembayaran negatif ditolak | REJECT | idem | **NOT IMPLEMENTED** | — |
| TEST-012 | Nominal tersimpan sebagai integer, bukan string "Rp..." | Tipe number murni | Seluruh kolom `nominal` di `Database_Simpan_Pinjam.xlsx` bertipe Number, `formatRupiah()` hanya dipakai di lapisan tampilan | **PASS** | `database/Database_Simpan_Pinjam.xlsx`, `Utils.gs` |

## D. Calculation & Reconciliation (§15-17, §43-47)

| Test ID | Skenario | Expected | Actual | Status | Bukti |
|---|---|---|---|---|---|
| TEST-013 | Outstanding = Total Pencairan − Total Pembayaran Valid | Rumus benar, VOID dikecualikan | PJ-2026-00001: 10.000.000 − 4.450.000 = **5.550.000** (BY-00009 VOID benar dikecualikan) | **PASS** | `tests/test_step3_2_and_step5_1_5_2.js` |
| TEST-014 | `reconcileLoan()` mendeteksi status tersimpan vs terhitung berbeda | WARNING saat tidak konsisten | Pinjaman uji (lunas sekali bayar, status DB belum diupdate) terdeteksi `consistent:false` | **PASS** | `tests/test_tahap6_integrity_audit_id.js` |
| TEST-015 | 0 orphan record (Simpanan/Infaq/Pinjaman/Pembayaran → induk valid) | 0 temuan | `findOrphanRecords()` pada data contoh = **0 temuan** | **PASS** | idem |
| TEST-016 | 0 duplicate ID | 0 temuan | `findDuplicateIds()` pada data contoh = **0 temuan** | **PASS** | idem |
| TEST-017 | Dashboard vs Report vs Detail pakai rumus sama | Satu Calculation Service | `ReportService` hanya memanggil `CalculationService` — tidak ada rumus kedua di tempat lain **untuk fungsi yang sudah ada** (Dashboard, Period Report). Laporan per-modul (§12-21 Tahap 5) yang akan memakai kalkulasi Anggota/Pinjaman individual **belum ditulis**, jadi klaim "konsisten" baru berlaku untuk 2 fungsi yang ada | **PARTIAL PASS** | `CalculationService.gs`, `ReportService.gs` |
| TEST-018 | Current Balance tidak terpengaruh filter periode | Total Piutang tetap sama walau query periode berbeda | Diverifikasi eksplisit — `totalPiutang` tetap 5.550.000 setelah query `getPeriodReport()` | **PASS** | `tests/test_step3_2_and_step5_1_5_2.js` |

## E. Security (§28-35, §68)

| Test ID | Skenario | Expected | Actual | Status | Bukti |
|---|---|---|---|---|---|
| TEST-019 | Formula injection (`=IMPORTXML(...)`) dinetralkan saat ditulis | Tidak jadi formula aktif | `SheetRepository.appendRecord()` memberi prefiks `'` pada string yang diawali `=+-@` | **PASS (logika)** — **belum diverifikasi di Google Sheets sungguhan** | `tests/test_tahap6_integrity_audit_id.js` |
| TEST-020 | Privilege escalation: PETUGAS memanggil fungsi ADMIN langsung | DENY di backend, bukan cuma UI | `requireRole()` menolak role yang tidak diizinkan — teruji untuk `getDashboardSummary` (role apapun) dan user NONAKTIF. **Fungsi khusus ADMIN (approve/reject/void) belum ada untuk diuji** | **PARTIAL PASS** | `tests/test_step3_2_and_step5_1_5_2.js` |
| TEST-021 | User NONAKTIF ditolak akses | AUTH_ERROR | Teruji: `requireRole()` menolak user `status:NONAKTIF` | **PASS** | idem |
| TEST-022 | XSS lewat nama anggota (`<script>...</script>`) | Tidak dieksekusi di UI | **Tidak ada form input sungguhan yang bisa diuji** — halaman Tambah Anggota (STEP 4.5) belum dibangun. Catatan desain: Apps Script `HtmlService` men-escape otomatis lewat `<?= ?>` (bukan `<?!= ?>`) selama itu dipakai konsisten — ini BELUM diverifikasi karena belum ada kode frontend yang merender data dinamis | **NOT TESTABLE HERE / NOT IMPLEMENTED** | — |
| TEST-023 | Autentikasi Google sungguhan (`Session.getActiveUser()`) | Hanya user terdaftar & aktif bisa masuk | `Auth.identify()` (yang membaca Session & mencocokkan ke USERS) **belum ditulis** — baru `requireAuth`/`requireRole` (menerima objek user, bukan mengambil dari sesi asli) | **NOT IMPLEMENTED** | — |
| TEST-024 | Secret (SPREADSHEET_ID dkk.) tidak hardcode | Lewat Script Properties | `Config.getScriptProperty()` sudah memakai `PropertiesService`, tidak ada secret di source | **PASS (desain)** | `Config.gs` |

## F. Backup, Recovery, Performance (§18-23, §48-50)

| Test ID | Skenario | Status | Catatan |
|---|---|---|---|
| TEST-025 | Backup harian/mingguan/bulanan otomatis | **NOT IMPLEMENTED** | `BackupService.gs` belum ditulis, tidak ada trigger terpasang |
| TEST-026 | Restore test (backup → environment test → validasi) | **NOT TESTABLE HERE** | Butuh Drive & Sheets sungguhan |
| TEST-027 | Performance dengan 1.000/10.000 baris data | **NOT TESTABLE HERE** | Butuh Apps Script sungguhan ter-deploy; sandbox ini tidak mengukur kuota/waktu eksekusi Apps Script asli |

## G. Business Rules — Final Check (§69)

| Test ID | Skenario | Expected | Actual | Status |
|---|---|---|---|---|
| TEST-028 | Tidak ada kolom/field bunga, tenor, cicilan, jatuh tempo, denda di manapun | 0 ditemukan | Diperiksa manual di seluruh `src/*.gs` dan `database/Database_Simpan_Pinjam.xlsx` — **tidak ada satupun** field/fungsi terkait itu | **PASS** |
| TEST-029 | Status pinjaman tidak pernah `TERLAMBAT`/`MENUNGGAK` | Tidak ada di enum | `PINJAMAN_STATUS` di `Config.gs` persis 6 nilai, tidak ada status itu | **PASS** |
| TEST-030 | Sisa pinjaman = Total Pencairan − Total Pembayaran (murni) | Sesuai skenario §70 prompt (test manual, angka berbeda dari data contoh tapi rumus sama) | Rumus identik yang sudah teruji di TEST-013 dipakai untuk skenario manapun — dicoba dengan angka §70 (bayar 50rb+100rb+1jt+25rb+500rb+2jt=3.675.000 dari pinjaman 10jt) secara manual: hasil 6.325.000, sesuai | **PASS (verifikasi manual rumus)** |

---

## FINAL STATUS

| Area | Status |
|---|---|
| Architecture | **PASS** — konsisten Tahap 1-5, tidak ada kontradiksi ditemukan |
| Database | **PASS** — skema final sesuai kontrak, spreadsheet dibuat & tervalidasi (0 orphan/duplicate) |
| Backend | **FAIL** — 6 dari 13 STEP selesai/sebagian (Config, Utils, SheetRepository, Auth-sebagian, TransactionService, IdGenerator, AuditService, CalculationService, ReportService-sebagian); **AnggotaService, SimpananService, InfaqService, PinjamanService, PembayaranService, ErrorHandler, BackupService semuanya belum ada** |
| Frontend | **FAIL** — hanya Design System + shell statis (STEP 4.1-4.2); tidak ada halaman yang tersambung ke backend sungguhan |
| Reports | **PARTIAL** — Dashboard & Rekap Periode bekerja & teruji; 7 dari 9 jenis laporan (§3 Tahap 5) belum ditulis |
| PDF | **FAIL** — belum dibangun sama sekali |
| Security | **PARTIAL** — RBAC read-only teruji, formula-injection dinetralkan; autentikasi sungguhan, XSS pada form nyata, dan privilege-escalation pada fungsi tulis semuanya belum bisa diuji karena belum ada |
| Backup | **FAIL** — belum dibangun |
| Recovery | **FAIL** — belum dibangun, belum diuji |
| Performance | **NOT TESTED** — tidak ada deployment sungguhan untuk diukur |
| Business Rules | **PASS** — 0 pelanggaran ditemukan (tanpa bunga/cicilan/tenor/denda/jatuh tempo di manapun) |
| Acceptance Test | **FAIL** — terlalu banyak modul kritikal (pencatatan transaksi, autentikasi, backup) belum ada untuk dinyatakan lulus |

## APPLICATION STATUS: **NOT PRODUCTION READY**

### Critical Issues
1. Tidak ada satupun cara nyata mencatat transaksi (Simpanan/Infaq/Pinjaman/Pembayaran) — `*Service.gs` untuk itu semua belum ditulis.
2. Tidak ada autentikasi Google sungguhan (`Auth.identify()` belum ada) — siapapun secara teori bisa memanggil fungsi jika di-deploy tanpa ini.
3. Tidak ada backup otomatis maupun mekanisme restore.
4. Overpayment/zero/negative payment validation baru berupa rumus di `CalculationService`, **belum ada jalur yang benar-benar menolak** karena `PembayaranService` belum ada.

### High Issues
5. Idempotency baru desain, belum kode.
6. VOID/REVERSAL (`KoreksiService`) belum ada — histori transaksi belum benar-benar bisa dikoreksi.
7. XSS/HTML escaping pada form input belum bisa diverifikasi (form belum ada).

### Medium Issues
8. Export CSV/XLSX, PDF, Drive Archive — seluruhnya baru rencana desain (Tahap 5).
9. `ErrorHandler.gs` belum jadi file sungguhan — error masih ditangani ad-hoc di tiap fungsi.

### Low Issues
10. Belum ada `CHANGELOG`/versi resmi sebelum dokumen ini (diperbaiki lewat dokumen ini).
11. `nik_nip` dan beberapa field opsional di data contoh masih kosong (bukan bug, hanya belum diisi).

---

## Keterbatasan Lingkungan Pengujian (baca sebelum mempercayai angka PASS di atas)

Seluruh test "PASS" di dokumen ini dijalankan di **Node.js dengan Google Apps Script layanan disimulasikan** (`mocks/GasMocks.js`) — bukan Apps Script/Google Sheets sungguhan, karena sandbox saya tidak punya akses akun Google. Ini artinya:
- Logika (rumus, validasi, alur if/else) **teruji dan bisa dipercaya**.
- Concurrency sungguhan, kuota Apps Script, perilaku `LockService` lintas eksekusi nyata, dan performa pada data besar **tidak dan tidak bisa** diuji dari sini.
- **Wajib** dilakukan smoke test manual oleh Anda di Apps Script Editor/deployment sungguhan sebelum keputusan produksi apapun — dokumen ini bukan pengganti itu.
