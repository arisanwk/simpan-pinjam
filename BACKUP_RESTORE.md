# BACKUP_RESTORE.md — Aplikasi Simpan Pinjam TVRI

> **Status: DESAIN SAJA — belum diimplementasikan (`BackupService.gs` belum ditulis, tidak ada trigger terpasang, restore belum pernah diuji).** Jangan menganggap mekanisme di bawah ini sudah melindungi data Anda sampai statusnya diperbarui.

## Rencana Struktur (Tahap 6 §18-19)

```
Google Drive
└── Simpan Pinjam/
    └── Backup/
        ├── Daily/    → Backup_YYYY-MM-DD.xlsx, disimpan 14 hari terakhir
        ├── Weekly/   → Backup_Minggu_YYYY-Www.xlsx, disimpan 8 minggu terakhir
        └── Monthly/  → Backup_YYYY-MM.xlsx, disimpan permanen
```

Folder ID rencananya disimpan di `CONFIG.folder_drive_backup` (kolom sudah ada di spreadsheet, saat ini masih kosong).

## Rencana Mekanisme (§20-21)

- Time-driven trigger harian (mis. 23:00 WIB) memanggil `BackupService.createBackup()`.
- `createBackup()` rencananya: `SpreadsheetApp.openById(SPREADSHEET_ID).copy(namaFile)` → pindahkan hasil copy ke folder Drive yang sesuai (Daily selalu; Weekly tiap Senin; Monthly tiap tanggal 1).
- Setiap percobaan (berhasil maupun gagal) dicatat ke sheet baru `BACKUP_LOG` (belum dibuat) dengan kolom: `backup_id, tanggal, jenis, file_id, status, error`.
- Trigger **tidak boleh diasumsikan selalu berhasil** — kegagalan harus tercatat di `BACKUP_LOG` dengan `status=FAILED`, bukan diam-diam terlewat.

## Rencana Prosedur Restore/Disaster Recovery (§22-23)

```
1. Identifikasi backup terakhir yang valid (cek BACKUP_LOG, status=SUCCESS)
2. Salin file backup tsb (jangan pernah restore langsung menimpa file asli)
3. Validasi struktur: 8 sheet ada, header sesuai kontrak Tahap 2
4. Validasi data: jalankan IntegrityService.findOrphanRecords() +
   findDuplicateIds() pada salinan (KEDUANYA sudah ada & teruji — lihat
   FINAL_ACCEPTANCE_TEST.md TEST-015/016, tapi belum pernah dijalankan
   dalam skenario restore sungguhan)
5. Hubungkan ulang Script Properties (SPREADSHEET_ID) Apps Script ke salinan
6. Jalankan smoke test (login, lihat dashboard, satu transaksi percobaan)
7. Baru aktifkan kembali akses user ke Web App
```

## Yang Perlu Dikerjakan Sebelum Ini Bisa Dipercaya

- [ ] Tulis `BackupService.gs` (`createBackup()`, pemilihan folder Daily/Weekly/Monthly, retensi)
- [ ] Buat sheet `BACKUP_LOG`
- [ ] Pasang time-driven trigger
- [ ] Jalankan restore test sungguhan minimal 1× ke environment TESTING (bukan production) dan dokumentasikan hasilnya di sini
- [ ] Isi `CONFIG.folder_drive_backup` dengan ID folder Drive sungguhan
