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
      summaryCard('Total Simpanan', formatRupiah(d.totalSimpanan), 'Wajib ' + formatRupiah(d.totalSimpananWajib) + ' + Sukarela ' + formatRupiah(d.totalSimpananSukarela)) +
      summaryCard('Total Infaq', formatRupiah(d.totalInfaq), 'Terpisah dari simpanan') +
      summaryCard('Total Piutang', formatRupiah(d.totalPiutang), d.jumlahPinjamanAktif + ' pinjaman aktif') +
      summaryCard('Pinjaman Dicairkan', formatRupiah(d.totalPinjamanDicairkan), '') +
      summaryCard('Total Pembayaran', formatRupiah(d.totalPembayaran), '') +
      summaryCard('Pinjaman Aktif', d.jumlahPinjamanAktif, '') +
      summaryCard('Pinjaman Lunas', d.jumlahPinjamanLunas, '') +
    '</div>';
}
function summaryCard(label, value, sub) {
  return '<div class="card summary-card"><div class="label">' + escapeHtml(label) + '</div>' +
         '<div class="value amount">' + escapeHtml(value) + '</div>' +
         (sub ? '<div class="sub">' + escapeHtml(sub) + '</div>' : '') + '</div>';
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
    return '<tr class="row-clickable" data-member-id="' + escapeHtml(m.member_id) + '" style="cursor:pointer;">' +
      '<td data-label="Nomor">' + escapeHtml(m.nomor_anggota) + '</td>' +
      '<td data-label="Nama">' + escapeHtml(m.nama) + '</td>' +
      '<td data-label="No HP">' + escapeHtml(m.no_hp) + '</td>' +
      '<td data-label="Status"><span class="badge ' + st.badgeClass + '">' + escapeHtml(st.label) + '</span></td>' +
      '</tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Daftar Anggota</h1>' +
    (canEdit ? '<button class="btn btn-primary" id="btn-add-anggota">+ Tambah Anggota</button>' : '') +
    '</div>' +
    (res.data.length === 0
      ? '<div class="empty-state">Belum ada anggota.' + (canEdit ? '<br><button class="btn btn-secondary" id="btn-add-anggota-empty">+ Tambah Anggota</button>' : '') + '</div>'
      : '<div class="table-wrap"><table class="data-table"><thead><tr><th>Nomor</th><th>Nama</th><th>No HP</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>');

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
}

var currentDetailMemberId = null;

