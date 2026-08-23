# Update — Halaman Tersambung Penuh (STEP 4.4-4.9)

Semua halaman berikut sekarang REAL (bukan placeholder), tersambung ke
backend lewat apiCall():
- Dashboard — 8 kartu ringkasan dari getDashboardSummary()
- Anggota — daftar + form Tambah Anggota (createMember)
- Simpanan — daftar + form Catat Simpanan (createSaving)
- Infaq — daftar + total + form Catat Infaq (createInfaq)
- Pinjaman — daftar + form Pengajuan (createLoanApplication) + tombol
  Setujui/Tolak/Cairkan untuk ADMIN (approveLoan/rejectLoan/disburseLoan)
- Pembayaran — pilih pinjaman aktif -> form pembayaran (createPayment)

Belum tersambung (masih pakai data placeholder atau belum ada halamannya):
Laporan, Pengguna (User Management), Audit Log, Pengaturan.

File baru: views.js (harus di-include SEBELUM app.js di index.html --
sudah diatur begitu).
