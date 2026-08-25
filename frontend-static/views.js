// views.js
// Render konten per-halaman (STEP 4.4-4.9). Dipanggil dari app.js saat
// item sidebar diklik. Semua data lewat apiCall() (api.js) -- TIDAK PERNAH
// membaca Google Sheet langsung dari sini (Tahap 4 §52).

var membersCache = []; // diisi lewat ensureMembersLoaded() -- lihat catatan performa di bawah
var membersCacheLoaded = false;

/**
 * PERFORMA: sebelumnya HAMPIR SETIAP halaman (Simpanan/Infaq/Pinjaman/
 * Pembayaran/Laporan) memanggil getMembers() ulang setiap dibuka, padahal
 * daftar anggota jarang berubah dalam satu sesi -- tiap panggilan itu satu
 * round-trip penuh ke Apps Script (yang sendirinya sudah punya latensi
 * cukup tinggi per request). Sekarang: hanya di-fetch SEKALI per sesi
 * lewat fungsi ini; renderAnggotaList() (satu-satunya halaman yang benar-
 * benar butuh data paling baru untuk CRUD) tetap fetch langsung & mengisi
 * ulang cache ini supaya halaman lain otomatis ikut ter-perbarui juga.
 */
async function ensureMembersLoaded() {
  if (membersCacheLoaded) return;
  var res = await apiCall('getMembers', {});
  if (res.success) { membersCache = res.data; membersCacheLoaded = true; }
}

/** Cegah XSS (Tahap 6 §35) -- SETIAP data dari server yang disisipkan ke
 * innerHTML lewat string wajib lewat fungsi ini. */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function loanStatusBadgeClass(statusView) {
  switch (statusView) {
    case 'AKTIF': return 'badge-info';
    case 'DIAJUKAN': return 'badge-warning';
    case 'DISETUJUI': return 'badge-info';
    case 'DITOLAK': return 'badge-danger';
    case 'LUNAS': return 'badge-success';
    case 'DIBATALKAN': return 'badge-neutral';
    default: return 'badge-neutral';
  }
}

function memberNameById(memberId) {
  var m = membersCache.filter(function (x) { return x.member_id === memberId; })[0];
  return m ? m.nama : (memberId || '(umum, bukan anggota)');
}

function contentArea() { return document.getElementById('content-area'); }
function setPageTitle(t) { var el = document.getElementById('page-title'); if (el) el.textContent = t; }

function showToast(message, kind) {
  var el = document.createElement('div');
  el.className = 'alert alert-' + (kind || 'success');
  el.style.cssText = 'position:fixed; top:16px; right:16px; z-index:200; box-shadow:var(--shadow-md); max-width:360px;';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 4000);
}

function showLoading() {
  contentArea().innerHTML = '<div class="empty-state">Memuat...</div>';
}
function showError(err) {
  contentArea().innerHTML = '<div class="alert alert-danger">' + escapeHtml(err && err.message ? err.message : 'Terjadi kesalahan.') + '</div>';
}

/** Modal generik -- dibuat dinamis, dibongkar saat ditutup. */
function openModal(titleHtml, bodyHtml, onSubmit) {
  closeModal();
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'dynamic-modal';
  overlay.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true">' +
      '<h2>' + titleHtml + '</h2>' +
      '<form id="dynamic-modal-form">' + bodyHtml +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-secondary" id="dynamic-modal-cancel">Batal</button>' +
          '<button type="submit" class="btn btn-primary" id="dynamic-modal-submit">Simpan</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById('dynamic-modal-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
  document.getElementById('dynamic-modal-form').addEventListener('submit', function (e) {
    e.preventDefault();
    onSubmit(new FormData(e.target), e.target);
  });
}
function closeModal() {
  var el = document.getElementById('dynamic-modal');
  if (el) el.remove();
}
function setModalSubmitting(isSubmitting, label) {
  var btn = document.getElementById('dynamic-modal-submit');
  if (!btn) return;
  btn.disabled = isSubmitting;
  btn.textContent = isSubmitting ? 'Menyimpan...' : (label || 'Simpan');
}

/** Router utama -- dipanggil app.js setiap klik menu sidebar. */
function renderView(pageKey) {
  switch (pageKey) {
    case 'dashboard': return renderDashboard();
    case 'anggota-list': return renderAnggotaList();
    case 'simpanan-list': return renderSimpananList();
    case 'penarikan-simpanan': return renderPenarikanSimpanan();
    case 'infaq-list': return renderInfaqList();
    case 'pinjaman-list': return renderPinjamanList();
    case 'pinjaman-form': return renderPinjamanList(true); // buka langsung form pengajuan
    case 'pembayaran-form': return renderPembayaran();
    case 'laporan': return renderLaporan();
    case 'users': return renderUsers();
    case 'audit-log': return renderAuditLog();
    case 'settings': return renderSettings();
    case 'data-saya': return renderDataSaya();
    case 'anggota-detail': return renderAnggotaDetail(currentDetailMemberId);
    default:
      contentArea().innerHTML = '<div class="empty-state"><p>Halaman "' + escapeHtml(pageKey) + '" belum tersedia.</p></div>';
  }
}

/* ============================================================ DASHBOARD */
async function renderDashboard() {
  setPageTitle('Dashboard');
  showLoading();
  var res = await apiCall('getDashboardSummary', {});
  if (!res.success) return showError(res.error);
  var d = res.data;
  contentArea().innerHTML =
    '<div class="grid-summary">' +
      summaryCard('Total Anggota', d.totalAnggota, d.anggotaAktif + ' aktif') +
      summaryCard('Total Simpanan', formatRupiah(d.totalSimpanan), 'Saldo bersih: Wajib ' + formatRupiah(d.totalSimpananWajib) + ' + Sukarela ' + formatRupiah(d.totalSimpananSukarela)) +
      summaryCard('Total Penarikan', formatRupiah(d.totalPenarikanSimpanan || 0), 'Akumulasi penarikan simpanan') +
      summaryCard('Total Infaq', formatRupiah(d.totalInfaq), 'Terpisah dari simpanan') +
      summaryCard('Total Piutang', formatRupiah(d.totalPiutang), d.jumlahPinjamanAktif + ' pinjaman aktif') +
      summaryCard('Pinjaman Dicairkan', formatRupiah(d.totalPinjamanDicairkan), '') +
      summaryCard('Total Pembayaran', formatRupiah(d.totalPembayaran), '') +
      summaryCard('Pinjaman Aktif', d.jumlahPinjamanAktif, '') +
      summaryCard('Pinjaman Lunas', d.jumlahPinjamanLunas, '') +
    '</div>';
}
function summaryCard(label, value, sub) {
  return '<div class="card summary-card"><div class="icon-badge">' + icon(inferCardIcon(label)) + '</div>' +
         '<div class="label">' + escapeHtml(label) + '</div>' +
         '<div class="value amount">' + escapeHtml(value) + '</div>' +
         (sub ? '<div class="sub">' + escapeHtml(sub) + '</div>' : '') + '</div>';
}

/** Tebak ikon yang paling relevan dari teks label kartu -- supaya tiap
 * ringkasan (Dashboard/Detail Anggota/Data Saya/Rekap Periode) otomatis
 * dapat ikon yang sesuai tanpa perlu mengubah puluhan titik pemanggilan
 * summaryCard() satu-satu. */
function inferCardIcon(label) {
  if (/pembayaran|dibayar/i.test(label)) return 'creditCard';
  if (/piutang/i.test(label)) return 'trendingUp';
  if (/lunas/i.test(label)) return 'checkCircle';
  if (/aktif/i.test(label) && /pinjaman/i.test(label)) return 'clock';
  if (/pinjaman/i.test(label)) return 'fileText';
  if (/penarikan|tarik/i.test(label)) return 'arrowDownCircle';
  if (/simpanan/i.test(label)) return 'dollarSign';
  if (/infaq/i.test(label)) return 'gift';
  if (/anggota/i.test(label)) return 'users';
  if (/transaksi/i.test(label)) return 'barChart';
  return 'dollarSign';
}

/* ============================================================ ANGGOTA */
async function renderAnggotaList() {
  setPageTitle('Anggota');
  showLoading();
  var res = await apiCall('getMembers', {});
  if (!res.success) return showError(res.error);
  membersCache = res.data;
  membersCacheLoaded = true; // halaman lain (Simpanan/Infaq/dst.) ikut dapat data terbaru ini
  var canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'PETUGAS';

  var rows = res.data.map(function (m) {
    var st = getSimpleStatusView(m.status);
    var aksi = canEdit
      ? '<button class="btn btn-secondary text-small" data-action="edit-member" data-member="' + escapeHtml(m.member_id) + '">' + icon('edit', 'icon-sm') + 'Edit</button> ' +
        '<button class="btn ' + (m.status === 'AKTIF' ? 'btn-danger' : 'btn-secondary') + ' text-small" data-action="toggle-member" data-member="' + escapeHtml(m.member_id) + '" data-status="' + escapeHtml(m.status) + '">' +
        (m.status === 'AKTIF' ? (icon('xCircle', 'icon-sm') + 'Nonaktifkan') : (icon('checkCircle', 'icon-sm') + 'Aktifkan')) + '</button>'
      : '';
    return '<tr class="row-clickable" data-member-id="' + escapeHtml(m.member_id) + '" style="cursor:pointer;">' +
      '<td data-label="Nomor">' + escapeHtml(m.nomor_anggota) + '</td>' +
      '<td data-label="Nama">' + escapeHtml(m.nama) + '</td>' +
      '<td data-label="No HP">' + escapeHtml(m.no_hp) + '</td>' +
      '<td data-label="Status"><span class="badge ' + st.badgeClass + '">' + escapeHtml(st.label) + '</span></td>' +
      (canEdit ? '<td data-label="Aksi">' + aksi + '</td>' : '') +
      '</tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Daftar Anggota</h1>' +
    (canEdit ? '<button class="btn btn-primary" id="btn-add-anggota">' + icon('plus') + 'Tambah Anggota</button>' : '') +
    '</div>' +
    (res.data.length === 0
      ? '<div class="empty-state">Belum ada anggota.' + (canEdit ? '<br><button class="btn btn-secondary" id="btn-add-anggota-empty">' + icon('plus') + 'Tambah Anggota</button>' : '') + '</div>'
      : '<div class="table-wrap"><table class="data-table"><thead><tr><th>Nomor</th><th>Nama</th><th>No HP</th><th>Status</th>' + (canEdit ? '<th>Aksi</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>');

  ['btn-add-anggota', 'btn-add-anggota-empty'].forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', openAnggotaForm);
  });
  contentArea().querySelectorAll('.row-clickable').forEach(function (tr) {
    tr.addEventListener('click', function () {
      currentDetailMemberId = tr.dataset.memberId;
      renderAnggotaDetail(currentDetailMemberId);
    });
  });
  // stopPropagation() -- tombol Edit/Nonaktifkan ada DI DALAM baris yang
  // juga bisa diklik untuk buka detail; tanpa ini, klik tombol akan ikut
  // memicu buka halaman detail juga.
  contentArea().querySelectorAll('[data-action="edit-member"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var member = membersCache.filter(function (m) { return m.member_id === btn.dataset.member; })[0];
      if (member) openEditAnggotaForm(member);
    });
  });
  contentArea().querySelectorAll('[data-action="toggle-member"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      handleToggleMemberStatus(btn.dataset.member, btn.dataset.status);
    });
  });
}

async function handleToggleMemberStatus(memberId, currentStatus) {
  var willActivate = currentStatus !== 'AKTIF';
  var confirmText = willActivate
    ? 'Aktifkan kembali anggota ini?'
    : 'Nonaktifkan anggota ini? Riwayat transaksinya tetap tersimpan -- ini BUKAN hapus permanen.';
  if (!confirm(confirmText)) return;
  var res = await apiCall(willActivate ? 'activateMember' : 'deactivateMember', { memberId: memberId });
  if (!res.success) return showToast(res.error.message, 'danger');
  showToast(willActivate ? 'Anggota diaktifkan kembali.' : 'Anggota dinonaktifkan.', 'success');
  renderAnggotaList();
}

