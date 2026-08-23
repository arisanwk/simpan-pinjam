/**
 * SheetRepository.gs
 * Satu-satunya file yang berbicara langsung ke SpreadsheetApp untuk baca/tulis
 * baris data (di luar Config.gs yang menangani sheet CONFIG sendiri).
 * STEP 3.2 — dikerjakan sekarang karena Tahap 5 (Calculation Service) butuh
 * cara baca data batch; sebelumnya sempat terlewat saat lompat ke Tahap 4.
 */

/**
 * Cegah formula/CSV injection (Tahap 6 §33/§68): jika nilai string yang akan
 * ditulis ke sheet diawali =, +, -, atau @, Google Sheets bisa
 * menginterpretasikannya sebagai formula/referensi meski ditulis lewat API,
 * bukan hanya lewat UI. Prefiks apostrof memaksa Sheets memperlakukannya
 * sebagai teks murni (perilaku standar "force text" Google Sheets — sama
 * seperti user mengetik '=RUMUS di sel secara manual).
 */
function sanitizeCellValue_(value) {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
    return "'" + value;
  }
  return value;
}

/**
 * Baca seluruh baris sebuah sheet sebagai array of object, key = header
 * kolom (baris 1). Batch read tunggal (getDataRange().getValues()) — tidak
 * pernah getRange per sel dalam loop (Tahap 3 §24).
 */
function getAllRecords(sheetName) {
  const sheet = getSheet_(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return []; // hanya header atau kosong
  const headers = data[0];
  const records = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.every((v) => v === '' || v === null)) continue; // lewati baris kosong
    const record = {};
    headers.forEach((h, idx) => { record[h] = row[idx]; });
    record._rowIndex = i + 1; // 1-indexed posisi baris asli — dipakai updateRecord
    records.push(record);
  }
  return records;
}

/** Cari satu record berdasarkan nilai kolom idColumn (mis. 'member_id'). */
function findRecordById(sheetName, idColumn, idValue) {
  const records = getAllRecords(sheetName);
  for (let i = 0; i < records.length; i++) {
    if (records[i][idColumn] === idValue) return records[i];
  }
  return null;
}

/**
 * Tambah baris baru. `record` adalah object; urutan nilai ditulis mengikuti
 * urutan header yang ada di baris 1 (supaya penulis tidak perlu tahu urutan
 * kolom fisik — cukup sediakan object dengan key yang sesuai nama kolom).
 * Setiap nilai string disaring lewat sanitizeCellValue_() (Tahap 6 §33).
 */
function appendRecord(sheetName, record) {
  const sheet = getSheet_(sheetName);
  const headers = sheet.getDataRange().getValues()[0];
  const row = headers.map((h) => {
    const v = Object.prototype.hasOwnProperty.call(record, h) ? record[h] : '';
    return sanitizeCellValue_(v);
  });
  sheet.appendRow(row);
}

/**
 * Update sebagian kolom pada baris yang sudah ada (dikenali dari _rowIndex
 * hasil getAllRecords/findRecordById). HANYA menulis kolom yang disebut di
 * `patch` — kolom lain di baris itu tidak tersentuh. Dipakai untuk field
 * terbatas yang memang boleh berubah setelah baris dibuat (status_transaksi,
 * ref_koreksi, status siklus PINJAMAN, updated_at — lihat Tahap 2 §H).
 */
function updateRecordFields(sheetName, rowIndex, patch) {
  const sheet = getSheet_(sheetName);
  const headers = sheet.getDataRange().getValues()[0];
  Object.keys(patch).forEach((key) => {
    const colIdx = headers.indexOf(key);
    if (colIdx === -1) {
      throw new AppError(ERROR_CODES.DATABASE_ERROR, 'Kolom "' + key + '" tidak ditemukan di sheet ' + sheetName + '.');
    }
    sheet.getRange(rowIndex, colIdx + 1).setValue(patch[key]);
  });
}

/** True jika baris transaksi masih berlaku (belum di-VOID). Tahap 2 §5.4/§F.3. */
function isNormalTransaction(record) {
  return record.status_transaksi === TRANSAKSI_STATUS.NORMAL;
}
