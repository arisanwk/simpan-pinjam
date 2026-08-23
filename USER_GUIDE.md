# USER_GUIDE.md — Aplikasi Simpan Pinjam TVRI

> **Belum ada alur yang bisa dipakai end-to-end oleh petugas/anggota.** Panduan ini adalah gambaran alur yang SUDAH DIRENCANAKAN (Tahap 3-4) untuk diikuti begitu backend & frontend selesai — bukan instruksi untuk sesuatu yang bisa Anda coba hari ini. Setiap bagian ditandai status-nya.

| Alur | Status |
|---|---|
| Login | ⏳ Belum ada (`Auth.identify()` belum ditulis) |
| Tambah Anggota | ⏳ Belum ada (`AnggotaService` belum ditulis) |
| Catat Simpanan | ⏳ Belum ada |
| Catat Infaq | ⏳ Belum ada |
| Ajukan Pinjaman | ⏳ Belum ada |
| Approval / Pencairan | ⏳ Belum ada |
| Pembayaran | ⏳ Belum ada |
| Melihat Saldo Pinjaman | ⏳ Rumusnya sudah benar & teruji (`CalculationService`), belum ada halaman untuk melihatnya |
| Melihat Laporan (Dashboard) | ⏳ Rumus dashboard sudah bekerja (`ReportService.getDashboardSummary`), belum tersambung ke halaman manapun |
| Download PDF / Export | ⏳ Belum ada |

## Rencana Alur (begitu selesai)

**Login** — buka URL Web App, login pakai akun Google kantor. Sistem mencocokkan email Anda ke daftar pengguna terdaftar; jika belum terdaftar atau dinonaktifkan, akses ditolak.

**Catat Simpanan** — pilih menu Simpanan → "+ Catat Simpanan" → pilih anggota, jenis (Wajib/Sukarela), nominal, tanggal → Simpan. Sistem menghitung ulang saldo otomatis; tidak ada "saldo" yang Anda ubah manual.

**Pembayaran Pinjaman** — pilih menu Pembayaran → pilih anggota lalu pinjaman aktifnya → sistem menampilkan sisa pinjaman saat ini → masukkan nominal yang mau dibayar (bebas, tidak harus sesuai "cicilan" karena memang tidak ada cicilan wajib) → konfirmasi → sistem menolak jika nominal melebihi sisa.

Panduan lengkap dengan tangkapan layar akan disusun setelah STEP 4.3 dst. selesai dan bisa benar-benar dicoba.
