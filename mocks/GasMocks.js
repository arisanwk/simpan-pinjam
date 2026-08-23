// GasMocks.js
// Simulasi minimal layanan Google Apps Script untuk pengujian lokal di
// Node.js. Ini BUKAN bagian dari deployment sesungguhnya — hanya alat bantu
// supaya logika di file .gs (yang murni JavaScript) bisa dijalankan & diuji
// di sandbox tanpa akun Google/Spreadsheet sungguhan.

function createMockSheet(name, headerRow, readCounter) {
  const rows = [headerRow.slice()];
  return {
    _name: name,
    getName() { return name; },
    getDataRange() {
      if (readCounter) readCounter.count[name] = (readCounter.count[name] || 0) + 1;
      return { getValues() { return rows.map((r) => r.slice()); } };
    },
    getLastRow() { return rows.length; },
    appendRow(row) { rows.push(row.slice()); },
    getRange(row, col) {
      return {
        setValue(v) { rows[row - 1][col - 1] = v; },
        getValue() { return rows[row - 1][col - 1]; }
      };
    },
    _rows: rows // diekspos khusus untuk assertion di test, bukan API GAS asli
  };
}

function createMockSpreadsheet(sheetDefs) {
  const sheets = {};
  Object.keys(sheetDefs).forEach((name) => {
    sheets[name] = createMockSheet(name, sheetDefs[name]);
  });
  return {
    getSheetByName(name) { return sheets[name] || null; },
    _sheets: sheets
  };
}

function buildGasGlobals(spreadsheet, scriptProps) {
  const props = Object.assign({}, scriptProps || {});
  // Mutable box tests can write to directly (globals.urlFetchMock.response = {...})
  // BEFORE invoking a function that calls UrlFetchApp.fetch() — lets us simulate
  // Google's tokeninfo endpoint returning different claims per test case.
  const urlFetchMock = { response: { code: 200, contentText: '{}' } };
  const cacheStore = {}; // dipakai CacheService mock -- bertahan selama satu proses buildGasGlobals (satu test)
  return {
    SpreadsheetApp: {
      openById() { return spreadsheet; },
      getActiveSpreadsheet() { return spreadsheet; }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null;
          },
          setProperty(key, value) { props[key] = value; }
        };
      }
    },
    // Mock sederhana: selalu berhasil lock, tidak benar-benar menyerialkan
    // proses (Node di sini single-threaded per test) — TIDAK membuktikan
    // keamanan concurrency sungguhan, hanya memungkinkan kode yang memanggil
    // LockService untuk berjalan saat diuji lepas dari Apps Script asli.
    LockService: {
      getScriptLock() {
        return {
          tryLock() { return true; },
          waitLock() { return true; },
          releaseLock() {}
        };
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) {
        const output = {
          _text: text,
          _mimeType: null,
          setMimeType(mt) { output._mimeType = mt; return output; },
          getContent() { return output._text; },
          getMimeType() { return output._mimeType; }
        };
        return output;
      }
    },
    CacheService: {
      getScriptCache() {
        return {
          get(key) { return Object.prototype.hasOwnProperty.call(cacheStore, key) ? cacheStore[key] : null; },
          put(key, value) { cacheStore[key] = value; }
        };
      }
    },
    // Dipakai verifyIdTokenAndGetUser() untuk memanggil endpoint tokeninfo
    // Google. Di sandbox ini TIDAK memanggil internet sungguhan — hanya
    // mengembalikan urlFetchMock.response yang diatur test sebelum memanggil.
    UrlFetchApp: {
      fetch() {
        const r = urlFetchMock.response;
        return {
          getResponseCode() { return r.code; },
          getContentText() { return typeof r.contentText === 'string' ? r.contentText : JSON.stringify(r.contentText); }
        };
      }
    },
    urlFetchMock: urlFetchMock,
    Logger: { log() { /* diam-diam saat test */ } },
    console,
    Math,
    Date,
    Object,
    Number,
    String,
    isNaN,
    JSON
  };
}

/**
 * Bangun mock spreadsheet dari fixture { SHEET_NAME: [ [header...], [row...], ... ] }
 * — dipakai untuk menguji CalculationService dkk terhadap data contoh yang
 * PERSIS sama dengan Database_Simpan_Pinjam.xlsx (lihat tests/fixtures).
 *
 * `readCounter` opsional: objek { count: {} } yang di-increment tiap kali
 * getDataRange() dipanggil, per nama sheet — dipakai test performa untuk
 * MEMBUKTIKAN jumlah pembacaan sheet berkurang, bukan cuma mengklaimnya.
 */
function createMockSpreadsheetFromFixture(fixture, readCounter) {
  const sheets = {};
  Object.keys(fixture).forEach((name) => {
    const rows = fixture[name];
    const header = rows[0] || [];
    const sheet = createMockSheet(name, header, readCounter);
    for (let i = 1; i < rows.length; i++) {
      sheet.appendRow(rows[i]);
    }
    sheets[name] = sheet;
  });
  return {
    getSheetByName(name) { return sheets[name] || null; },
    _sheets: sheets
  };
}

module.exports = { createMockSpreadsheet, createMockSpreadsheetFromFixture, buildGasGlobals };