/** Halaman Detail Anggota (Tahap 4 §13-14 — "salah satu halaman paling penting"). */
async function renderAnggotaDetail(memberId) {
  setPageTitle('Detail Anggota');
  showLoading();
  // PERFORMA: 5 panggilan ini SALING BEBAS (tidak butuh hasil satu sama
  // lain) tapi sebelumnya dijalankan satu-satu (await berurutan) --
  // artinya total waktu tunggu = jumlah SEMUA latensi request, bukan cuma
  // yang paling lambat. Promise.all menjalankannya bersamaan.
  var results = await Promise.all([
    apiCall('getMember', { memberId: memberId }),
    apiCall('getSavings', { filter: { member_id: memberId } }),
    apiCall('getInfaqList', { filter: { member_id: memberId } }),
    apiCall('getLoans', { filter: { member_id: memberId } }),
    apiCall('getMemberPayments', { memberId: memberId })
  ]);
  var res = results[0], savingsRes = results[1], infaqRes = results[2], loansRes = results[3], paymentsRes = results[4];
  if (!res.success) return showError(res.error);
  var m = res.data;
  var st = getSimpleStatusView(m.status);

  contentArea().innerHTML =
    '<button class="btn btn-ghost text-small" id="btn-back-anggota" style="margin-bottom:var(--space-4);">&larr; Kembali ke Daftar Anggota</button>' +
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
    '<h2>Riwayat Simpanan</h2>' + renderMiniTable(savingsRes, ['tanggal', 'jenis', 'nominal'], ['Tanggal', 'Jenis', 'Nominal']) +
    '<h2 style="margin-top:var(--space-6);">Riwayat Infaq</h2>' + renderMiniTable(infaqRes, ['tanggal', 'nominal'], ['Tanggal', 'Nominal']) +
    '<h2 style="margin-top:var(--space-6);">Pinjaman</h2>' + renderLoanMiniTable(loansRes) +
    '<h2 style="margin-top:var(--space-6);">Riwayat Pembayaran</h2>' + renderMiniTable(paymentsRes, ['tanggal', 'loan_id', 'nominal'], ['Tanggal', 'Pinjaman', 'Nominal']);

  document.getElementById('btn-back-anggota').addEventListener('click', renderAnggotaList);
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
    return '<tr><td data-label="No Pinjaman">' + escapeHtml(l.loan_id) + '</td>' +
      '<td data-label="Nilai" class="col-amount amount">' + escapeHtml(formatRupiah(l.totalPinjaman)) + '</td>' +
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

function field(label, name, required, type) {
  return '<div class="field"><label>' + escapeHtml(label) + (required ? '<span class="required">*</span>' : '') + '</label>' +
         '<input class="input" name="' + name + '" type="' + (type || 'text') + '"' + (required ? ' required' : '') + '></div>';
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
    (canEdit ? '<button class="btn btn-primary" id="btn-add-simpanan">+ Catat Simpanan</button>' : '') + '</div>' +
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
        nominal: Number(formData.get('nominal')), keterangan: formData.get('keterangan'),
        clientRequestId: cryptoRandomId()
      });
      setModalSubmitting(false);
      if (!res.success) { showToast(res.error.message, 'danger'); return; }
      closeModal();
      showToast('Simpanan berhasil dicatat: ' + res.data.transaction_id, 'success');
      renderSimpananList();
    });
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
    (canEdit ? '<button class="btn btn-primary" id="btn-add-infaq">+ Catat Infaq</button>' : '') + '</div>' +
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
        member_id: formData.get('member_id') || '', nominal: Number(formData.get('nominal')),
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
      actions = '<button class="btn btn-secondary text-small" data-action="approve" data-loan="' + l.loan_id + '">Setujui</button> ' +
                '<button class="btn btn-danger text-small" data-action="reject" data-loan="' + l.loan_id + '">Tolak</button>';
    } else if (isAdmin && l.status === 'DISETUJUI') {
      actions = '<button class="btn btn-primary text-small" data-action="disburse" data-loan="' + l.loan_id + '" data-nominal="' + l.totalPinjaman + '">Cairkan</button>';
    }
    return '<tr><td data-label="No Pinjaman">' + escapeHtml(l.loan_id) + '</td>' +
      '<td data-label="Anggota">' + escapeHtml(memberNameById(l.member_id)) + '</td>' +
      '<td data-label="Pinjaman" class="col-amount amount">' + escapeHtml(formatRupiah(l.totalPinjaman)) + '</td>' +
      '<td data-label="Sisa" class="col-amount amount">' + escapeHtml(formatRupiah(l.sisa)) + '</td>' +
      '<td data-label="Status"><span class="badge ' + loanStatusBadgeClass(l.statusView) + '">' + escapeHtml(l.statusView) + '</span></td>' +
      '<td data-label="Aksi">' + actions + '</td></tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Daftar Pinjaman</h1>' +
    (canApply ? '<button class="btn btn-primary" id="btn-add-pinjaman">+ Pengajuan Pinjaman</button>' : '') + '</div>' +
    (res.data.length === 0
      ? '<div class="empty-state">Belum ada pinjaman.</div>'
      : '<div class="table-wrap"><table class="data-table"><thead><tr><th>No Pinjaman</th><th>Anggota</th><th class="col-amount">Pinjaman</th><th class="col-amount">Sisa</th><th>Status</th><th>Aksi</th></tr></thead><tbody>' + rows + '</tbody></table></div>');

  var btnAdd = document.getElementById('btn-add-pinjaman');
  if (btnAdd) btnAdd.addEventListener('click', openPinjamanForm);
  contentArea().querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () { handleLoanAction(btn.dataset.action, btn.dataset.loan, btn.dataset.nominal); });
  });

  if (openFormDirectly && canApply) openPinjamanForm();
}