function openEditAnggotaForm(member, onSuccess) {
  onSuccess = onSuccess || renderAnggotaList;
  openModal('Edit Anggota — ' + escapeHtml(member.nomor_anggota),
    '<div class="field"><label>Nomor Anggota</label><input class="input" value="' + escapeHtml(member.nomor_anggota) + '" disabled>' +
      '<div class="text-small text-muted" style="margin-top:4px;">Nomor anggota tidak dapat diubah lewat form ini.</div></div>' +
    field('Nama', 'nama', true) +
    field('NIK/NIP', 'nik_nip', false) +
    selectField('Jenis Kelamin', 'jenis_kelamin', [{ value: '', label: '(kosongkan)' }, { value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }], false) +
    field('Unit', 'unit', false) +
    field('Jabatan', 'jabatan', false) +
    field('No HP', 'no_hp', false) +
    field('Email', 'email', false),
    async function (formData) {
      setModalSubmitting(true, 'Simpan');
      var res = await apiCall('updateMember', {
        memberId: member.member_id,
        patch: {
          nama: formData.get('nama'), nik_nip: formData.get('nik_nip'),
          jenis_kelamin: formData.get('jenis_kelamin'), unit: formData.get('unit'),
          jabatan: formData.get('jabatan'), no_hp: formData.get('no_hp'), email: formData.get('email')
        }
      });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Data anggota berhasil diperbarui.', 'success');
      onSuccess();
    });
  // Isi ulang nilai form dengan data anggota saat ini (openModal hanya
  // menyiapkan field kosong -- ini yang membuatnya jadi form EDIT, bukan tambah baru).
  var form = document.getElementById('dynamic-modal-form');
  ['nama', 'nik_nip', 'jenis_kelamin', 'unit', 'jabatan', 'no_hp', 'email'].forEach(function (f) {
    var input = form.querySelector('[name="' + f + '"]');
    if (input) input.value = member[f] || '';
  });
}

var currentDetailMemberId = null;

/** Halaman Detail Anggota (Tahap 4 §13-14 — "salah satu halaman paling penting"). */
async function renderAnggotaDetail(memberId) {
  setPageTitle('Detail Anggota');
  showLoading();
  // PERFORMA: request detail dijalankan paralel agar waktu tunggu mengikuti
  // request paling lambat, bukan akumulasi seluruh request.
  var results = await Promise.all([
    apiCall('getMember', { memberId: memberId }),
    apiCall('getSavings', { filter: { member_id: memberId } }),
    apiCall('getMemberSavingWithdrawals', { memberId: memberId }),
    apiCall('getInfaqList', { filter: { member_id: memberId } }),
    apiCall('getLoans', { filter: { member_id: memberId } }),
    apiCall('getMemberPayments', { memberId: memberId })
  ]);
  var res = results[0], savingsRes = results[1], withdrawalsRes = results[2], infaqRes = results[3], loansRes = results[4], paymentsRes = results[5];
  if (!res.success) return showError(res.error);
  var m = res.data;
  var st = getSimpleStatusView(m.status);
  var canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'PETUGAS';

  contentArea().innerHTML =
    '<div class="member-detail-page">' +
      '<button class="btn btn-ghost text-small no-print" id="btn-back-anggota" style="margin-bottom:var(--space-4);">' + icon('arrowLeft', 'icon-sm') + 'Kembali ke Daftar Anggota</button>' +
      '<div class="content-header member-detail-header"><div><div class="eyebrow">DETAIL ANGGOTA</div><h1 style="margin:2px 0 0;">' + escapeHtml(m.nama) + '</h1>' +
        '<p class="text-muted" style="margin:4px 0 0;">' + escapeHtml(m.member_id) + ' &middot; ' + escapeHtml(m.unit || '-') +
        ' &middot; <span class="badge ' + st.badgeClass + '">' + escapeHtml(st.label) + '</span></p></div>' +
        '<div class="member-detail-actions no-print">' +
          '<button class="btn btn-secondary text-small" id="btn-print-anggota">' + icon('printer', 'icon-sm') + 'Cetak / PDF</button>' +
          '<button class="btn btn-whatsapp text-small" id="btn-wa-anggota">' + icon('messageCircle', 'icon-sm') + 'Kirim WhatsApp</button>' +
          (canEdit ? '<button class="btn btn-secondary text-small" id="btn-tarik-anggota-detail">' + icon('arrowDownCircle', 'icon-sm') + 'Tarik Simpanan</button><button class="btn btn-secondary text-small" id="btn-edit-anggota-detail">' + icon('edit', 'icon-sm') + 'Edit</button>' : '') +
        '</div>' +
      '</div>' +
      '<section class="member-profile-card">' +
        '<div class="member-profile-title"><strong>Profil Anggota</strong><span>Data identitas & kontak</span></div>' +
        '<div class="member-profile-grid">' +
          memberProfileItem('Nomor Anggota', m.nomor_anggota || m.member_id || '-') +
          memberProfileItem('NIK / NIP', m.nik_nip || '-') +
          memberProfileItem('Jenis Kelamin', m.jenis_kelamin || '-') +
          memberProfileItem('Unit', m.unit || '-') +
          memberProfileItem('Jabatan', m.jabatan || '-') +
          memberProfileItem('No. WhatsApp / HP', m.no_hp || '-') +
          memberProfileItem('Email', m.email || '-') +
          memberProfileItem('Status', st.label) +
        '</div>' +
      '</section>' +
      '<div class="grid-summary mb-6 member-finance-summary">' +
        summaryCard('Simpanan Wajib', formatRupiah(m.savings.wajib), '') +
        summaryCard('Simpanan Sukarela', formatRupiah(m.savings.sukarela), '') +
        summaryCard('Total Simpanan', formatRupiah(m.savings.total), '') +
        summaryCard('Total Infaq', formatRupiah(m.infaqTotal), '') +
        summaryCard('Total Pinjaman', formatRupiah(m.loans.totalPinjaman), '') +
        summaryCard('Total Dibayar', formatRupiah(m.loans.totalPembayaran), '') +
        summaryCard('Sisa Pinjaman', formatRupiah(m.loans.sisa), '') +
      '</div>' +
      '<section class="member-history-section"><h2>Riwayat Setoran Simpanan</h2>' + renderMiniTable(savingsRes, ['tanggal', 'jenis', 'nominal'], ['Tanggal', 'Jenis', 'Nominal']) + '</section>' +
      '<section class="member-history-section"><h2>Riwayat Penarikan Simpanan</h2>' + renderMiniTable(withdrawalsRes, ['tanggal', 'jenis', 'nominal'], ['Tanggal', 'Jenis', 'Nominal']) + '</section>' +
      '<section class="member-history-section"><h2>Riwayat Infaq</h2>' + renderMiniTable(infaqRes, ['tanggal', 'nominal'], ['Tanggal', 'Nominal']) + '</section>' +
      '<section class="member-history-section"><h2>Pinjaman</h2>' + renderLoanMiniTable(loansRes) + '</section>' +
      '<section class="member-history-section"><h2>Riwayat Pembayaran</h2>' + renderMiniTable(paymentsRes, ['tanggal', 'loan_id', 'nominal'], ['Tanggal', 'Pinjaman', 'Nominal']) + '</section>' +
    '</div>';

  document.getElementById('btn-back-anggota').addEventListener('click', renderAnggotaList);
  document.getElementById('btn-print-anggota').addEventListener('click', function () { printAnggotaDetail(m); });
  document.getElementById('btn-wa-anggota').addEventListener('click', function () { shareAnggotaViaWhatsApp(m); });
  var tarikBtn = document.getElementById('btn-tarik-anggota-detail');
  if (tarikBtn) tarikBtn.addEventListener('click', function () { openPenarikanSimpananForm(memberId); });
  var editBtn = document.getElementById('btn-edit-anggota-detail');
  if (editBtn) editBtn.addEventListener('click', function () {
    openEditAnggotaForm(m, function () { renderAnggotaDetail(memberId); });
  });
}

function memberProfileItem(label, value) {
  return '<div class="member-profile-item"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
}

/** Menyiapkan header cetak khusus detail anggota lalu membuka dialog Print / Save as PDF. */
function printAnggotaDetail(member) {
  var titleEl = document.getElementById('print-report-title');
  var metaEl = document.getElementById('print-report-meta');
  var footerEl = document.getElementById('print-footer-text');
  if (titleEl) titleEl.textContent = 'Detail Anggota — ' + (member.nama || member.member_id || '');
  if (metaEl) metaEl.textContent = 'Nomor Anggota: ' + (member.nomor_anggota || member.member_id || '-') +
    ' • Unit: ' + (member.unit || '-') + ' • Dicetak: ' + formatTanggalID(new Date());
  if (footerEl) footerEl.textContent = 'ARISAN WK — Wanita Keadilan • Dokumen ringkasan anggota';

  // Judul dokumen membantu browser memberi nama file PDF yang lebih informatif.
  var oldTitle = document.title;
  var safeName = String(member.nama || member.member_id || 'Anggota').replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').replace(/\s+/g, '-');
  document.title = 'ARISAN-WK-Detail-Anggota-' + safeName;
  var restore = function () { document.title = oldTitle; };
  window.addEventListener('afterprint', restore, { once: true });
  window.print();
  // Fallback untuk browser yang tidak mengirim event afterprint secara konsisten.
  setTimeout(function () { if (document.title !== oldTitle) document.title = oldTitle; }, 1500);
}

function normalizeWhatsAppNumber(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.indexOf('0') === 0) digits = '62' + digits.slice(1);
  else if (digits.indexOf('8') === 0) digits = '62' + digits;
  return digits;
}

/**
 * Membuka WhatsApp ke nomor anggota dengan ringkasan finansial yang sudah
 * diisi. Browser/WhatsApp tidak mengizinkan situs web melampirkan file PDF
 * lokal secara otomatis; PDF dapat disimpan lewat tombol Cetak/PDF lalu
 * dilampirkan pengguna di percakapan yang sama.
 */
function shareAnggotaViaWhatsApp(member) {
  var phone = normalizeWhatsAppNumber(member.no_hp);
  if (!phone || phone.length < 9) {
    showToast('Nomor WhatsApp/HP anggota belum tersedia atau tidak valid.', 'danger');
    return;
  }
  var lines = [
    '*ARISAN WK — Wanita Keadilan*',
    '*Ringkasan Anggota*',
    '',
    'Nama: ' + (member.nama || '-'),
    'No. Anggota: ' + (member.nomor_anggota || member.member_id || '-'),
    'Unit: ' + (member.unit || '-'),
    'Status: ' + (member.status || '-'),
    '',
    '*Simpanan*',
    'Wajib: ' + formatRupiah(member.savings && member.savings.wajib),
    'Sukarela: ' + formatRupiah(member.savings && member.savings.sukarela),
    'Total: ' + formatRupiah(member.savings && member.savings.total),
    'Total Penarikan: ' + formatRupiah(member.savings && member.savings.penarikanTotal),
    '',
    '*Infaq*',
    'Total: ' + formatRupiah(member.infaqTotal),
    '',
    '*Pinjaman*',
    'Total Pinjaman: ' + formatRupiah(member.loans && member.loans.totalPinjaman),
    'Total Dibayar: ' + formatRupiah(member.loans && member.loans.totalPembayaran),
    'Sisa Pinjaman: ' + formatRupiah(member.loans && member.loans.sisa),
    '',
    'Data per ' + formatTanggalID(new Date()) + '.',
    'Silakan hubungi pengelola ARISAN WK apabila ada data yang perlu dikonfirmasi.'
  ];
  var url = 'https://wa.me/' + encodeURIComponent(phone) + '?text=' + encodeURIComponent(lines.join('\n'));
  window.open(url, '_blank', 'noopener,noreferrer');
}

