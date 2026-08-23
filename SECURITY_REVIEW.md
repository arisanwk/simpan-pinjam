# SECURITY_REVIEW.md — Aplikasi Simpan Pinjam TVRI

Status per area checklist Tahap 6 §68. Legenda: ✅ Diverifikasi lewat test lokal · 🔶 Sebagian/desain saja · ❌ Belum ada.

| Area | Status | Catatan |
|---|---|---|
| **Authentication** | ❌ | `Auth.identify()` (Session.getActiveUser() → cocokkan ke sheet USERS) belum ditulis. Yang ada baru `requireAuth()`/`requireRole()`, yang menerima objek user sebagai parameter — belum benar-benar mengambil identitas dari sesi Google. |
| **Authorization** | 🔶 | `requireRole()` bekerja dan teruji (role tidak sesuai → `PERMISSION_DENIED`; user `NONAKTIF` → `AUTH_ERROR`) untuk fungsi yang sudah ada (`getDashboardSummary`, `getPeriodReport`). Fungsi tulis (create/approve/void) yang paling butuh proteksi ini **belum ada untuk diuji**. |
| **Input Validation** | 🔶 | Validasi tipe/format di `CalculationService` (angka, tanggal) sudah konsisten. Validasi *penolakan* (nominal ≤0, overpayment, field wajib kosong) baru rencana — jalur nyatanya (`*Service.createXxx()`) belum ditulis. |
| **XSS** | ❌ | Tidak ada form input sungguhan untuk diuji. Catatan desain: Apps Script `HtmlService` meng-escape otomatis lewat tag `<?= ekspresi ?>` (bukan `<?!= ?>` yang tidak di-escape) — **konvensi ini perlu benar-benar dipatuhi** saat form dibangun di STEP 4.5 dst., dan diverifikasi ulang saat itu. |
| **Formula/CSV Injection** | ✅ | Ditemukan sebagai gap saat menyusun dokumen ini, langsung diperbaiki: `SheetRepository.appendRecord()` sekarang memberi prefiks apostrof pada string yang diawali `= + - @`. Diuji: nilai `=IMPORTXML(...)` tersimpan sebagai teks, bukan formula aktif. **Catatan jujur**: perilaku "prefiks apostrof mencegah formula" mengikuti dokumentasi perilaku standar Google Sheets, tapi belum diverifikasi terhadap Sheets sungguhan dari sandbox ini — verifikasi ulang saat smoke test. |
| **Secrets** | ✅ (desain) | `SPREADSHEET_ID` dkk. lewat `PropertiesService`, bukan hardcode di source. Belum ada secret sungguhan disimpan (belum ada deployment), jadi ini baru "desain benar", belum "praktik terbukti". |
| **Audit Log** | 🔶 | `AuditService.logActivity()` bekerja & teruji (ID unik per log, field user/action/module/record_id terisi benar). Belum semua aksi di §37 Tahap 6 punya pemanggil `logActivity()` karena service-nya sendiri belum ada (LOGIN, CREATE_SAVING, APPROVE_LOAN, dst.). |
| **Backup** | ❌ | Belum ada. |
| **Access Control (Sheet)** | 🔶 (desain) | Rencana proteksi sheet (Tahap 2 §7) didokumentasikan; **belum diterapkan** karena spreadsheet baru ada sebagai file lokal yang Anda unggah sendiri — proteksi Google Sheets asli perlu diaktifkan manual setelah impor (lihat `database/README.md`). |

## Formula Injection — detail temuan & perbaikan

**Sebelum:** `appendRecord()` menulis nilai apa adanya. Field bebas-teks (`keterangan` di Simpanan/Infaq/Pembayaran/Pinjaman) bisa berisi string seperti `=IMPORTXML("http://...","...")` yang berpotensi dieksekusi sebagai formula oleh Google Sheets begitu baris ditulis — celah nyata untuk data exfiltration atau formula berbahaya lain jika diinput oleh siapapun yang bisa mencatat transaksi.

**Sesudah:** setiap nilai string yang diawali `=`, `+`, `-`, atau `@` (Tahap 6 §33, mengikuti daftar karakter awal yang dikenal memicu interpretasi formula di Sheets/Excel — termasuk OWASP CSV-injection guidance) diberi prefiks apostrof sebelum ditulis. Diuji di `tests/test_tahap6_integrity_audit_id.js`.

## Rekomendasi sebelum deployment sungguhan

1. Selesaikan `Auth.identify()` — tanpa ini, authorization di atasnya (`requireRole`) tidak pernah benar-benar dipanggil dengan identitas asli.
2. Setelah `PembayaranService`/`PinjamanService` dkk. ditulis, ulangi TEST-020/TEST-022 di `FINAL_ACCEPTANCE_TEST.md` — keduanya baru bisa dinyatakan PASS sungguhan saat itu.
3. Terapkan proteksi sheet Google Sheets asli (bukan hanya xlsx) sebelum ada data produksi masuk.
4. Lakukan review keamanan ulang (bukan sekadar re-run test ini) setelah seluruh backend selesai — dokumen ini adalah snapshot kondisi sekarang, bukan sertifikasi akhir.