async function handleLoanAction(action, loanId, nominal) {
  if (action === 'approve') {
    if (!confirm('Setujui pinjaman ' + loanId + '?')) return;
    var res = await apiCall('approveLoan', { loanId: loanId });
    if (!res.success) return showToast(res.error.message, 'danger');
    showToast('Pinjaman disetujui.', 'success');
    renderPinjamanList();
  } else if (action === 'reject') {
    var reason = prompt('Alasan penolakan (wajib diisi):');
    if (!reason) return;
    var res2 = await apiCall('rejectLoan', { loanId: loanId, reason: reason });
    if (!res2.success) return showToast(res2.error.message, 'danger');
    showToast('Pinjaman ditolak.', 'success');
    renderPinjamanList();
  } else if (action === 'disburse') {
    if (!confirm('Cairkan pinjaman ' + loanId + ' sebesar ' + formatRupiah(nominal) + '?')) return;
    var res3 = await apiCall('disburseLoan', { loanId: loanId, nominalPencairan: Number(nominal) });
    if (!res3.success) return showToast(res3.error.message, 'danger');
    showToast('Pinjaman dicairkan.', 'success');
    renderPinjamanList();
  }
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
        member_id: formData.get('member_id'), nominal_pengajuan: Number(formData.get('nominal_pengajuan')),
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
      var nominal = Number(formData.get('nominal'));
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
  { key: 'anggota', label: 'Anggota', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'simpanan', label: 'Simpanan', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'infaq', label: 'Infaq', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'pinjaman', label: 'Semua Pinjaman', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'pinjaman-aktif', label: 'Pinjaman Aktif', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'pinjaman-lunas', label: 'Pinjaman Lunas', roles: ['ADMIN', 'PETUGAS'] },
  { key: 'pembayaran', label: 'Pembayaran', roles: ['ADMIN', 'PETUGAS'] },
  // "Rekap Periode" murni agregat (tidak merinci per-anggota) -- data umum,
  // jadi PIMPINAN/VIEWER tetap boleh (aturan visibilitas data).
  { key: 'periode', label: 'Rekap Periode', roles: ['ADMIN', 'PETUGAS', 'PIMPINAN', 'VIEWER'] }
];
var laporanActiveTab = 'anggota';

function laporanTabsForRole(role) {
  return LAPORAN_TABS.filter(function (t) { return t.roles.indexOf(role) > -1; });
}

async function renderLaporan() {
  setPageTitle('Laporan');
  var visibleTabs = laporanTabsForRole(currentUser.role);
  // Kalau tab aktif saat ini tidak diizinkan utk role ini (mis. tersisa dari
  // sesi ADMIN sebelumnya), pindah ke tab pertama yang boleh dilihat.
  if (visibleTabs.every(function (t) { return t.key !== laporanActiveTab; })) {
    laporanActiveTab = visibleTabs[0].key;
  }
  var tabsHtml = visibleTabs.map(function (t) {
    var activeClass = t.key === laporanActiveTab ? ' btn-primary' : ' btn-secondary';
    return '<button class="btn text-small' + activeClass + ' no-print" data-laporan-tab="' + t.key + '" style="margin:0 6px 6px 0;">' + escapeHtml(t.label) + '</button>';
  }).join('');
  contentArea().innerHTML =
    '<div class="content-header no-print" style="align-items:flex-start;">' +
      '<div style="flex-wrap:wrap;">' + tabsHtml + '</div>' +
      '<button class="btn btn-secondary" id="btn-cetak-laporan">🖶 Cetak Laporan</button>' +
    '</div>' +
    (visibleTabs.length < LAPORAN_TABS.length
      ? '<p class="text-small text-muted no-print">Sebagian laporan (per-anggota) tidak ditampilkan untuk role Anda -- lihat "Data Saya" untuk data pribadi.</p>'
      : '') +
    '<div id="laporan-body"><div class="empty-state">Memuat...</div></div>';

  contentArea().querySelectorAll('[data-laporan-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      laporanActiveTab = btn.dataset.laporanTab;
      renderLaporan();
    });
  });
  document.getElementById('btn-cetak-laporan').addEventListener('click', printLaporan);

  await renderLaporanBody(laporanActiveTab);
}