function renderMiniTable(res, fields, labels) {
  if (!res.success) return '<div class="alert alert-danger">' + escapeHtml(res.error.message) + '</div>';
  if (res.data.length === 0) return '<div class="empty-state">Belum ada data.</div>';
  var thead = labels.map(function (l) { return '<th' + (l === 'Nominal' ? ' class="col-amount"' : '') + '>' + escapeHtml(l) + '</th>'; }).join('');
  var rows = res.data.map(function (r) {
    return '<tr>' + fields.map(function (f, i) {
      var val = f === 'nominal' ? formatRupiah(r[f]) : r[f];
      return '<td data-label="' + escapeHtml(labels[i]) + '"' + (f === 'nominal' ? ' class="col-amount amount"' : '') + '>' + escapeHtml(val) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<div class="table-wrap"><table class="data-table"><thead><tr>' + thead + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function renderLoanMiniTable(res) {
  if (!res.success) return '<div class="alert alert-danger">' + escapeHtml(res.error.message) + '</div>';
  if (res.data.length === 0) return '<div class="empty-state">Belum pernah mengajukan pinjaman.</div>';
  var rows = res.data.map(function (l) {
    var nilaiTampil = l.isDisbursed ? l.totalPinjaman : l.nominalPengajuan;
    var labelNilai = l.isDisbursed ? '' : ' <span class="text-small text-muted">(pengajuan)</span>';
    return '<tr><td data-label="No Pinjaman">' + escapeHtml(l.loan_id) + '</td>' +
      '<td data-label="Nilai" class="col-amount amount">' + escapeHtml(formatRupiah(nilaiTampil)) + labelNilai + '</td>' +
      '<td data-label="Sisa" class="col-amount amount">' + escapeHtml(formatRupiah(l.sisa)) + '</td>' +
      '<td data-label="Status"><span class="badge ' + loanStatusBadgeClass(l.statusView) + '">' + escapeHtml(l.statusView) + '</span></td></tr>';
  }).join('');
  return '<div class="table-wrap"><table class="data-table"><thead><tr><th>No Pinjaman</th><th class="col-amount">Nilai</th><th class="col-amount">Sisa</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function openAnggotaForm() {
  openModal('Tambah Anggota',
    field('Nomor Anggota', 'nomor_anggota', true) +
    field('Nama', 'nama', true) +
    field('Unit', 'unit', false) +
    field('Jabatan', 'jabatan', false) +
    field('No HP', 'no_hp', false) +
    field('Email', 'email', false),
    async function (formData) {
      setModalSubmitting(true);
      var res = await apiCall('createMember', {
        nomor_anggota: formData.get('nomor_anggota'), nama: formData.get('nama'),
        unit: formData.get('unit'), jabatan: formData.get('jabatan'),
        no_hp: formData.get('no_hp'), email: formData.get('email'),
        clientRequestId: cryptoRandomId()
      });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Anggota berhasil ditambahkan: ' + res.data.member_id, 'success');
      renderAnggotaList();
    });
}

function parseRupiahInput(value) {
  var digits = String(value == null ? '' : value).replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}
function formatRupiahInput(value) {
  var digits = String(value == null ? '' : value).replace(/\D/g, '');
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
}
// Semua input nominal Rupiah otomatis memakai pemisah ribuan Indonesia saat diketik.
// Nilai dikonversi kembali menjadi angka murni sebelum dikirim ke backend.
if (!window.__rupiahInputListenerInstalled) {
  window.__rupiahInputListenerInstalled = true;
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.classList || !el.classList.contains('rupiah-input')) return;
    el.value = formatRupiahInput(el.value);
  });
}
function field(label, name, required, type) {
  var isRupiah = type === 'number' && /nominal/i.test(name);
  return '<div class="field"><label>' + escapeHtml(label) + (required ? '<span class="required">*</span>' : '') + '</label>' +
         '<input class="input' + (isRupiah ? ' rupiah-input' : '') + '" name="' + name + '" type="' + (isRupiah ? 'text' : (type || 'text')) + '"' +
         (isRupiah ? ' inputmode="numeric" autocomplete="off"' : '') + (required ? ' required' : '') + '></div>';
}
function selectField(label, name, options, required) {
  var opts = options.map(function (o) { return '<option value="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + '</option>'; }).join('');
  return '<div class="field"><label>' + escapeHtml(label) + (required ? '<span class="required">*</span>' : '') + '</label>' +
         '<select class="select" name="' + name + '"' + (required ? ' required' : '') + '>' + opts + '</select></div>';
}

/* ============================================================ SIMPANAN */
async function renderSimpananList() {
  setPageTitle('Simpanan');
  showLoading();
  await ensureMembersLoaded();

  var res = await apiCall('getSavings', {});
  if (!res.success) return showError(res.error);
  var canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'PETUGAS';

  var rows = res.data.map(function (r) {
    return '<tr><td data-label="Tanggal">' + escapeHtml(r.tanggal) + '</td>' +
      '<td data-label="Anggota">' + escapeHtml(memberNameById(r.member_id)) + '</td>' +
      '<td data-label="Jenis"><span class="badge badge-neutral">' + escapeHtml(r.jenis) + '</span></td>' +
      '<td data-label="Nominal" class="col-amount amount">' + escapeHtml(formatRupiah(r.nominal)) + '</td>' +
      '<td data-label="Petugas">' + escapeHtml(r.petugas) + '</td></tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Simpanan</h1>' +
    (canEdit ? '<button class="btn btn-primary" id="btn-add-simpanan">' + icon('plus') + 'Catat Simpanan</button>' : '') + '</div>' +
    (res.data.length === 0
      ? '<div class="empty-state">Belum ada transaksi simpanan.</div>'
      : '<div class="table-wrap"><table class="data-table"><thead><tr><th>Tanggal</th><th>Anggota</th><th>Jenis</th><th class="col-amount">Nominal</th><th>Petugas</th></tr></thead><tbody>' + rows + '</tbody></table></div>');

  var btn = document.getElementById('btn-add-simpanan');
  if (btn) btn.addEventListener('click', openSimpananForm);
}

function openSimpananForm() {
  var memberOptions = membersCache.filter(function (m) { return m.status === 'AKTIF'; })
    .map(function (m) { return { value: m.member_id, label: m.nama + ' (' + m.nomor_anggota + ')' }; });
  openModal('Catat Simpanan',
    selectField('Anggota', 'member_id', memberOptions, true) +
    selectField('Jenis', 'jenis', [{ value: 'WAJIB', label: 'Wajib' }, { value: 'SUKARELA', label: 'Sukarela' }], true) +
    field('Nominal (Rp)', 'nominal', true, 'number') +
    field('Keterangan', 'keterangan', false),
    async function (formData) {
      setModalSubmitting(true);
      var res = await apiCall('createSaving', {
        member_id: formData.get('member_id'), jenis: formData.get('jenis'),
        nominal: parseRupiahInput(formData.get('nominal')), keterangan: formData.get('keterangan'),
        clientRequestId: cryptoRandomId()
      });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Simpanan berhasil dicatat: ' + res.data.transaction_id, 'success');
      renderSimpananList();
    });
}

/* ============================================================ TARIK SIMPANAN */
async function renderPenarikanSimpanan() {
  setPageTitle('Tarik Simpanan');
  showLoading();
  await ensureMembersLoaded();
  var results = await Promise.all([
    apiCall('getSavingWithdrawals', {}),
    apiCall('getSavingWithdrawalSummary', {})
  ]);
  var res = results[0], summaryRes = results[1];
  if (!res.success) return showError(res.error);
  var summary = summaryRes.success ? summaryRes.data : { wajib: 0, sukarela: 0, total: 0 };
  var canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'PETUGAS';

  var rows = res.data.slice().reverse().map(function (r) {
    return '<tr><td data-label="Tanggal">' + escapeHtml(r.tanggal) + '</td>' +
      '<td data-label="Anggota">' + escapeHtml(memberNameById(r.member_id)) + '</td>' +
      '<td data-label="Jenis"><span class="badge badge-warning">' + escapeHtml(r.jenis) + '</span></td>' +
      '<td data-label="Nominal" class="col-amount amount">-' + escapeHtml(formatRupiah(r.nominal)) + '</td>' +
      '<td data-label="Metode">' + escapeHtml(r.metode || '-') + '</td>' +
      '<td data-label="Petugas">' + escapeHtml(r.petugas || '-') + '</td></tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><div><div class="eyebrow">TRANSAKSI SIMPANAN</div><h1 style="margin:2px 0 0;">Tarik Simpanan</h1>' +
      '<p class="text-muted" style="margin:4px 0 0;">Penarikan tervalidasi terhadap saldo anggota dan tercatat pada audit log.</p></div>' +
      (canEdit ? '<button class="btn btn-primary" id="btn-tarik-simpanan">' + icon('arrowDownCircle') + 'Tarik Simpanan</button>' : '') + '</div>' +
    '<div class="grid-summary mb-6">' +
      summaryCard('Total Penarikan', formatRupiah(summary.total), 'Akumulasi seluruh penarikan') +
      summaryCard('Penarikan Wajib', formatRupiah(summary.wajib), '') +
      summaryCard('Penarikan Sukarela', formatRupiah(summary.sukarela), '') +
    '</div>' +
    (res.data.length === 0 ? '<div class="empty-state">Belum ada penarikan simpanan.</div>' :
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Tanggal</th><th>Anggota</th><th>Jenis</th><th class="col-amount">Nominal</th><th>Metode</th><th>Petugas</th></tr></thead><tbody>' + rows + '</tbody></table></div>');

  var btn = document.getElementById('btn-tarik-simpanan');
  if (btn) btn.addEventListener('click', openPenarikanSimpananForm);
}

async function openPenarikanSimpananForm(prefillMemberId) {
  // Ambil anggota langsung dari backend setiap form dibuka. Jangan hanya
  // mengandalkan cache halaman agar dropdown tidak kosong karena cache lama/gagal load.
  var membersRes = await apiCall('getMembers', { filter: { status: 'AKTIF' } });
  if (!membersRes.success) {
    showToast((membersRes.error && membersRes.error.message) || 'Data anggota gagal dimuat.', 'danger');
    return;
  }
  var activeMembers = (membersRes.data || []).filter(function (m) {
    return String(m.status || '').trim().toUpperCase() === 'AKTIF';
  }).sort(function (a, b) { return String(a.nama || '').localeCompare(String(b.nama || ''), 'id'); });

  // Sinkronkan cache supaya nama anggota di tabel/halaman lain ikut tersedia.
  membersCache = membersRes.data || [];
  membersCacheLoaded = true;

  var memberOptions = [{ value: '', label: activeMembers.length ? 'Pilih anggota' : 'Tidak ada anggota aktif' }]
    .concat(activeMembers.map(function (m) {
      var no = m.nomor_anggota ? ' • ' + m.nomor_anggota : '';
      return { value: m.member_id, label: (m.nama || m.member_id) + no };
    }));

  openModal('Tarik Simpanan',
    '<div class="alert alert-warning withdrawal-note">Nominal tidak dapat melebihi saldo jenis simpanan yang dipilih. Sistem akan memvalidasi ulang saldo saat transaksi disimpan.</div>' +
    selectField('Anggota', 'member_id', memberOptions, true) +
    '<div id="withdrawal-balance-box" class="withdrawal-balance-box"><span>Saldo tersedia</span><strong>Pilih anggota dan jenis simpanan</strong></div>' +
    selectField('Jenis Simpanan', 'jenis', [{ value: 'SUKARELA', label: 'Sukarela' }, { value: 'WAJIB', label: 'Wajib' }], true) +
    field('Nominal Penarikan (Rp)', 'nominal', true, 'number') +
    selectField('Metode', 'metode', [{ value: 'TUNAI', label: 'Tunai' }, { value: 'TRANSFER', label: 'Transfer' }], true) +
    field('Keterangan / Keperluan', 'keterangan', false),
    async function (formData) {
      var memberId = formData.get('member_id');
      var jenis = formData.get('jenis');
      var nominal = parseRupiahInput(formData.get('nominal'));
      if (!memberId) { showToast('Pilih anggota terlebih dahulu.', 'danger'); return; }
      if (!nominal || nominal <= 0) { showToast('Nominal penarikan harus lebih dari 0.', 'danger'); return; }
      var maxSaldo = Number(document.querySelector('[name="nominal"]').max || 0);
      if (maxSaldo >= 0 && nominal > maxSaldo) { showToast('Nominal melebihi saldo ' + String(jenis).toLowerCase() + ' yang tersedia.', 'danger'); return; }
      setModalSubmitting(true, 'Proses Penarikan');
      var res = await apiCall('createSavingWithdrawal', {
        member_id: memberId, jenis: jenis, nominal: nominal,
        metode: formData.get('metode'), keterangan: formData.get('keterangan'), clientRequestId: cryptoRandomId()
      });
      setModalSubmitting(false, 'Proses Penarikan');
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Penarikan berhasil: ' + res.data.withdrawal_id + '. Saldo baru: ' + formatRupiah(res.data.saldo_baru.total), 'success');
      renderPenarikanSimpanan();
    });

  var form = document.getElementById('dynamic-modal-form');
  var memberSelect = form.querySelector('[name="member_id"]');
  var jenisSelect = form.querySelector('[name="jenis"]');
  var nominalInput = form.querySelector('[name="nominal"]');
  if (!activeMembers.length) memberSelect.disabled = true;
  if (prefillMemberId && activeMembers.some(function (m) { return m.member_id === prefillMemberId; })) memberSelect.value = prefillMemberId;

  var refreshBalance = async function () {
    var memberId = memberSelect.value;
    var box = document.getElementById('withdrawal-balance-box');
    nominalInput.value = '';
    nominalInput.max = '0';
    if (!memberId) {
      box.innerHTML = '<span>Saldo tersedia</span><strong>Pilih anggota dan jenis simpanan</strong>';
      return;
    }
    var selected = activeMembers.filter(function (m) { return m.member_id === memberId; })[0];
    box.innerHTML = '<span>Saldo ' + escapeHtml(jenisSelect.value.toLowerCase()) + '</span><strong>Memuat saldo ' + escapeHtml(selected ? selected.nama : '') + '...</strong>';
    var balanceRes = await apiCall('getMemberSavings', { memberId: memberId });
    if (!balanceRes.success) {
      box.innerHTML = '<span>Saldo tersedia</span><strong>Gagal memuat saldo anggota</strong><small>' + escapeHtml((balanceRes.error && balanceRes.error.message) || '') + '</small>';
      return;
    }
    var b = balanceRes.data || {};
    var wajib = Number(b.wajib || 0), sukarela = Number(b.sukarela || 0), total = Number(b.total || 0);
    var available = jenisSelect.value === 'WAJIB' ? wajib : sukarela;
    box.innerHTML = '<span>' + escapeHtml(selected ? selected.nama : memberId) + '</span>' +
      '<strong class="amount">Saldo ' + escapeHtml(jenisSelect.value.toLowerCase()) + ': ' + escapeHtml(formatRupiah(available)) + '</strong>' +
      '<small>Wajib: ' + escapeHtml(formatRupiah(wajib)) + ' • Sukarela: ' + escapeHtml(formatRupiah(sukarela)) + ' • Total: ' + escapeHtml(formatRupiah(total)) + '</small>';
    nominalInput.max = String(Math.max(0, available));
    nominalInput.disabled = available <= 0;
    if (available <= 0) showToast('Anggota ini tidak memiliki saldo ' + jenisSelect.value.toLowerCase() + ' yang dapat ditarik.', 'warning');
    else nominalInput.disabled = false;
  };
  memberSelect.addEventListener('change', refreshBalance);
  jenisSelect.addEventListener('change', refreshBalance);
  if (prefillMemberId && memberSelect.value) refreshBalance();
}
/* ============================================================ INFAQ */
async function renderInfaqList() {
  setPageTitle('Infaq');
  showLoading();
  await ensureMembersLoaded();

  var res = await apiCall('getInfaqList', {});
  if (!res.success) return showError(res.error);
  var summaryRes = await apiCall('getInfaqSummary', {});
  var canEdit = currentUser.role === 'ADMIN' || currentUser.role === 'PETUGAS';

  var rows = res.data.map(function (r) {
    return '<tr><td data-label="Tanggal">' + escapeHtml(r.tanggal) + '</td>' +
      '<td data-label="Anggota">' + escapeHtml(r.member_id ? memberNameById(r.member_id) : 'Donatur umum') + '</td>' +
      '<td data-label="Nominal" class="col-amount amount">' + escapeHtml(formatRupiah(r.nominal)) + '</td>' +
      '<td data-label="Petugas">' + escapeHtml(r.petugas) + '</td></tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Infaq</h1>' +
    (canEdit ? '<button class="btn btn-primary" id="btn-add-infaq">' + icon('plus') + 'Catat Infaq</button>' : '') + '</div>' +
    (summaryRes.success ? '<p class="text-muted">Total Infaq: <strong class="amount">' + escapeHtml(formatRupiah(summaryRes.data.total)) + '</strong></p>' : '') +
    (res.data.length === 0
      ? '<div class="empty-state">Belum ada transaksi infaq.</div>'
      : '<div class="table-wrap"><table class="data-table"><thead><tr><th>Tanggal</th><th>Anggota</th><th class="col-amount">Nominal</th><th>Petugas</th></tr></thead><tbody>' + rows + '</tbody></table></div>');

  var btn = document.getElementById('btn-add-infaq');
  if (btn) btn.addEventListener('click', openInfaqForm);
}

function openInfaqForm() {
  var memberOptions = [{ value: '', label: '(Donatur umum, bukan anggota)' }].concat(
    membersCache.map(function (m) { return { value: m.member_id, label: m.nama + ' (' + m.nomor_anggota + ')' }; }));
  openModal('Catat Infaq',
    selectField('Anggota', 'member_id', memberOptions, false) +
    field('Nominal (Rp)', 'nominal', true, 'number') +
    field('Keterangan', 'keterangan', false),
    async function (formData) {
      setModalSubmitting(true);
      var res = await apiCall('createInfaq', {
        member_id: formData.get('member_id') || '', nominal: parseRupiahInput(formData.get('nominal')),
        keterangan: formData.get('keterangan'), clientRequestId: cryptoRandomId()
      });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Infaq berhasil dicatat: ' + res.data.transaction_id, 'success');
      renderInfaqList();
    });
}

/* ============================================================ PINJAMAN */
async function renderPinjamanList(openFormDirectly) {
  setPageTitle('Daftar Pinjaman');
  showLoading();
  await ensureMembersLoaded();

  var res = await apiCall('getLoans', {});
  if (!res.success) return showError(res.error);
  var isAdmin = currentUser.role === 'ADMIN';
  var canApply = currentUser.role === 'ADMIN' || currentUser.role === 'PETUGAS';

  var rows = res.data.map(function (l) {
    var actions = '';
    if (isAdmin && l.status === 'DIAJUKAN') {
      actions = '<button class="btn btn-secondary text-small" data-action="approve" data-loan="' + l.loan_id + '">' + icon('check', 'icon-sm') + 'Setujui</button> ' +
                '<button class="btn btn-danger text-small" data-action="reject" data-loan="' + l.loan_id + '">' + icon('x', 'icon-sm') + 'Tolak</button>';
    } else if (isAdmin && l.status === 'DISETUJUI') {
      actions = '<button class="btn btn-primary text-small" data-action="disburse" data-loan="' + l.loan_id + '" data-nominal="' + l.nominalPengajuan + '">' + icon('creditCard', 'icon-sm') + 'Cairkan</button>';
    }
    // Sebelum dicairkan, "Total Pinjaman" MEMANG Rp0 (belum ada uang yang
    // benar-benar keluar, lihat CalculationService.calcLoanCore_) -- supaya
    // tidak terlihat seperti error, tampilkan nominal PENGAJUAN sebagai
    // gantinya untuk status yang belum dicairkan.
    var nilaiTampil = l.isDisbursed ? l.totalPinjaman : l.nominalPengajuan;
    var labelNilai = l.isDisbursed ? '' : ' <span class="text-small text-muted">(pengajuan)</span>';
    return '<tr><td data-label="No Pinjaman">' + escapeHtml(l.loan_id) + '</td>' +
      '<td data-label="Anggota">' + escapeHtml(memberNameById(l.member_id)) + '</td>' +
      '<td data-label="Pinjaman" class="col-amount amount">' + escapeHtml(formatRupiah(nilaiTampil)) + labelNilai + '</td>' +
      '<td data-label="Sisa" class="col-amount amount">' + escapeHtml(formatRupiah(l.sisa)) + '</td>' +
      '<td data-label="Status"><span class="badge ' + loanStatusBadgeClass(l.statusView) + '">' + escapeHtml(l.statusView) + '</span></td>' +
      '<td data-label="Aksi">' + actions + '</td></tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Daftar Pinjaman</h1>' +
    (canApply ? '<button class="btn btn-primary" id="btn-add-pinjaman">' + icon('plus') + 'Pengajuan Pinjaman</button>' : '') + '</div>' +
    (res.data.length === 0
      ? '<div class="empty-state">Belum ada pinjaman.</div>'
      : '<div class="table-wrap"><table class="data-table"><thead><tr><th>No Pinjaman</th><th>Anggota</th><th class="col-amount">Pinjaman</th><th class="col-amount">Sisa</th><th>Status</th><th>Aksi</th></tr></thead><tbody>' + rows + '</tbody></table></div>');

  var btnAdd = document.getElementById('btn-add-pinjaman');
  if (btnAdd) btnAdd.addEventListener('click', openPinjamanForm);
  contentArea().querySelectorAll('[data-action="approve"],[data-action="reject"]').forEach(function (btn) {
    btn.addEventListener('click', function () { handleLoanAction(btn.dataset.action, btn.dataset.loan); });
  });
  contentArea().querySelectorAll('[data-action="disburse"]').forEach(function (btn) {
    btn.addEventListener('click', function () { openDisburseForm(btn.dataset.loan, Number(btn.dataset.nominal)); });
  });

  if (openFormDirectly && canApply) openPinjamanForm();
}

async function handleLoanAction(action, loanId, reason) {
  if (action === 'approve') {
    if (!confirm('Setujui pinjaman ' + loanId + '?')) return;
    var res = await apiCall('approveLoan', { loanId: loanId });
    if (!res.success) return showToast(res.error.message, 'danger');
    showToast('Pinjaman disetujui.', 'success');
    renderPinjamanList();
  } else if (action === 'reject') {
    var alasan = prompt('Alasan penolakan (wajib diisi):');
    if (!alasan) return;
    var res2 = await apiCall('rejectLoan', { loanId: loanId, reason: alasan });
    if (!res2.success) return showToast(res2.error.message, 'danger');
    showToast('Pinjaman ditolak.', 'success');
    renderPinjamanList();
  }
}

/**
 * Form pencairan -- BUKAN lagi window.confirm() dengan angka tersembunyi
 * di atribut HTML (itu penyebab bug "Cairkan selalu gagal": nominal yang
 * dikirim ternyata Total Pinjaman yang MEMANG masih Rp0 sebelum dicairkan,
 * bukan nominal yang diajukan/disetujui). Sekarang ADMIN benar-benar
 * MELIHAT dan bisa MENGUBAH nominal pencairan sebelum submit -- pra-diisi
 * dari nominal pengajuan, tapi tidak wajib sama persis (mis. disetujui
 * sebagian).
 */
function openDisburseForm(loanId, nominalPengajuan) {
  openModal('Cairkan Pinjaman — ' + escapeHtml(loanId),
    '<p class="text-muted">Nominal pengajuan: <strong class="amount">' + escapeHtml(formatRupiah(nominalPengajuan)) + '</strong></p>' +
    field('Nominal Pencairan (Rp)', 'nominal_pencairan', true, 'number'),
    async function (formData) {
      var nominal = parseRupiahInput(formData.get('nominal_pencairan'));
      setModalSubmitting(true, 'Cairkan');
      var res = await apiCall('disburseLoan', { loanId: loanId, nominalPencairan: nominal });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Pinjaman dicairkan: ' + formatRupiah(nominal), 'success');
      renderPinjamanList();
    });
  var form = document.getElementById('dynamic-modal-form');
  var input = form.querySelector('[name="nominal_pencairan"]');
  if (input) input.value = formatRupiahInput(nominalPengajuan || '');
}

function openPinjamanForm() {
  var memberOptions = membersCache.filter(function (m) { return m.status === 'AKTIF'; })
    .map(function (m) { return { value: m.member_id, label: m.nama + ' (' + m.nomor_anggota + ')' }; });
  openModal('Pengajuan Pinjaman',
    selectField('Anggota', 'member_id', memberOptions, true) +
    field('Nominal Pengajuan (Rp)', 'nominal_pengajuan', true, 'number') +
    field('Tujuan', 'tujuan', false),
    async function (formData) {
      setModalSubmitting(true, 'Ajukan');
      var res = await apiCall('createLoanApplication', {
        member_id: formData.get('member_id'), nominal_pengajuan: parseRupiahInput(formData.get('nominal_pengajuan')),
        tujuan: formData.get('tujuan'), clientRequestId: cryptoRandomId()
      });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Pinjaman diajukan: ' + res.data.loan_id + ' (status DIAJUKAN)', 'success');
      renderPinjamanList();
    });
}

/* ============================================================ PEMBAYARAN */
async function renderPembayaran() {
  setPageTitle('Pembayaran');
  showLoading();
  await ensureMembersLoaded();

  var res = await apiCall('getActiveLoans', {});
  if (!res.success) return showError(res.error);

  if (res.data.length === 0) {
    contentArea().innerHTML = '<div class="empty-state">Tidak ada pinjaman aktif untuk dibayar.</div>';
    return;
  }

  var rows = res.data.map(function (l) {
    return '<tr><td data-label="No Pinjaman">' + escapeHtml(l.loan_id) + '</td>' +
      '<td data-label="Anggota">' + escapeHtml(memberNameById(l.member_id)) + '</td>' +
      '<td data-label="Sisa" class="col-amount amount">' + escapeHtml(formatRupiah(l.sisa)) + '</td>' +
      '<td data-label="Aksi"><button class="btn btn-primary text-small" data-loan="' + l.loan_id + '" data-sisa="' + l.sisa + '">Bayar</button></td></tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Pilih Pinjaman untuk Dibayar</h1></div>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>No Pinjaman</th><th>Anggota</th><th class="col-amount">Sisa</th><th>Aksi</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

  contentArea().querySelectorAll('[data-loan]').forEach(function (btn) {
    btn.addEventListener('click', function () { openPembayaranForm(btn.dataset.loan, Number(btn.dataset.sisa)); });
  });
}

function openPembayaranForm(loanId, sisa) {
  openModal('Pembayaran — ' + escapeHtml(loanId),
    '<p class="text-muted">Sisa saat ini: <strong class="amount">' + escapeHtml(formatRupiah(sisa)) + '</strong></p>' +
    field('Nominal Pembayaran (Rp)', 'nominal', true, 'number') +
    field('Keterangan', 'keterangan', false),
    async function (formData) {
      var nominal = parseRupiahInput(formData.get('nominal'));
      setModalSubmitting(true, 'Simpan Pembayaran');
      var res = await apiCall('createPayment', {
        loan_id: loanId, nominal: nominal, keterangan: formData.get('keterangan'),
        clientRequestId: cryptoRandomId()
      });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Pembayaran tercatat: ' + res.data.payment_id + '. Sisa: ' + formatRupiah(res.data.sisa_baru) +
        (res.data.status_pinjaman === 'LUNAS' ? ' — LUNAS!' : ''), 'success');
      renderPembayaran();
    });
}

/** ID acak sederhana untuk idempotency key (satu per submit form). */
function cryptoRandomId() {
  return 'REQ-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

/* ============================================================ LAPORAN */
var LAPORAN_TABS = [
  { key: 'ringkasan', label: 'Ringkasan Keuangan', roles: ['ADMIN', 'PETUGAS', 'PIMPINAN', 'VIEWER'] },
  { key: 'anggota', label: 'Anggota', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'simpanan', label: 'Simpanan', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'penarikan-simpanan', label: 'Tarik Simpanan', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'infaq', label: 'Infaq', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'pinjaman', label: 'Semua Pinjaman', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'pinjaman-aktif', label: 'Pinjaman Aktif', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'pinjaman-lunas', label: 'Pinjaman Lunas', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'pembayaran', label: 'Pembayaran', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'periode', label: 'Rekap Periode', roles: ['ADMIN', 'PETUGAS', 'PIMPINAN', 'VIEWER'] }
];
var laporanActiveTab = 'anggota';
var laporanExportData = { headers: [], rows: [], filename: 'laporan.csv' };
var laporanFilterMeta = '';

function laporanTabsForRole(role) {
  return LAPORAN_TABS.filter(function (t) { return t.roles.indexOf(role) > -1; });
}

function laporanTabInfo(key) {
  return LAPORAN_TABS.filter(function (t) { return t.key === key; })[0] || { label: key };
}

async function renderLaporan() {
  setPageTitle('Laporan');
  var visibleTabs = laporanTabsForRole(currentUser.role);
  if (visibleTabs.every(function (t) { return t.key !== laporanActiveTab; })) {
    laporanActiveTab = visibleTabs[0].key;
  }
  var tabsHtml = visibleTabs.map(function (t) {
    return '<button class="report-tab' + (t.key === laporanActiveTab ? ' active' : '') + ' no-print" data-laporan-tab="' + t.key + '">' + escapeHtml(t.label) + '</button>';
  }).join('');

  contentArea().innerHTML =
    '<section class="report-hero no-print">' +
      '<div><div class="eyebrow">PUSAT LAPORAN</div><h1>Pelaporan & Rekapitulasi</h1>' +
      '<p>Analisis data operasional, posisi keuangan, dan transaksi ARISAN WK secara terstruktur.</p></div>' +
      '<div class="report-actions">' +
        '<button class="btn btn-secondary" id="btn-export-laporan">' + icon('fileText', 'icon-sm') + 'Export CSV</button>' +
        '<button class="btn btn-primary" id="btn-cetak-laporan">' + icon('printer', 'icon-sm') + 'Cetak / PDF</button>' +
      '</div>' +
    '</section>' +
    '<div class="report-tabs no-print">' + tabsHtml + '</div>' +
    (visibleTabs.length < LAPORAN_TABS.length
      ? '<div class="report-privacy-note no-print">Data individu anggota hanya tersedia untuk Admin/Petugas. Role Anda tetap dapat melihat laporan agregat.</div>'
      : '') +
    '<div id="laporan-body"><div class="empty-state">Memuat laporan...</div></div>';

  contentArea().querySelectorAll('[data-laporan-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      laporanActiveTab = btn.dataset.laporanTab;
      renderLaporan();
    });
  });
  document.getElementById('btn-cetak-laporan').addEventListener('click', printLaporan);
  document.getElementById('btn-export-laporan').addEventListener('click', exportLaporanCsv);

  await renderLaporanBody(laporanActiveTab);
}

function printLaporan() {
  var tab = laporanTabInfo(laporanActiveTab);
  var judul = 'Laporan ' + tab.label;
  var periodeText = laporanFilterMeta || ('Kondisi terkini per ' + formatTanggalID(new Date()));
  document.getElementById('print-report-title').textContent = judul;
  document.getElementById('print-report-meta').textContent = periodeText;
  document.getElementById('print-footer-text').textContent =
    'Dicetak oleh: ' + currentUser.nama + ' (' + currentUser.email + ') pada ' + formatTanggalID(new Date()) + ', ' + new Date().toLocaleTimeString('id-ID');
  window.print();
}

function csvCell(value) {
  var s = String(value === null || value === undefined ? '' : value);
  return '"' + s.replace(/"/g, '""') + '"';
}

function exportLaporanCsv() {
  if (!laporanExportData || !laporanExportData.headers || laporanExportData.headers.length === 0) {
    showToast('Laporan ini belum memiliki data tabular untuk diekspor.', 'danger');
    return;
  }
  var lines = [laporanExportData.headers.map(csvCell).join(';')];
  (laporanExportData.rows || []).forEach(function (row) { lines.push(row.map(csvCell).join(';')); });
  var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = laporanExportData.filename || 'laporan-arisan-wk.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 500);
}

function normalizeSearchText(value) {
  return String(value === null || value === undefined ? '' : value).toLowerCase();
}

function containsQuery(values, query) {
  var q = normalizeSearchText(query).trim();
  if (!q) return true;
  return values.some(function (v) { return normalizeSearchText(v).indexOf(q) > -1; });
}

function reportFilterBar(innerHtml) {
  return '<div class="report-filter-card no-print"><div class="report-filter-grid">' + innerHtml + '</div>' +
    '<div class="report-filter-hint">Filter diterapkan langsung pada laporan yang tampil, dicetak, dan diekspor.</div></div>';
}

function reportSearchField(placeholder) {
  return '<div class="field report-search-field"><label>Cari</label><input class="input" id="report-filter-search" type="search" placeholder="' + escapeHtml(placeholder || 'Cari data...') + '" autocomplete="off"></div>';
}

function reportSelectField(id, label, options) {
  return '<div class="field"><label>' + escapeHtml(label) + '</label><select class="input" id="' + id + '">' +
    options.map(function (o) { return '<option value="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + '</option>'; }).join('') +
    '</select></div>';
}

function reportDateField(id, label) {
  return '<div class="field"><label>' + escapeHtml(label) + '</label><input class="input" id="' + id + '" type="date"></div>';
}

function reportSummaryStrip(cards) {
  return '<div class="report-summary-strip">' + cards.map(function (c) {
    return '<div class="report-metric"><span>' + escapeHtml(c.label) + '</span><strong class="' + (c.amount ? 'amount' : '') + '">' + escapeHtml(c.value) + '</strong>' +
      (c.sub ? '<small>' + escapeHtml(c.sub) + '</small>' : '') + '</div>';
  }).join('') + '</div>';
}

function setLaporanExport(headers, rows, filename, filterMeta) {
  laporanExportData = { headers: headers, rows: rows, filename: filename };
  laporanFilterMeta = filterMeta || '';
}

function bindReportFilter(ids, renderFn) {
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', renderFn);
  });
}

async function renderLaporanBody(tabKey) {
  var body = document.getElementById('laporan-body');
  if (!body) return;
  laporanFilterMeta = '';
  laporanExportData = { headers: [], rows: [], filename: 'laporan.csv' };

  if (tabKey === 'ringkasan') {
    var summaryRes = await apiCall('getDashboardSummary', {});
    if (!summaryRes.success) return showLaporanError(summaryRes.error);
    var d0 = summaryRes.data;
    body.innerHTML =
      '<div class="report-section-head"><div><h2>Ringkasan Keuangan Terkini</h2><p>Posisi saat ini, bukan aktivitas periode.</p></div><span class="report-asof">Per ' + escapeHtml(formatTanggalID(new Date())) + '</span></div>' +
      '<div class="grid-summary">' +
        summaryCard('Total Anggota', d0.totalAnggota, d0.anggotaAktif + ' aktif') +
        summaryCard('Total Simpanan', formatRupiah(d0.totalSimpanan), 'Saldo bersih: Wajib ' + formatRupiah(d0.totalSimpananWajib) + ' + Sukarela ' + formatRupiah(d0.totalSimpananSukarela)) +
        summaryCard('Total Penarikan', formatRupiah(d0.totalPenarikanSimpanan || 0), 'Akumulasi penarikan simpanan') +
        summaryCard('Total Infaq', formatRupiah(d0.totalInfaq), 'Terpisah dari simpanan') +
        summaryCard('Total Piutang', formatRupiah(d0.totalPiutang), d0.jumlahPinjamanAktif + ' pinjaman aktif') +
        summaryCard('Pinjaman Dicairkan', formatRupiah(d0.totalPinjamanDicairkan), '') +
        summaryCard('Total Pembayaran', formatRupiah(d0.totalPembayaran), '') +
        summaryCard('Pinjaman Aktif', d0.jumlahPinjamanAktif, '') +
        summaryCard('Pinjaman Lunas', d0.jumlahPinjamanLunas, '') +
      '</div>';
    setLaporanExport(
      ['Indikator', 'Nilai'],
      [
        ['Total Anggota', d0.totalAnggota], ['Anggota Aktif', d0.anggotaAktif],
        ['Simpanan Wajib', d0.totalSimpananWajib], ['Simpanan Sukarela', d0.totalSimpananSukarela], ['Total Simpanan', d0.totalSimpanan], ['Total Penarikan Simpanan', d0.totalPenarikanSimpanan || 0],
        ['Total Infaq', d0.totalInfaq], ['Pinjaman Dicairkan', d0.totalPinjamanDicairkan], ['Total Pembayaran', d0.totalPembayaran],
        ['Total Piutang', d0.totalPiutang], ['Pinjaman Aktif', d0.jumlahPinjamanAktif], ['Pinjaman Lunas', d0.jumlahPinjamanLunas]
      ],
      'ringkasan-keuangan-arisan-wk.csv', 'Kondisi terkini per ' + formatTanggalID(new Date())
    );
    return;
  }

  if (tabKey === 'periode') {
    var today = new Date().toISOString().slice(0, 10);
    var firstOfMonth = today.slice(0, 8) + '01';
    body.innerHTML =
      '<div class="report-section-head"><div><h2>Rekap Aktivitas Periode</h2><p>Arus transaksi yang benar-benar terjadi dalam rentang tanggal.</p></div></div>' +
      reportFilterBar(
        '<div class="field"><label>Tanggal Awal</label><input class="input" type="date" id="periode-start" value="' + firstOfMonth + '"></div>' +
        '<div class="field"><label>Tanggal Akhir</label><input class="input" type="date" id="periode-end" value="' + today + '"></div>' +
        '<div class="field report-filter-action"><label>&nbsp;</label><button class="btn btn-primary" id="btn-periode-load">Tampilkan</button></div>'
      ) + '<div id="periode-result"></div>';
    document.getElementById('btn-periode-load').addEventListener('click', loadPeriodeReport);
    await loadPeriodeReport();
    return;
  }

  await ensureMembersLoaded();

  if (tabKey === 'anggota') {
    var memberRows = membersCache.slice();
    body.innerHTML = '<div class="report-section-head"><div><h2>Laporan Anggota</h2><p>Daftar anggota dengan pencarian dan filter status.</p></div></div>' +
      reportFilterBar(reportSearchField('Nama, nomor anggota, HP, unit...') + reportSelectField('report-filter-status', 'Status', [
        { value: '', label: 'Semua status' }, { value: 'AKTIF', label: 'Aktif' }, { value: 'TIDAK AKTIF', label: 'Tidak Aktif' }
      ])) + '<div id="report-table-result"></div>';
    var renderMembers = function () {
      var q = document.getElementById('report-filter-search').value;
      var status = document.getElementById('report-filter-status').value;
      var filtered = memberRows.filter(function (m) {
        return (!status || m.status === status) && containsQuery([m.nomor_anggota, m.nama, m.no_hp, m.email, m.unit, m.jabatan], q);
      });
      var rows = filtered.map(function (m) {
        var st = getSimpleStatusView(m.status);
        return '<tr><td data-label="Nomor">' + escapeHtml(m.nomor_anggota) + '</td><td data-label="Nama">' + escapeHtml(m.nama) + '</td>' +
          '<td data-label="Unit">' + escapeHtml(m.unit || '-') + '</td><td data-label="No HP">' + escapeHtml(m.no_hp || '-') + '</td>' +
          '<td data-label="Status"><span class="badge ' + st.badgeClass + '">' + escapeHtml(st.label) + '</span></td></tr>';
      }).join('');
      document.getElementById('report-table-result').innerHTML = reportSummaryStrip([
        { label: 'Data Tampil', value: filtered.length + ' anggota' },
        { label: 'Aktif', value: filtered.filter(function (m) { return m.status === 'AKTIF'; }).length + ' anggota' },
        { label: 'Tidak Aktif', value: filtered.filter(function (m) { return m.status !== 'AKTIF'; }).length + ' anggota' }
      ]) + laporanTable(['Nomor', 'Nama', 'Unit', 'No HP', 'Status'], rows, filtered.length);
      setLaporanExport(['Nomor Anggota', 'Nama', 'Unit', 'No HP', 'Email', 'Status'], filtered.map(function (m) {
        return [m.nomor_anggota, m.nama, m.unit || '', m.no_hp || '', m.email || '', m.status];
      }), 'laporan-anggota-arisan-wk.csv', 'Filter: ' + (status || 'Semua status') + (q ? ' • Pencarian: ' + q : ''));
    };
    bindReportFilter(['report-filter-search', 'report-filter-status'], renderMembers);
    renderMembers();
    return;
  }

  if (tabKey === 'simpanan') {
    var savingRes = await apiCall('getSavingRekapDetailedPerMember', {});
    if (!savingRes.success) return showLaporanError(savingRes.error);
    var savingRows = savingRes.data;
    body.innerHTML = '<div class="report-section-head"><div><h2>Rekap Simpanan per Anggota</h2><p>Saldo bersih simpanan setelah memperhitungkan setoran dan penarikan.</p></div></div>' +
      reportFilterBar(reportSearchField('Cari nama anggota...')) + '<div id="report-table-result"></div>';
    var renderSavings = function () {
      var q = document.getElementById('report-filter-search').value;
      var filtered = savingRows.filter(function (r) { return containsQuery([r.nama, r.member_id], q); });
      var totalWajib = filtered.reduce(function (s, r) { return s + Number(r.wajib || 0); }, 0);
      var totalSukarela = filtered.reduce(function (s, r) { return s + Number(r.sukarela || 0); }, 0);
      var totalTarik = filtered.reduce(function (s, r) { return s + Number(r.penarikanWajib || 0) + Number(r.penarikanSukarela || 0); }, 0);
      var rows = filtered.map(function (r) {
        return '<tr><td data-label="Anggota">' + escapeHtml(r.nama) + '</td>' +
          '<td data-label="Setoran" class="col-amount amount">' + escapeHtml(formatRupiah(Number(r.setoranWajib || 0) + Number(r.setoranSukarela || 0))) + '</td>' +
          '<td data-label="Penarikan" class="col-amount amount">' + escapeHtml(formatRupiah(Number(r.penarikanWajib || 0) + Number(r.penarikanSukarela || 0))) + '</td>' +
          '<td data-label="Saldo Wajib" class="col-amount amount">' + escapeHtml(formatRupiah(r.wajib)) + '</td>' +
          '<td data-label="Saldo Sukarela" class="col-amount amount">' + escapeHtml(formatRupiah(r.sukarela)) + '</td>' +
          '<td data-label="Saldo Total" class="col-amount amount">' + escapeHtml(formatRupiah(r.total)) + '</td></tr>';
      }).join('');
      document.getElementById('report-table-result').innerHTML = reportSummaryStrip([
        { label: 'Simpanan Wajib', value: formatRupiah(totalWajib), amount: true },
        { label: 'Simpanan Sukarela', value: formatRupiah(totalSukarela), amount: true },
        { label: 'Total Penarikan', value: formatRupiah(totalTarik), amount: true },
        { label: 'Saldo Simpanan', value: formatRupiah(totalWajib + totalSukarela), amount: true }
      ]) + laporanTable(['Anggota', 'Setoran', 'Penarikan', 'Saldo Wajib', 'Saldo Sukarela', 'Saldo Total'], rows, filtered.length, ['', 'col-amount', 'col-amount', 'col-amount', 'col-amount', 'col-amount']);
      setLaporanExport(['Anggota', 'Setoran Wajib', 'Setoran Sukarela', 'Penarikan Wajib', 'Penarikan Sukarela', 'Saldo Wajib', 'Saldo Sukarela', 'Saldo Total'], filtered.map(function (r) { return [r.nama, r.setoranWajib, r.setoranSukarela, r.penarikanWajib, r.penarikanSukarela, r.wajib, r.sukarela, r.total]; }),
        'rekap-simpanan-arisan-wk.csv', q ? 'Pencarian: ' + q : 'Seluruh anggota');
    };
    bindReportFilter(['report-filter-search'], renderSavings);
    renderSavings();
    return;
  }

  if (tabKey === 'penarikan-simpanan') {
    await ensureMembersLoaded();
    var withdrawalRes = await apiCall('getSavingWithdrawals', {});
    if (!withdrawalRes.success) return showLaporanError(withdrawalRes.error);
    var withdrawalRows = withdrawalRes.data;
    body.innerHTML = '<div class="report-section-head"><div><h2>Laporan Penarikan Simpanan</h2><p>Riwayat pengambilan simpanan wajib/sukarela dengan petugas dan keterangan.</p></div></div>' +
      reportFilterBar(reportSearchField('Cari anggota, ID penarikan, keterangan...') + reportSelectField('report-filter-status', 'Jenis', [
        { value: '', label: 'Semua jenis' }, { value: 'WAJIB', label: 'Wajib' }, { value: 'SUKARELA', label: 'Sukarela' }
      ])) + '<div id="report-table-result"></div>';
    var renderWithdrawals = function () {
      var q = document.getElementById('report-filter-search').value;
      var jenis = document.getElementById('report-filter-status').value;
      var filtered = withdrawalRows.filter(function (r) {
        return (!jenis || r.jenis === jenis) && containsQuery([r.withdrawal_id, r.member_id, memberNameById(r.member_id), r.tanggal, r.keterangan, r.petugas], q);
      });
      var total = filtered.reduce(function (sum, r) { return sum + Number(r.nominal || 0); }, 0);
      var rows = filtered.slice().reverse().map(function (r) {
        return '<tr><td data-label="Tanggal">' + escapeHtml(r.tanggal) + '</td><td data-label="ID">' + escapeHtml(r.withdrawal_id) + '</td>' +
          '<td data-label="Anggota">' + escapeHtml(memberNameById(r.member_id)) + '</td><td data-label="Jenis">' + escapeHtml(r.jenis) + '</td>' +
          '<td data-label="Nominal" class="col-amount amount">' + escapeHtml(formatRupiah(r.nominal)) + '</td><td data-label="Keterangan">' + escapeHtml(r.keterangan || '-') + '</td></tr>';
      }).join('');
      document.getElementById('report-table-result').innerHTML = reportSummaryStrip([
        { label: 'Total Penarikan', value: formatRupiah(total), amount: true }, { label: 'Transaksi', value: filtered.length + ' transaksi' }
      ]) + laporanTable(['Tanggal', 'ID', 'Anggota', 'Jenis', 'Nominal', 'Keterangan'], rows, filtered.length, ['', '', '', '', 'col-amount', '']);
      setLaporanExport(['Tanggal', 'ID Penarikan', 'Anggota', 'Jenis', 'Nominal', 'Metode', 'Petugas', 'Keterangan'], filtered.map(function (r) {
        return [r.tanggal, r.withdrawal_id, memberNameById(r.member_id), r.jenis, r.nominal, r.metode || '', r.petugas || '', r.keterangan || ''];
      }), 'laporan-penarikan-simpanan-arisan-wk.csv', 'Jenis: ' + (jenis || 'Semua') + (q ? ' • Pencarian: ' + q : ''));
    };
    bindReportFilter(['report-filter-search', 'report-filter-status'], renderWithdrawals);
    renderWithdrawals();
    return;
  }

  if (tabKey === 'infaq') {
    var infaqRes = await apiCall('getInfaqRekapPerMember', {});
    if (!infaqRes.success) return showLaporanError(infaqRes.error);
    var infaqRows = infaqRes.data;
    body.innerHTML = '<div class="report-section-head"><div><h2>Rekap Infaq per Anggota</h2><p>Infaq anggota; donatur umum tetap masuk total Dashboard tetapi tidak dirinci di sini.</p></div></div>' +
      reportFilterBar(reportSearchField('Cari nama anggota...')) + '<div id="report-table-result"></div>';
    var renderInfaq = function () {
      var q = document.getElementById('report-filter-search').value;
      var filtered = infaqRows.filter(function (r) { return containsQuery([r.nama, r.member_id], q); });
      var total = filtered.reduce(function (s, r) { return s + Number(r.total || 0); }, 0);
      var rows = filtered.map(function (r) { return '<tr><td data-label="Anggota">' + escapeHtml(r.nama) + '</td><td data-label="Total Infaq" class="col-amount amount">' + escapeHtml(formatRupiah(r.total)) + '</td></tr>'; }).join('');
      document.getElementById('report-table-result').innerHTML = reportSummaryStrip([{ label: 'Total Infaq Tampil', value: formatRupiah(total), amount: true }, { label: 'Jumlah Anggota', value: filtered.length + ' anggota' }]) +
        laporanTable(['Anggota', 'Total Infaq'], rows, filtered.length, ['', 'col-amount']);
      setLaporanExport(['Anggota', 'Total Infaq'], filtered.map(function (r) { return [r.nama, r.total]; }), 'rekap-infaq-arisan-wk.csv', q ? 'Pencarian: ' + q : 'Seluruh anggota dengan infaq');
    };
    bindReportFilter(['report-filter-search'], renderInfaq);
    renderInfaq();
    return;
  }

  if (tabKey === 'pinjaman' || tabKey === 'pinjaman-aktif' || tabKey === 'pinjaman-lunas') {
    var action = tabKey === 'pinjaman-aktif' ? 'getActiveLoans' : 'getLoans';
    var payload = tabKey === 'pinjaman-lunas' ? { filter: { status: 'LUNAS' } } : {};
    var loanRes = await apiCall(action, payload);
    if (!loanRes.success) return showLaporanError(loanRes.error);
    var loanRows = loanRes.data;
    var fixedStatus = tabKey === 'pinjaman-aktif' ? 'AKTIF' : (tabKey === 'pinjaman-lunas' ? 'LUNAS' : '');
    var statusOptions = [
      { value: '', label: 'Semua status' }, { value: 'DIAJUKAN', label: 'Diajukan' }, { value: 'DISETUJUI', label: 'Disetujui' },
      { value: 'AKTIF', label: 'Aktif' }, { value: 'LUNAS', label: 'Lunas' }, { value: 'DITOLAK', label: 'Ditolak' }, { value: 'DIBATALKAN', label: 'Dibatalkan' }
    ];
    body.innerHTML = '<div class="report-section-head"><div><h2>' + escapeHtml(laporanTabInfo(tabKey).label) + '</h2><p>Posisi pinjaman, pembayaran, dan sisa kewajiban.</p></div></div>' +
      reportFilterBar(reportSearchField('No pinjaman atau nama anggota...') + (fixedStatus ? '' : reportSelectField('report-filter-status', 'Status', statusOptions))) + '<div id="report-table-result"></div>';
    var renderLoans = function () {
      var q = document.getElementById('report-filter-search').value;
      var statusEl = document.getElementById('report-filter-status');
      var status = fixedStatus || (statusEl ? statusEl.value : '');
      var filtered = loanRows.filter(function (l) {
        return (!status || l.statusView === status || l.status === status) && containsQuery([l.loan_id, memberNameById(l.member_id), l.member_id, l.statusView], q);
      });
      var totalPinjaman = filtered.reduce(function (s, l) { return s + Number(l.isDisbursed ? l.totalPinjaman : l.nominalPengajuan || 0); }, 0);
      var totalDibayar = filtered.reduce(function (s, l) { return s + Number(l.totalPembayaran || 0); }, 0);
      var totalSisa = filtered.reduce(function (s, l) { return s + Number(l.sisa || 0); }, 0);
      var rows = filtered.map(function (l) {
        var nilaiTampil = l.isDisbursed ? l.totalPinjaman : l.nominalPengajuan;
        var labelNilai = l.isDisbursed ? '' : ' <span class="text-small text-muted">(pengajuan)</span>';
        return '<tr><td data-label="No Pinjaman">' + escapeHtml(l.loan_id) + '</td><td data-label="Anggota">' + escapeHtml(memberNameById(l.member_id)) + '</td>' +
          '<td data-label="Pinjaman" class="col-amount amount">' + escapeHtml(formatRupiah(nilaiTampil)) + labelNilai + '</td>' +
          '<td data-label="Dibayar" class="col-amount amount">' + escapeHtml(formatRupiah(l.totalPembayaran)) + '</td><td data-label="Sisa" class="col-amount amount">' + escapeHtml(formatRupiah(l.sisa)) + '</td>' +
          '<td data-label="Status"><span class="badge ' + loanStatusBadgeClass(l.statusView) + '">' + escapeHtml(l.statusView) + '</span></td></tr>';
      }).join('');
      document.getElementById('report-table-result').innerHTML = reportSummaryStrip([
        { label: 'Nilai Pinjaman', value: formatRupiah(totalPinjaman), amount: true }, { label: 'Total Dibayar', value: formatRupiah(totalDibayar), amount: true },
        { label: 'Sisa Piutang', value: formatRupiah(totalSisa), amount: true }, { label: 'Jumlah Data', value: filtered.length + ' pinjaman' }
      ]) + laporanTable(['No Pinjaman', 'Anggota', 'Pinjaman', 'Dibayar', 'Sisa', 'Status'], rows, filtered.length, ['', '', 'col-amount', 'col-amount', 'col-amount', '']);
      setLaporanExport(['No Pinjaman', 'Anggota', 'Pinjaman', 'Dibayar', 'Sisa', 'Status'], filtered.map(function (l) {
        return [l.loan_id, memberNameById(l.member_id), l.isDisbursed ? l.totalPinjaman : l.nominalPengajuan, l.totalPembayaran, l.sisa, l.statusView];
      }), 'laporan-pinjaman-arisan-wk.csv', 'Filter: ' + (status || 'Semua status') + (q ? ' • Pencarian: ' + q : ''));
    };
    bindReportFilter(['report-filter-search', 'report-filter-status'], renderLoans);
    renderLoans();
    return;
  }

  if (tabKey === 'pembayaran') {
    var paymentRes = await apiCall('getPayments', {});
    if (!paymentRes.success) return showLaporanError(paymentRes.error);
    var paymentRows = paymentRes.data;
    body.innerHTML = '<div class="report-section-head"><div><h2>Laporan Pembayaran</h2><p>Riwayat pembayaran pinjaman dengan filter pencarian dan tanggal.</p></div></div>' +
      reportFilterBar(reportSearchField('ID pembayaran, pinjaman, anggota...') + reportDateField('report-date-start', 'Dari') + reportDateField('report-date-end', 'Sampai')) + '<div id="report-table-result"></div>';
    var renderPayments = function () {
      var q = document.getElementById('report-filter-search').value;
      var start = document.getElementById('report-date-start').value;
      var end = document.getElementById('report-date-end').value;
      var filtered = paymentRows.filter(function (p) {
        var ds = String(p.tanggal || '').slice(0, 10);
        var dateOk = (!start || ds >= start) && (!end || ds <= end);
        return dateOk && containsQuery([p.payment_id, p.loan_id, memberNameById(p.member_id), p.member_id, p.petugas, p.metode, p.keterangan], q);
      });
      var total = filtered.reduce(function (s, p) { return s + Number(p.nominal || 0); }, 0);
      var rows = filtered.map(function (p) {
        return '<tr><td data-label="ID">' + escapeHtml(p.payment_id) + '</td><td data-label="Tanggal">' + escapeHtml(p.tanggal) + '</td><td data-label="Pinjaman">' + escapeHtml(p.loan_id) + '</td>' +
          '<td data-label="Anggota">' + escapeHtml(memberNameById(p.member_id)) + '</td><td data-label="Nominal" class="col-amount amount">' + escapeHtml(formatRupiah(p.nominal)) + '</td><td data-label="Petugas">' + escapeHtml(p.petugas) + '</td></tr>';
      }).join('');
      document.getElementById('report-table-result').innerHTML = reportSummaryStrip([{ label: 'Total Pembayaran', value: formatRupiah(total), amount: true }, { label: 'Jumlah Transaksi', value: filtered.length + ' transaksi' }]) +
        laporanTable(['ID', 'Tanggal', 'Pinjaman', 'Anggota', 'Nominal', 'Petugas'], rows, filtered.length, ['', '', '', '', 'col-amount', '']);
      var meta = (start || end) ? 'Periode: ' + (start || '-') + ' s/d ' + (end || '-') : 'Seluruh periode';
      if (q) meta += ' • Pencarian: ' + q;
      setLaporanExport(['ID Pembayaran', 'Tanggal', 'No Pinjaman', 'Anggota', 'Nominal', 'Petugas'], filtered.map(function (p) { return [p.payment_id, p.tanggal, p.loan_id, memberNameById(p.member_id), p.nominal, p.petugas]; }), 'laporan-pembayaran-arisan-wk.csv', meta);
    };
    bindReportFilter(['report-filter-search', 'report-date-start', 'report-date-end'], renderPayments);
    renderPayments();
    return;
  }
}

async function loadPeriodeReport() {
  var resultEl = document.getElementById('periode-result');
  var start = document.getElementById('periode-start').value;
  var end = document.getElementById('periode-end').value;
  if (!start || !end || start > end) {
    resultEl.innerHTML = '<div class="alert alert-danger">Rentang tanggal tidak valid. Pastikan tanggal awal tidak melebihi tanggal akhir.</div>';
    return;
  }
  resultEl.innerHTML = '<div class="empty-state">Memuat...</div>';
  var res = await apiCall('getPeriodReport', { startDate: start, endDate: end });
  if (!res.success) { resultEl.innerHTML = '<div class="alert alert-danger">' + escapeHtml(res.error.message) + '</div>'; return; }
  var d = res.data;
  resultEl.innerHTML =
    '<div class="report-period-note">Aktivitas pada periode ini berbeda dari saldo terkini. Nilai di bawah hanya menghitung transaksi yang benar-benar terjadi pada tanggal terpilih.</div>' +
    '<div class="grid-summary">' +
      summaryCard('Simpanan Wajib', formatRupiah(d.simpananWajib), '') +
      summaryCard('Simpanan Sukarela', formatRupiah(d.simpananSukarela), '') +
      summaryCard('Penarikan Simpanan', formatRupiah(d.penarikanSimpanan || 0), '') +
      summaryCard('Infaq', formatRupiah(d.infaq), '') +
      summaryCard('Pinjaman Dicairkan', formatRupiah(d.pinjamanDicairkan), '') +
      summaryCard('Pembayaran', formatRupiah(d.pembayaran), '') +
      summaryCard('Jumlah Transaksi', d.jumlahTransaksi, '') +
    '</div>';
  var periodeLabel = 'Periode: ' + formatTanggalID(start) + ' s/d ' + formatTanggalID(end);
  setLaporanExport(['Indikator', 'Nilai'], [
    ['Simpanan Wajib', d.simpananWajib], ['Simpanan Sukarela', d.simpananSukarela], ['Penarikan Simpanan', d.penarikanSimpanan || 0], ['Infaq', d.infaq],
    ['Pinjaman Dicairkan', d.pinjamanDicairkan], ['Pembayaran', d.pembayaran], ['Jumlah Transaksi', d.jumlahTransaksi]
  ], 'rekap-periode-' + start + '-sd-' + end + '.csv', periodeLabel);
}

function laporanTable(headers, rowsHtml, count, amountCols) {
  if (count === 0) return '<div class="empty-state">Tidak ada data yang sesuai dengan filter.</div>';
  var thead = headers.map(function (h, i) {
    return '<th' + (amountCols && amountCols[i] ? ' class="col-amount"' : '') + '>' + escapeHtml(h) + '</th>';
  }).join('');
  return '<div class="report-table-meta no-print"><strong>' + count + '</strong> data ditampilkan</div>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr>' + thead + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
}
function showLaporanError(err) {
  var body = document.getElementById('laporan-body');
  if (body) body.innerHTML = '<div class="alert alert-danger">' + escapeHtml(err && err.message ? err.message : 'Gagal memuat laporan.') + '</div>';
}


/* ============================================================ PENGGUNA (ADMIN only) */
var ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' }, { value: 'PETUGAS', label: 'Petugas' },
  { value: 'PIMPINAN', label: 'Pimpinan' }, { value: 'VIEWER', label: 'Viewer' }
];

async function renderUsers() {
  setPageTitle('Pengguna');
  showLoading();
  var res = await apiCall('getUsers', {});
  if (!res.success) return showError(res.error);

  var rows = res.data.map(function (u) {
    var st = getSimpleStatusView(u.status);
    var isSelf = u.email.toLowerCase() === currentUser.email.toLowerCase();
    return '<tr><td data-label="Email">' + escapeHtml(u.email) + (isSelf ? ' <span class="text-small text-muted">(Anda)</span>' : '') + '</td>' +
      '<td data-label="Nama">' + escapeHtml(u.nama) + '</td>' +
      '<td data-label="Role"><span class="badge badge-neutral">' + escapeHtml(u.role) + '</span></td>' +
      '<td data-label="Status"><span class="badge ' + st.badgeClass + '">' + escapeHtml(st.label) + '</span></td>' +
      '<td data-label="Aksi">' + (isSelf ? '<span class="text-small text-muted">-</span>' :
        '<button class="btn btn-secondary text-small" data-user="' + u.user_id + '" data-action="role">Ubah Role</button> ' +
        '<button class="btn ' + (u.status === 'AKTIF' ? 'btn-danger' : 'btn-secondary') + ' text-small" data-user="' + u.user_id + '" data-action="toggle" data-status="' + u.status + '">' +
        (u.status === 'AKTIF' ? (icon('xCircle', 'icon-sm') + 'Nonaktifkan') : (icon('checkCircle', 'icon-sm') + 'Aktifkan')) + '</button>') + '</td></tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Pengguna</h1><button class="btn btn-primary" id="btn-add-user">' + icon('plus') + 'Tambah User</button></div>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Email</th><th>Nama</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

  document.getElementById('btn-add-user').addEventListener('click', openUserForm);
  contentArea().querySelectorAll('[data-action="role"]').forEach(function (btn) {
    btn.addEventListener('click', function () { openChangeRoleForm(btn.dataset.user); });
  });
  contentArea().querySelectorAll('[data-action="toggle"]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var newStatus = btn.dataset.status === 'AKTIF' ? 'NONAKTIF' : 'AKTIF';
      var res2 = await apiCall('setUserStatus', { userId: btn.dataset.user, status: newStatus });
      if (!res2.success) return showToast(res2.error.message, 'danger');
      showToast('Status pengguna diubah.', 'success');
      renderUsers();
    });
  });
}

function openUserForm() {
  openModal('Tambah Pengguna',
    field('Email (Google)', 'email', true, 'email') +
    field('Nama', 'nama', true) +
    selectField('Role', 'role', ROLE_OPTIONS, true),
    async function (formData) {
      setModalSubmitting(true);
      var res = await apiCall('createUser', {
        email: formData.get('email'), nama: formData.get('nama'), role: formData.get('role'),
        clientRequestId: cryptoRandomId()
      });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Pengguna berhasil ditambahkan.', 'success');
      renderUsers();
    });
}

function openChangeRoleForm(userId) {
  openModal('Ubah Role', selectField('Role Baru', 'role', ROLE_OPTIONS, true),
    async function (formData) {
      setModalSubmitting(true, 'Ubah');
      var res = await apiCall('updateUserRole', { userId: userId, role: formData.get('role') });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Role pengguna diubah.', 'success');
      renderUsers();
    });
}

/* ============================================================ AUDIT LOG (ADMIN only) */
async function renderAuditLog() {
  setPageTitle('Audit Log');
  showLoading();
  var res = await apiCall('getAuditLog', {});
  if (!res.success) return showError(res.error);

  var rows = res.data.map(function (l) {
    return '<tr><td data-label="Waktu">' + escapeHtml(l.timestamp) + '</td>' +
      '<td data-label="User">' + escapeHtml(l.user) + '</td>' +
      '<td data-label="Aksi"><span class="badge badge-neutral">' + escapeHtml(l.action) + '</span></td>' +
      '<td data-label="Modul">' + escapeHtml(l.module) + '</td>' +
      '<td data-label="Record ID">' + escapeHtml(l.record_id) + '</td>' +
      '<td data-label="Keterangan">' + escapeHtml(l.description) + '</td></tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Audit Log</h1></div>' +
    (res.data.length === 0 ? '<div class="empty-state">Belum ada aktivitas tercatat.</div>' :
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Modul</th><th>Record ID</th><th>Keterangan</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
}

/* ============================================================ PENGATURAN (ADMIN only) */
async function renderSettings() {
  setPageTitle('Pengaturan');
  showLoading();
  var res = await apiCall('getAppSettings', {});
  if (!res.success) return showError(res.error);
  var s = res.data;

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Pengaturan Aplikasi</h1></div>' +
    '<div class="card" style="max-width:480px;">' +
      '<form id="settings-form">' +
        settingsField('Nama Aplikasi', 'nama_aplikasi', s.nama_aplikasi, 'text', 'Ditampilkan di header & cetak laporan.') +
        settingsField('Tahun Aktif', 'tahun_aktif', s.tahun_aktif, 'number', 'Tahun operasional berjalan.') +
        settingsField('ID Folder Drive — PDF', 'folder_drive_pdf', s.folder_drive_pdf, 'text', 'Belum dipakai aktif — untuk fitur simpan PDF ke Drive mendatang.') +
        settingsField('ID Folder Drive — Backup', 'folder_drive_backup', s.folder_drive_backup, 'text', 'Belum dipakai aktif — untuk fitur backup otomatis mendatang.') +
        '<button type="submit" class="btn btn-primary" id="settings-submit">Simpan Pengaturan</button>' +
      '</form>' +
    '</div>';

  document.getElementById('settings-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var btn = document.getElementById('settings-submit');
    btn.disabled = true; btn.textContent = 'Menyimpan...';
    var res2 = await apiCall('updateAppSettings', {
      nama_aplikasi: fd.get('nama_aplikasi'), tahun_aktif: fd.get('tahun_aktif'),
      folder_drive_pdf: fd.get('folder_drive_pdf'), folder_drive_backup: fd.get('folder_drive_backup')
    });
    btn.disabled = false; btn.textContent = 'Simpan Pengaturan';
    if (!res2.success) { showToast(res2.error.message, 'danger'); return; }
    showToast('Pengaturan berhasil disimpan.', 'success');
  });
}

function settingsField(label, name, value, type, hint) {
  return '<div class="field"><label>' + escapeHtml(label) + '</label>' +
    '<input class="input" name="' + name + '" type="' + type + '" value="' + escapeHtml(value) + '">' +
    '<div class="text-small text-muted" style="margin-top:4px;">' + escapeHtml(hint) + '</div></div>';
}

/* ============================================================ DATA SAYA (data pribadi milik user login sendiri) */
async function renderDataSaya() {
  setPageTitle('Data Saya');
  showLoading();
  var results = await Promise.all([apiCall('getMyMemberData', {}), apiCall('getMyTransactionHistory', {})]);
  var res = results[0], histRes = results[1];
  if (!res.success) return showError(res.error);

  if (!res.data.isMember) {
    contentArea().innerHTML =
      '<div class="content-header"><h1 style="margin:0;">Data Saya</h1></div>' +
      '<div class="empty-state">Akun Anda (' + escapeHtml(currentUser.email) + ') belum terdaftar sebagai anggota koperasi, ' +
      'jadi tidak ada data simpanan/pinjaman pribadi untuk ditampilkan.</div>';
    return;
  }

  var m = res.data;
  var st = getSimpleStatusView(m.status);
  var hist = histRes.success ? histRes.data : null;

  contentArea().innerHTML =
    '<div class="content-header"><div><h1 style="margin:0;">' + escapeHtml(m.nama) + '</h1>' +
      '<p class="text-muted" style="margin:4px 0 0;">' + escapeHtml(m.member_id) + ' &middot; ' + escapeHtml(m.unit || '-') +
      ' &middot; <span class="badge ' + st.badgeClass + '">' + escapeHtml(st.label) + '</span></p></div></div>' +
    '<div class="grid-summary mb-6">' +
      summaryCard('Simpanan Wajib', formatRupiah(m.savings.wajib), '') +
      summaryCard('Simpanan Sukarela', formatRupiah(m.savings.sukarela), '') +
      summaryCard('Total Simpanan', formatRupiah(m.savings.total), '') +
      summaryCard('Total Infaq', formatRupiah(m.infaqTotal), '') +
      summaryCard('Total Pinjaman', formatRupiah(m.loans.totalPinjaman), '') +
      summaryCard('Total Dibayar', formatRupiah(m.loans.totalPembayaran), '') +
      summaryCard('Sisa Pinjaman', formatRupiah(m.loans.sisa), '') +
    '</div>' +
    '<h2>Riwayat Setoran Simpanan Saya</h2>' + (hist ? renderMiniTable({ success: true, data: hist.savings }, ['tanggal', 'jenis', 'nominal'], ['Tanggal', 'Jenis', 'Nominal']) : '') +
    '<h2 style="margin-top:var(--space-6);">Riwayat Penarikan Simpanan Saya</h2>' + (hist ? renderMiniTable({ success: true, data: hist.withdrawals || [] }, ['tanggal', 'jenis', 'nominal'], ['Tanggal', 'Jenis', 'Nominal']) : '') +
    '<h2 style="margin-top:var(--space-6);">Riwayat Infaq Saya</h2>' + (hist ? renderMiniTable({ success: true, data: hist.infaq }, ['tanggal', 'nominal'], ['Tanggal', 'Nominal']) : '') +
    '<h2 style="margin-top:var(--space-6);">Pinjaman Saya</h2>' + (hist ? renderLoanMiniTable({ success: true, data: hist.loans }) : '') +
    '<h2 style="margin-top:var(--space-6);">Riwayat Pembayaran Saya</h2>' + (hist ? renderMiniTable({ success: true, data: hist.payments }, ['tanggal', 'loan_id', 'nominal'], ['Tanggal', 'Pinjaman', 'Nominal']) : '');
}
