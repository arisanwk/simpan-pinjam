# Frontend — Simpan Pinjam (Tahap 4)

## src/ — file untuk Apps Script HTML Service
Salin Stylesheet.html, JavaScript.html, Index.html sebagai file HTML baru
di Apps Script Editor (nama file harus sama persis). Index.html memakai
`<?!= include('Stylesheet'); ?>` dan `<?!= include('JavaScript'); ?>` —
fungsi `include()` akan ditambahkan di Code.gs saat backend STEP 3.2+
dibangun (belum ada saat ini).

Status: MASIH memakai MOCK_CURRENT_USER (lihat komentar "TODO(backend)"
di JavaScript.html) karena Auth.gs (STEP 3.3) belum dibangun.

## preview/preview.html — untuk direview sekarang
File mandiri (bisa dibuka langsung di browser mana pun, tanpa deployment
apapun) berisi Design System + Layout + beberapa komponen dengan data
contoh statis, termasuk tombol ganti role untuk mendemokan navigasi
berbasis role. INI BUKAN bagian deployment — murni alat bantu review
visual STEP 4.1/4.2.

## Progres Tahap 4
- [x] STEP 4.1 — Design System (Stylesheet.html)
- [x] STEP 4.2 — Layout + Navigasi (Index.html + JavaScript.html, role-based, data mock)
- [ ] STEP 4.3 — Login/Authentication UI (perlu Auth.gs backend)
- [ ] STEP 4.4 — Dashboard (perlu ReportService.gs backend)
- [ ] STEP 4.5 — Anggota (perlu AnggotaService.gs backend)
- [ ] STEP 4.6 — Simpanan (perlu SimpananService.gs backend)
- [ ] STEP 4.7 — Infaq (perlu InfaqService.gs backend)
- [ ] STEP 4.8 — Pinjaman (perlu PinjamanService.gs backend)
- [ ] STEP 4.9 — Pembayaran (perlu PembayaranService.gs backend)
- [ ] STEP 4.10 — User Management (perlu Users.gs backend)
- [ ] STEP 4.11 — Audit Log (perlu AuditService.gs backend)
- [ ] STEP 4.12 — Responsive/Mobile polish
- [ ] STEP 4.13 — UI Testing