/**
 * Isi header/footer cetak (Tahap 5 §27: nama aplikasi, judul, periode,
 * tanggal cetak; footer: dicetak oleh + waktu) lalu panggil window.print().
 * User memilih "Save as PDF" sebagai tujuan cetak di dialog browser --
 * ini yang jadi jalur "export PDF laporan" (Tahap 4 §48 Preview/Print/PDF)
 * tanpa perlu backend menyimpan file ke Drive.
 */
function printLaporan() {
  var tab = LAPORAN_TABS.filter(function (t) { return t.key === laporanActiveTab; })[0];
  var judul = 'Laporan ' + (tab ? tab.label : '');
  var periodeText;
  if (laporanActiveTab === 'periode') {
    var start = document.getElementById('periode-start');
    var end = document.getElementById('periode-end');
    periodeText = 'Periode: ' + (start ? formatTanggalID(start.value) : '-') + ' s/d ' + (end ? formatTanggalID(end.value) : '-');
  } else {
    periodeText = 'Kondisi terkini per ' + formatTanggalID(new Date());
  }
  document.getElementById('print-report-title').textContent = judul;
  document.getElementById('print-report-meta').textContent = periodeText;
  document.getElementById('print-footer-text').textContent =
    'Dicetak oleh: ' + currentUser.nama + ' (' + currentUser.email + ') pada ' + formatTanggalID(new Date()) + ', ' + new Date().toLocaleTimeString('id-ID');
  window.print();
}

