# ADMIN_GUIDE.md — Aplikasi Simpan Pinjam TVRI

## Yang SUDAH bisa dipakai admin sekarang (lewat editor Apps Script, bukan UI)

Setelah `src/*.gs` yang ada disalin ke project Apps Script (lihat `DEPLOYMENT.md`), fungsi berikut bisa dijalankan langsung dari editor (pilih nama fungsi di dropdown → tombol Run) tanpa perlu UI:

- **`findOrphanRecords()`** — cari transaksi yang `member_id`/`loan_id`-nya tidak valid. Harus selalu mengembalikan array kosong; kalau tidak, ada masalah data yang perlu ditindaklanjuti manual.
- **`findDuplicateIds()`** — cari ID yang muncul lebih dari sekali. Harus selalu kosong.
- **`reconcileLoan(loanId)`** — bandingkan status pinjaman tersimpan vs status hasil hitung ulang dari transaksi. Kalau `consistent:false`, ada pinjaman yang statusnya perlu dikoreksi manual (mis. seharusnya LUNAS tapi masih tercatat DICAIRKAN).
- **`getDashboardSummary(currentUser)`** dan **`getPeriodReport(currentUser, start, end)`** — bisa dipanggil manual dengan objek user contoh untuk cek angka, sebelum ada UI dashboard.

Ketiga fungsi integritas di atas sebaiknya dijalankan **rutin** (usulan: harian, sesuai checklist §66 di bawah) begitu aplikasi mulai dipakai mencatat transaksi sungguhan.

## Yang BELUM bisa dipakai admin (menunggu pekerjaan lanjutan)

- User Management (tambah/nonaktifkan user, ubah role) lewat UI — sekarang hanya lewat edit langsung sheet `USERS` (yang berarti proteksi sheet BELUM aktif — lihat `database/README.md`).
- Audit Log lewat UI — data sudah tercatat dengan benar di sheet `AUDIT_LOG` (kalau `logActivity()` dipanggil), tapi belum ada halaman untuk memfilternya.
- Backup/Restore — lihat `BACKUP_RESTORE.md`, belum ada sama sekali.
- Rollback deployment — belum relevan karena belum ada deployment production.

## Checklist Harian (Tahap 6 §66) — disesuaikan status nyata

```
[ ] Cek backup           <- BELUM BISA, backup belum ada
[ ] Cek error log         <- BELUM BISA, ERROR_LOG belum ada
[ ] Cek transaksi gagal   <- BELUM BISA, belum ada jalur transaksi
[x] Cek transaksi VOID    <- bisa lewat AUDIT_LOG manual (action=VOID), meski belum ada yang men-generate VOID sungguhan
[x] Cek reconciliation    <- BISA lewat reconcileLoan() manual per pinjaman
[x] Cek jumlah transaksi  <- BISA lewat getDashboardSummary()/getPeriodReport() manual
```

## Checklist Bulanan (§67) — status sama, akan diperbarui seiring modul selesai

Semua item di §67 (backup bulanan, rekonsiliasi total, review audit log/user/permission/error, review kapasitas spreadsheet) menunggu modul terkait selesai, kecuali "rekonsiliasi total" yang sebagian sudah bisa dilakukan manual lewat `reconcileLoan()` per pinjaman satu-satu (belum ada versi "semua pinjaman sekaligus" — perbaikan kecil yang mudah ditambahkan saat dibutuhkan).
