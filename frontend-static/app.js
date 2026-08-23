// ============================================================
// Helper client bersama — STEP 4.2, diperbarui STEP "Koneksi
// Spreadsheet<->Frontend" untuk memakai auth.js/api.js sungguhan
// (menggantikan MOCK_CURRENT_USER).
// ============================================================

  /** Cermin formatRupiah di Utils.gs (backend) — HARUS identik hasilnya. */
  function formatRupiah(number) {
    var n = Math.round(Number(number) || 0);
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n).toString();
    var withDots = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return sign + 'Rp' + withDots;
  }

  /** Format tanggal "23 Agustus 2026" (§37 Prompt Tahap 4). */
  var BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  function formatTanggalID(dateLike) {
    var d = (dateLike instanceof Date) ? dateLike : new Date(dateLike);
    return d.getDate() + ' ' + BULAN_ID[d.getMonth()] + ' ' + d.getFullYear();
  }

  /**
   * Peta status pinjaman -> { label, badgeClass }.
   * PENTING (lihat catatan "AKTIF" di dokumen perencanaan Tahap 4):
   * kolom `status` di database TETAP salah satu dari 6 nilai kontrak
   * Tahap 2 (DIAJUKAN/DISETUJUI/DITOLAK/DICAIRKAN/LUNAS/DIBATALKAN).
   * "AKTIF" HANYA label tampilan untuk DICAIRKAN dengan sisa > 0 —
   * dipetakan di sini, satu tempat, tidak diduplikasi ke halaman lain.
   */
  function getLoanStatusView(loan) {
    var status = loan.status;
    var sisa = Number(loan.sisa_pinjaman);
    if (status === 'DICAIRKAN' && sisa > 0) {
      return { label: 'AKTIF', badgeClass: 'badge-info' };
    }
    switch (status) {
      case 'DIAJUKAN':   return { label: 'DIAJUKAN', badgeClass: 'badge-warning' };
      case 'DISETUJUI':  return { label: 'DISETUJUI', badgeClass: 'badge-info' };
      case 'DITOLAK':    return { label: 'DITOLAK', badgeClass: 'badge-danger' };
      case 'LUNAS':      return { label: 'LUNAS', badgeClass: 'badge-success' };
      case 'DIBATALKAN': return { label: 'DIBATALKAN', badgeClass: 'badge-neutral' };
      default:           return { label: status, badgeClass: 'badge-neutral' };
    }
  }

  /** Peta status anggota/user -> badge. */
  function getSimpleStatusView(status) {
    var positif = ['AKTIF'];
    var negatif = ['TIDAK AKTIF', 'NONAKTIF'];
    if (positif.indexOf(status) > -1) return { label: status, badgeClass: 'badge-success' };
    if (negatif.indexOf(status) > -1) return { label: status, badgeClass: 'badge-neutral' };
    return { label: status, badgeClass: 'badge-neutral' };
  }

  // ---- Definisi navigasi (§5 Prompt Tahap 4) dengan syarat role (Tahap 2 §K) ----
  var NAV_STRUCTURE = [
    { key: 'dashboard', label: 'Dashboard', roles: ['ADMIN','PETUGAS','PIMPINAN','VIEWER'] },
    { group: 'Data', items: [
      { key: 'anggota-list', label: 'Anggota', roles: ['ADMIN','PETUGAS','PIMPINAN','VIEWER'] },
      { key: 'simpanan-list', label: 'Simpanan', roles: ['ADMIN','PETUGAS','PIMPINAN','VIEWER'] },
      { key: 'infaq-list', label: 'Infaq', roles: ['ADMIN','PETUGAS','PIMPINAN','VIEWER'] }
    ]},
    { group: 'Pinjaman', items: [
      { key: 'pinjaman-list', label: 'Daftar Pinjaman', roles: ['ADMIN','PETUGAS','PIMPINAN','VIEWER'] },
      { key: 'pinjaman-form', label: 'Pengajuan', roles: ['ADMIN','PETUGAS'] },
      { key: 'pembayaran-form', label: 'Pembayaran', roles: ['ADMIN','PETUGAS'] }
    ]},
    { group: 'Laporan', items: [
      { key: 'laporan', label: 'Semua Laporan', roles: ['ADMIN','PETUGAS','PIMPINAN','VIEWER'] }
    ]},
    { group: 'Sistem', items: [
      { key: 'users', label: 'Pengguna', roles: ['ADMIN'] },
      { key: 'audit-log', label: 'Audit Log', roles: ['ADMIN'] },
      { key: 'settings', label: 'Pengaturan', roles: ['ADMIN'] }
    ]}
  ];

  function renderSidebar(currentUser, activeKey) {
    var root = document.getElementById('sidebar-nav');
    if (!root) return;
    var html = '<div class="brand"><img src="assets/pks.png" alt="Logo PKS" class="brand-logo"><span class="brand-copy"><strong>ARISAN WK</strong><small>Wanita Keadilan</small></span></div>';
    NAV_STRUCTURE.forEach(function (entry) {
      if (entry.group) {
        var visibleItems = entry.items.filter(function (it) { return it.roles.indexOf(currentUser.role) > -1; });
        if (visibleItems.length === 0) return;
        html += '<div class="group-label">' + entry.group + '</div>';
        visibleItems.forEach(function (it) { html += navItemHtml(it, activeKey); });
      } else {
        if (entry.roles.indexOf(currentUser.role) === -1) return;
        html += navItemHtml(entry, activeKey);
      }
    });
    root.innerHTML = html;
  }

  function navItemHtml(item, activeKey) {
    var activeClass = item.key === activeKey ? ' active' : '';
    return '<a class="nav-item' + activeClass + '" href="#" data-page="' + item.key + '">' +
           '<span class="label">' + item.label + '</span></a>';
  }

  function renderUserChip(currentUser) {
    var el = document.getElementById('header-user-chip');
    if (!el) return;
    el.innerHTML = '<span>' + currentUser.nama + '</span><span class="role">(' + currentUser.role + ')</span>' +
                   ' <button type="button" class="btn btn-ghost text-small" id="logout-btn">Keluar</button>';
    document.getElementById('logout-btn').addEventListener('click', signOut);
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Render awal (sidebar/header) dilakukan auth.js lewat onLoginSuccess()
    // setelah login/verifikasi token berhasil -- bukan di sini lagi.
    tryRestoreSession();
    initGoogleSignIn();

    var menuBtn = document.getElementById('mobile-menu-btn');
    var sidebar = document.getElementById('sidebar-nav');
    var backdrop = document.getElementById('sidebar-backdrop');
    function closeMobileMenu() {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
      if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    }
    if (menuBtn) menuBtn.addEventListener('click', function () {
      var isOpen = sidebar.classList.toggle('open');
      backdrop.classList.toggle('open', isOpen);
      menuBtn.setAttribute('aria-expanded', String(isOpen));
    });
    if (backdrop) backdrop.addEventListener('click', closeMobileMenu);

    document.getElementById('sidebar-nav').addEventListener('click', function (e) {
      var target = e.target.closest('.nav-item');
      if (!target) return;
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
      target.classList.add('active');
      var titleEl = document.getElementById('page-title');
      if (titleEl) titleEl.textContent = target.querySelector('.label').textContent;
      renderView(target.getAttribute('data-page'));
      closeMobileMenu();
    });
  });