async function renderLaporanBody(tabKey) {
  var body = document.getElementById('laporan-body');
  if (!body) return;

  await ensureMembersLoaded();

  if (tabKey === 'anggota') {
    var rows = membersCache.map(function (m) {
      var st = getSimpleStatusView(m.status);
      return '<tr><td data-label="Nomor">' + escapeHtml(m.nomor_anggota) + '</td>' +
        '<td data-label="Nama">' + escapeHtml(m.nama) + '</td>' +
        '<td data-label="No HP">' + escapeHtml(m.no_hp) + '</td>' +
        '<td data-label="Status"><span class="badge ' + st.badgeClass + '">' + escapeHtml(st.label) + '</span></td></tr>';
    }).join('');
    body.innerHTML = laporanTable(['Nomor', 'Nama', 'No HP', 'Status'], rows, membersCache.length);
    return;
  }

  if (tabKey === 'simpanan') {
    var res = await apiCall('getSavingRekapPerMember', {});
    if (!res.success) return showLaporanError(res.error);
    var rows = res.data.map(function (r) {
      return '<tr><td data-label="Anggota">' + escapeHtml(r.nama) + '</td>' +
        '<td data-label="Wajib" class="col-amount amount">' + escapeHtml(formatRupiah(r.wajib)) + '</td>' +
        '<td data-label="Sukarela" class="col-amount amount">' + escapeHtml(formatRupiah(r.sukarela)) + '</td>' +
        '<td data-label="Total" class="col-amount amount">' + escapeHtml(formatRupiah(r.total)) + '</td></tr>';
    }).join('');
    body.innerHTML = laporanTable(['Anggota', 'Wajib', 'Sukarela', 'Total'], rows, res.data.length, ['col-amount', 'col-amount', 'col-amount']);
    return;
  }

  if (tabKey === 'infaq') {
    var res = await apiCall('getInfaqRekapPerMember', {});
    if (!res.success) return showLaporanError(res.error);
    var rows = res.data.map(function (r) {
      return '<tr><td data-label="Anggota">' + escapeHtml(r.nama) + '</td>' +
        '<td data-label="Total Infaq" class="col-amount amount">' + escapeHtml(formatRupiah(r.total)) + '</td></tr>';
    }).join('');
    body.innerHTML = '<p class="text-small text-muted">Infaq dari donatur non-anggota tidak tampil di rekap per-anggota ini (lihat Total Infaq di Dashboard).</p>' +
      laporanTable(['Anggota', 'Total Infaq'], rows, res.data.length);
    return;
  }

  if (tabKey === 'pinjaman' || tabKey === 'pinjaman-aktif' || tabKey === 'pinjaman-lunas') {
    var action = tabKey === 'pinjaman-aktif' ? 'getActiveLoans' : 'getLoans';
    var payload = tabKey === 'pinjaman-lunas' ? { filter: { status: 'LUNAS' } } : {};
    var res = await apiCall(action, payload);
    if (!res.success) return showLaporanError(res.error);
    var rows = res.data.map(function (l) {
      return '<tr><td data-label="No Pinjaman">' + escapeHtml(l.loan_id) + '</td>' +
        '<td data-label="Anggota">' + escapeHtml(memberNameById(l.member_id)) + '</td>' +
        '<td data-label="Pinjaman" class="col-amount amount">' + escapeHtml(formatRupiah(l.totalPinjaman)) + '</td>' +
        '<td data-label="Dibayar" class="col-amount amount">' + escapeHtml(formatRupiah(l.totalPembayaran)) + '</td>' +
        '<td data-label="Sisa" class="col-amount amount">' + escapeHtml(formatRupiah(l.sisa)) + '</td>' +
        '<td data-label="Status"><span class="badge ' + loanStatusBadgeClass(l.statusView) + '">' + escapeHtml(l.statusView) + '</span></td></tr>';
    }).join('');
    body.innerHTML = laporanTable(['No Pinjaman', 'Anggota', 'Pinjaman', 'Dibayar', 'Sisa', 'Status'], rows, res.data.length);
    return;
  }

  if (tabKey === 'pembayaran') {
    var res = await apiCall('getPayments', {});
    if (!res.success) return showLaporanError(res.error);
    var rows = res.data.map(function (p) {
      return '<tr><td data-label="ID">' + escapeHtml(p.payment_id) + '</td>' +
        '<td data-label="Tanggal">' + escapeHtml(p.tanggal) + '</td>' +
        '<td data-label="Pinjaman">' + escapeHtml(p.loan_id) + '</td>' +
        '<td data-label="Anggota">' + escapeHtml(memberNameById(p.member_id)) + '</td>' +
        '<td data-label="Nominal" class="col-amount amount">' + escapeHtml(formatRupiah(p.nominal)) + '</td>' +
        '<td data-label="Petugas">' + escapeHtml(p.petugas) + '</td></tr>';
    }).join('');
    body.innerHTML = laporanTable(['ID', 'Tanggal', 'Pinjaman', 'Anggota', 'Nominal', 'Petugas'], rows, res.data.length);
    return;
  }

  if (tabKey === 'periode') {
    var today = new Date().toISOString().slice(0, 10);
    var firstOfMonth = today.slice(0, 8) + '01';
    body.innerHTML =
      '<div class="card" style="margin-bottom:var(--space-4); display:flex; gap:var(--space-3); align-items:flex-end; flex-wrap:wrap;">' +
        '<div class="field" style="margin:0;"><label>Tanggal Awal</label><input class="input" type="date" id="periode-start" value="' + firstOfMonth + '"></div>' +
        '<div class="field" style="margin:0;"><label>Tanggal Akhir</label><input class="input" type="date" id="periode-end" value="' + today + '"></div>' +
        '<button class="btn btn-primary" id="btn-periode-load">Tampilkan</button>' +
      '</div>' +
      '<div id="periode-result"></div>';
    document.getElementById('btn-periode-load').addEventListener('click', loadPeriodeReport);
    await loadPeriodeReport();
    return;
  }
}

