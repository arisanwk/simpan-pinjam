/**
 * CalculationService.gs
 * SATU-SATUNYA tempat rumus keuangan dihitung (Tahap 5 §39 — Dashboard,
 * Laporan, dan Detail Anggota/Pinjaman semua memanggil fungsi di file ini,
 * tidak ada yang menghitung ulang rumusnya sendiri). STEP 5.1.
 *
 * Prinsip yang dijaga di SETIAP fungsi di sini:
 *  - Baris ber-status_transaksi VOID TIDAK PERNAH dihitung (Tahap 5 §23).
 *  - Tidak ada bunga/cicilan/tenor/denda/jatuh tempo dalam bentuk apapun.
 *  - "Current Balance" (kondisi terkini) TIDAK PERNAH difilter periode;
 *    hanya "Period Activity" yang difilter tanggal (Tahap 5 §35/§36).
 */

function toNumberSafe_(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toDate_(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function isWithinPeriod_(dateVal, start, end) {
  const d = toDate_(dateVal);
  if (!d) return false;
  return d >= start && d <= end;
}

/* ================= SIMPANAN ================= */

/** Total simpanan wajib/sukarela seorang anggota — SUM baris NORMAL. Tahap 2 §I / Tahap 5 §22. */
function calcMemberSavings(memberId) {
  const rows = getAllRecords(SHEET_NAMES.SIMPANAN)
    .filter((r) => r.member_id === memberId && isNormalTransaction(r));
  let wajib = 0;
  let sukarela = 0;
  rows.forEach((r) => {
    const n = toNumberSafe_(r.nominal);
    if (r.jenis === SIMPANAN_JENIS.WAJIB) wajib += n;
    else if (r.jenis === SIMPANAN_JENIS.SUKARELA) sukarela += n;
  });
  return { wajib: wajib, sukarela: sukarela, total: wajib + sukarela };
}

/** Total simpanan seluruh anggota (untuk dashboard) — SUM semua baris NORMAL. */
function calcTotalSavings() {
  const rows = getAllRecords(SHEET_NAMES.SIMPANAN).filter(isNormalTransaction);
  let wajib = 0;
  let sukarela = 0;
  rows.forEach((r) => {
    const n = toNumberSafe_(r.nominal);
    if (r.jenis === SIMPANAN_JENIS.WAJIB) wajib += n;
    else if (r.jenis === SIMPANAN_JENIS.SUKARELA) sukarela += n;
  });
  return { wajib: wajib, sukarela: sukarela, total: wajib + sukarela };
}

/* ================= INFAQ ================= */

/** Total infaq seorang anggota. Infaq TIDAK PERNAH masuk saldo simpanan (Tahap 2 §F.4). */
function calcMemberInfaq(memberId) {
  return getAllRecords(SHEET_NAMES.INFAQ)
    .filter((r) => r.member_id === memberId && isNormalTransaction(r))
    .reduce((sum, r) => sum + toNumberSafe_(r.nominal), 0);
}

/** Total infaq global — termasuk infaq tanpa member_id (donatur non-anggota, Tahap 2 §C.5). */
function calcTotalInfaq() {
  return getAllRecords(SHEET_NAMES.INFAQ)
    .filter(isNormalTransaction)
    .reduce((sum, r) => sum + toNumberSafe_(r.nominal), 0);
}

/* ================= PINJAMAN / PEMBAYARAN ================= */

/**
 * Hitung total pinjaman, total pembayaran, sisa, dan status logis untuk
 * SATU baris PINJAMAN. Ini fungsi paling kritikal di seluruh aplikasi —
 * dipakai Dashboard, semua Laporan Pinjaman, Detail Pinjaman, dan Form
 * Pembayaran (validasi sisa).
 */
function calcLoan(loanRow) {
  const isDisbursed = loanRow.status === PINJAMAN_STATUS.DICAIRKAN || loanRow.status === PINJAMAN_STATUS.LUNAS;
  const totalPinjaman = isDisbursed ? toNumberSafe_(loanRow.nominal_pencairan) : 0;

  const totalPembayaran = getAllRecords(SHEET_NAMES.PEMBAYARAN)
    .filter((p) => p.loan_id === loanRow.loan_id && isNormalTransaction(p))
    .reduce((sum, p) => sum + toNumberSafe_(p.nominal), 0);

  const sisa = isDisbursed ? (totalPinjaman - totalPembayaran) : 0;
  // "Aktif" = status logis (Tahap 2 §C.6/§F, Tahap 3 catatan resolusi §"AKTIF"),
  // BUKAN nilai kolom `status` tersendiri.
  const isAktif = loanRow.status === PINJAMAN_STATUS.DICAIRKAN && sisa > 0;

  return {
    loan_id: loanRow.loan_id,
    member_id: loanRow.member_id,
    status: loanRow.status,             // nilai database, tetap 6 enum Tahap 2
    statusView: isAktif ? 'AKTIF' : loanRow.status, // label tampilan (lihat Tahap 4)
    totalPinjaman: totalPinjaman,
    totalPembayaran: totalPembayaran,
    sisa: sisa,
    isDisbursed: isDisbursed,
    isAktif: isAktif,
    isLunas: loanRow.status === PINJAMAN_STATUS.LUNAS
  };
}

/** calcLoan() untuk seluruh baris PINJAMAN sekaligus (dipakai Laporan Pinjaman/Dashboard). */
function calcAllLoans() {
  return getAllRecords(SHEET_NAMES.PINJAMAN).map(calcLoan);
}

/** Ringkasan pinjaman seorang anggota (dipakai Detail Anggota, Tahap 5 §21). */
function calcMemberLoans(memberId) {
  const loans = calcAllLoans().filter((l) => l.member_id === memberId);
  return {
    totalPinjaman: loans.reduce((s, l) => s + l.totalPinjaman, 0),
    totalPembayaran: loans.reduce((s, l) => s + l.totalPembayaran, 0),
    sisa: loans.reduce((s, l) => s + l.sisa, 0),
    loans: loans
  };
}

/* ================= DASHBOARD — CURRENT BALANCE ================= */

/**
 * Kondisi TERKINI — TIDAK dipengaruhi filter periode dashboard manapun
 * (Tahap 5 §35: "indikator Total Piutang/Sisa Pinjaman default-nya harus
 * menunjukkan kondisi terkini"). Ini yang dipanggil ReportService.getDashboardSummary().
 */
function calcCurrentBalanceSummary() {
  const anggota = getAllRecords(SHEET_NAMES.ANGGOTA);
  const savings = calcTotalSavings();
  const totalInfaq = calcTotalInfaq();
  const loans = calcAllLoans();

  const totalPinjamanDicairkan = loans
    .filter((l) => l.isDisbursed)
    .reduce((s, l) => s + l.totalPinjaman, 0); // hanya yang benar-benar dicairkan, Tahap 5 §22

  const totalPembayaran = loans.reduce((s, l) => s + l.totalPembayaran, 0);

  // Total Piutang = SUM sisa pinjaman AKTIF saja (Tahap 5 §7) — bukan semua pinjaman.
  const totalPiutang = loans.filter((l) => l.isAktif).reduce((s, l) => s + l.sisa, 0);

  return {
    totalAnggota: anggota.length,
    anggotaAktif: anggota.filter((a) => a.status === ANGGOTA_STATUS.AKTIF).length,
    totalSimpananWajib: savings.wajib,
    totalSimpananSukarela: savings.sukarela,
    totalSimpanan: savings.total,
    totalInfaq: totalInfaq,
    totalPinjamanDicairkan: totalPinjamanDicairkan,
    totalPembayaran: totalPembayaran,
    totalPiutang: totalPiutang,
    jumlahPinjamanAktif: loans.filter((l) => l.isAktif).length,
    jumlahPinjamanLunas: loans.filter((l) => l.isLunas).length
  };
}

/* ================= PERIOD ACTIVITY (berbeda dari Current Balance) ================= */

/**
 * Aktivitas transaksi DALAM suatu rentang tanggal — bukan saldo kondisi
 * terkini. `start`/`end` adalah objek Date, inklusif. Tahap 5 §19/§36/§37:
 * pembayaran periode = pembayaran yang BENAR-BENAR terjadi pada periode itu,
 * bukan "cicilan yang seharusnya dibayar" (tidak ada konsep itu di sistem ini).
 */
function calcPeriodActivitySummary(start, end) {
  const inPeriod = (r, dateField) => isWithinPeriod_(r[dateField], start, end) && isNormalTransaction(r);

  const simpanan = getAllRecords(SHEET_NAMES.SIMPANAN).filter((r) => inPeriod(r, 'tanggal'));
  const infaq = getAllRecords(SHEET_NAMES.INFAQ).filter((r) => inPeriod(r, 'tanggal'));
  const pembayaran = getAllRecords(SHEET_NAMES.PEMBAYARAN).filter((r) => inPeriod(r, 'tanggal'));
  // Pencairan pinjaman dalam periode: pakai tanggal_pencairan, bukan tanggal_pengajuan.
  const pencairan = getAllRecords(SHEET_NAMES.PINJAMAN)
    .filter((r) => (r.status === PINJAMAN_STATUS.DICAIRKAN || r.status === PINJAMAN_STATUS.LUNAS)
      && isWithinPeriod_(r.tanggal_pencairan, start, end));

  return {
    simpananWajib: simpanan.filter((r) => r.jenis === SIMPANAN_JENIS.WAJIB).reduce((s, r) => s + toNumberSafe_(r.nominal), 0),
    simpananSukarela: simpanan.filter((r) => r.jenis === SIMPANAN_JENIS.SUKARELA).reduce((s, r) => s + toNumberSafe_(r.nominal), 0),
    infaq: infaq.reduce((s, r) => s + toNumberSafe_(r.nominal), 0),
    pinjamanDicairkan: pencairan.reduce((s, r) => s + toNumberSafe_(r.nominal_pencairan), 0),
    pembayaran: pembayaran.reduce((s, r) => s + toNumberSafe_(r.nominal), 0),
    jumlahTransaksi: simpanan.length + infaq.length + pembayaran.length + pencairan.length
  };
}
