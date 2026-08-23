# Database Simpan Pinjam — cara pakai

## 1. Impor ke Google Sheets
1. Buka Google Drive → **New → File upload** → pilih `Database_Simpan_Pinjam.xlsx`.
2. Klik kanan file hasil upload → **Open with → Google Sheets** (ini otomatis
   mengonversinya jadi Google Sheet asli, bukan sekadar membuka file Excel).
3. (Opsional tapi disarankan) File → Save as Google Sheets, lalu hapus file
   .xlsx aslinya dari Drive supaya tidak ada 2 salinan.

## 2. WAJIB dilakukan sebelum dipakai
- Sheet **USERS**, sel **B2** (ditandai kuning): ganti
  `GANTI-DENGAN-EMAIL-ADMIN-ANDA@tvri.go.id` dengan alamat email Google
  Workspace sungguhan orang yang akan jadi ADMIN pertama. `Auth.gs` (STEP 3.3,
  belum dibangun) akan mencocokkan email login persis dengan kolom ini.
- Catat **Spreadsheet ID** (bagian di URL antara `/d/` dan `/edit`) — ini
  yang akan diisi ke Script Properties (`SPREADSHEET_ID`) saat `Code.gs`
  dan deployment Web App dibuat.

## 3. Isi workbook
8 sheet sesuai desain Tahap 2 yang sudah disetujui — struktur kolom TIDAK
diubah dari kontrak: `CONFIG`, `USERS`, `ANGGOTA`, `SIMPANAN`, `INFAQ`,
`PINJAMAN`, `PEMBAYARAN`, `AUDIT_LOG`.

- **CONFIG** — parameter aplikasi + counter ID (sudah diisi mengikuti data
  contoh di bawah; `IdGenerator.gs` nanti akan lanjut dari angka ini).
- **ANGGOTA / SIMPANAN / INFAQ / PINJAMAN / PEMBAYARAN** — sudah diisi data
  contoh persis seperti di dokumen Tahap 2 §L (5 anggota, 5 simpanan, 3
  infaq, 3 pinjaman, 10 pembayaran — termasuk 1 contoh VOID+koreksi).
  **Hapus baris-baris ini kapan saja** jika Anda ingin mulai dari kosong;
  header dan validasi dropdown tidak akan terpengaruh.
- **USERS** — 1 baris placeholder ADMIN (lihat langkah wajib di atas).
- **AUDIT_LOG** — sengaja kosong (lihat komentar di sel A2): data contoh
  di sheet lain dimasukkan langsung, bukan lewat aplikasi, jadi belum
  punya jejak audit. Transaksi lewat aplikasi nanti otomatis tercatat.

Dropdown (data validation) sudah dipasang untuk seluruh kolom enum
(status, jenis, role, status_transaksi) sepanjang 300 baris pertama, supaya
input manual (jika sewaktu-waktu diperlukan) tetap konsisten dengan enum
yang disepakati — meskipun jalur resminya tetap lewat aplikasi (Bagian 28 PRD).

## 4. Yang BELUM dilakukan di sini (langkah lanjutan, bukan bagian file ini)
- **Proteksi sheet** ("hanya bisa ditulis lewat aplikasi", Tahap 2 §7) — ini
  diterapkan di Google Sheets langsung (Data → Protect sheets), bukan lewat
  file .xlsx, jadi lakukan manual setelah impor, atau nanti otomatis lewat
  script setup nanti jika diminta.
- Membuat Apps Script project & `Code.gs` (menyambungkan `SPREADSHEET_ID`) —
  bagian dari lanjutan STEP 3.2 dst.

`build_workbook.py` disertakan supaya file ini bisa dibuat ulang/diaudit
(Python + openpyxl) kapan saja — bukan bagian yang perlu diunggah ke Drive.