async function loadPeriodeReport() {
  var resultEl = document.getElementById('periode-result');
  var start = document.getElementById('periode-start').value;
  var end = document.getElementById('periode-end').value;
  resultEl.innerHTML = '<div class="empty-state">Memuat...</div>';
  var res = await apiCall('getPeriodReport', { startDate: start, endDate: end });
  if (!res.success) { resultEl.innerHTML = '<div class="alert alert-danger">' + escapeHtml(res.error.message) + '</div>'; return; }
  var d = res.data;
  resultEl.innerHTML =
    '<p class="text-small text-muted">Aktivitas transaksi PADA PERIODE ini -- berbeda dari saldo terkini di Dashboard (lihat Tahap 5 §36).</p>' +
    '<div class="grid-summary">' +
      summaryCard('Simpanan Wajib', formatRupiah(d.simpananWajib), '') +
      summaryCard('Simpanan Sukarela', formatRupiah(d.simpananSukarela), '') +
      summaryCard('Infaq', formatRupiah(d.infaq), '') +
      summaryCard('Pinjaman Dicairkan', formatRupiah(d.pinjamanDicairkan), '') +
      summaryCard('Pembayaran', formatRupiah(d.pembayaran), '') +
      summaryCard('Jumlah Transaksi', d.jumlahTransaksi, '') +
    '</div>';
}

function laporanTable(headers, rowsHtml, count, amountCols) {
  if (count === 0) return '<div class="empty-state">Belum ada data.</div>';
  var thead = headers.map(function (h, i) {
    return '<th' + (amountCols && amountCols[i] ? ' class="col-amount"' : '') + '>' + escapeHtml(h) + '</th>';
  }).join('');
  return '<div class="table-wrap"><table class="data-table"><thead><tr>' + thead + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
}
function showLaporanError(err) {
  var body = document.getElementById('laporan-body');
  if (body) body.innerHTML = '<div class="alert alert-danger">' + escapeHtml(err && err.message) + '</div>';
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
        (u.status === 'AKTIF' ? 'Nonaktifkan' : 'Aktifkan') + '</button>') + '</td></tr>';
  }).join('');

  contentArea().innerHTML =
    '<div class="content-header"><h1 style="margin:0;">Pengguna</h1><button class="btn btn-primary" id="btn-add-user">+ Tambah User</button></div>' +
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
    '<h2>Riwayat Simpanan Saya</h2>' + (hist ? renderMiniTable({ success: true, data: hist.savings }, ['tanggal', 'jenis', 'nominal'], ['Tanggal', 'Jenis', 'Nominal']) : '') +
    '<h2 style="margin-top:var(--space-6);">Riwayat Infaq Saya</h2>' + (hist ? renderMiniTable({ success: true, data: hist.infaq }, ['tanggal', 'nominal'], ['Tanggal', 'Nominal']) : '') +
    '<h2 style="margin-top:var(--space-6);">Pinjaman Saya</h2>' + (hist ? renderLoanMiniTable({ success: true, data: hist.loans }) : '') +
    '<h2 style="margin-top:var(--space-6);">Riwayat Pembayaran Saya</h2>' + (hist ? renderMiniTable({ success: true, data: hist.payments }, ['tanggal', 'loan_id', 'nominal'], ['Tanggal', 'Pinjaman', 'Nominal']) : '');
}
