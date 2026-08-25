// ============================================================
// Helper client bersama — STEP 4.2, diperbarui STEP "Koneksi
// Spreadsheet<->Frontend" untuk memakai auth.js/api.js sungguhan,
// dan sekali lagi untuk branding ARISAN WK + navigasi mobile
// (drawer + hamburger) yang diperbaiki.
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

  // ---- Branding (ARISAN WK / Wanita Keadilan) — satu tempat, dipakai
  //      renderSidebar() & bisa dipakai ulang di tempat lain kalau perlu. ----
  var APP_BRAND = {
    name: 'ARISAN WK',
    subtitle: 'Wanita Keadilan',
    logoUrl: 'assets/pks.png'
  };

  // ---- Definisi navigasi (§5 Prompt Tahap 4) dengan syarat role (Tahap 2 §K) ----
  var NAV_STRUCTURE = [
    { key: 'dashboard', label: 'Dashboard', icon: 'home', roles: ['ADMIN','PETUGAS','PIMPINAN','VIEWER'] },
    { key: 'data-saya', label: 'Data Saya', icon: 'user', roles: ['ADMIN','PETUGAS','PIMPINAN','VIEWER'] },
    { group: 'Data', items: [
      // Aturan visibilitas: PIMPINAN/VIEWER TIDAK boleh lihat data anggota
      // LAIN (hanya data umum/agregat + data pribadi sendiri lewat "Data
      // Saya" di atas) -- PETUGAS dikecualikan karena tugasnya memang
      // mencatat transaksi untuk anggota lain. Backend menegakkan ini juga
      // (BROAD_READ_ROLES di Config.gs) -- ini murni supaya menunya tidak
      // menyesatkan, bukan satu-satunya lapisan keamanan.
      { key: 'anggota-list', label: 'Anggota', icon: 'users', roles: ['ADMIN','PETUGAS'] },
      { key: 'simpanan-list', label: 'Simpanan', icon: 'dollarSign', roles: ['ADMIN','PETUGAS'] },
      { key: 'infaq-list', label: 'Infaq', icon: 'gift', roles: ['ADMIN','PETUGAS'] }
    ]},
    { group: 'Pinjaman', items: [
      { key: 'pinjaman-list', label: 'Daftar Pinjaman', icon: 'fileText', roles: ['ADMIN','PETUGAS'] },
      { key: 'pinjaman-form', label: 'Pengajuan', icon: 'plusCircle', roles: ['ADMIN','PETUGAS'] },
      { key: 'pembayaran-form', label: 'Pembayaran', icon: 'creditCard', roles: ['ADMIN','PETUGAS'] }
    ]},
    { group: 'Laporan', items: [
      { key: 'laporan', label: 'Semua Laporan', icon: 'barChart', roles: ['ADMIN','PETUGAS','PIMPINAN','VIEWER'] }
    ]},
    { group: 'Sistem', items: [
      { key: 'users', label: 'Pengguna', icon: 'userCheck', roles: ['ADMIN'] },
      { key: 'audit-log', label: 'Audit Log', icon: 'clock', roles: ['ADMIN'] },
      { key: 'settings', label: 'Pengaturan', icon: 'settings', roles: ['ADMIN'] }
    ]}
  ];

  function renderSidebar(currentUser, activeKey) {
    var root = document.getElementById('sidebar-nav');
    if (!root) return;
    var html =
      '<div class="brand">' +
        '<img src="' + APP_BRAND.logoUrl + '" alt="Logo" class="brand-logo">' +
        '<span class="brand-copy"><strong>' + APP_BRAND.name + '</strong><small>' + APP_BRAND.subtitle + '</small></span>' +
      '</div>';
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
           (item.icon ? icon(item.icon, 'icon-sm') : '') +
           '<span class="label">' + item.label + '</span></a>';
  }

  function renderUserChip(currentUser) {
    var el = document.getElementById('header-user-chip');
    if (!el) return;
    el.innerHTML = '<span>' + currentUser.nama + '</span><span class="role">(' + currentUser.role + ')</span>' +
                   ' <button type="button" class="btn btn-ghost text-small" id="logout-btn">' + icon('logOut', 'icon-sm') + 'Keluar</button>';
    document.getElementById('logout-btn').addEventListener('click', signOut);
  }

  // ---- Navigasi mobile (hamburger + drawer) ----
  // Diperbaiki: sebelumnya beberapa lapis CSS untuk .sidebar saling
  // menimpa (peninggalan beberapa kali revisi UI) sehingga drawer kadang
  // gagal terbuka di orientasi potret. styles.css sekarang HANYA punya
  // SATU definisi drawer mobile (lihat @media max-width:767px di sana) --
  // JS di sini murni menambah/menghapus class 'open', tidak bergantung
  // pada orientasi sama sekali, cuma lebar layar (lewat CSS).
  function isMobileMenuOpen() {
    var sidebar = document.getElementById('sidebar-nav');
    return !!(sidebar && sidebar.classList.contains('open'));
  }

  function openMobileMenu() {
    var sidebar = document.getElementById('sidebar-nav');
    var backdrop = document.getElementById('sidebar-backdrop');
    var menuBtn = document.getElementById('mobile-menu-btn');
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('mobile-menu-open'); // cegah scroll di belakang drawer
  }

  function closeMobileMenu() {
    var sidebar = document.getElementById('sidebar-nav');
    var backdrop = document.getElementById('sidebar-backdrop');
    var menuBtn = document.getElementById('mobile-menu-btn');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('mobile-menu-open');
  }

  function toggleMobileMenu() {
    if (isMobileMenuOpen()) closeMobileMenu(); else openMobileMenu();
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Render awal (sidebar/header) dilakukan auth.js lewat onLoginSuccess()
    // setelah login/verifikasi token berhasil. initGoogleSignIn() TIDAK
    // dipanggil langsung di sini lagi -- tryRestoreSession() yang
    // memutuskan: pulihkan sesi tersimpan, coba auto-sign-in diam-diam,
    // atau baru render tombol manual sebagai fallback (lihat auth.js).
    tryRestoreSession();

    var menuBtn = document.getElementById('mobile-menu-btn');
    if (menuBtn) menuBtn.innerHTML = icon('menu');
    var backdrop = document.getElementById('sidebar-backdrop');
    if (menuBtn) menuBtn.addEventListener('click', toggleMobileMenu);
    if (backdrop) backdrop.addEventListener('click', closeMobileMenu);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMobileMenu();
    });

    document.getElementById('sidebar-nav').addEventListener('click', function (e) {
      var target = e.target.closest('.nav-item');
      if (!target) return;
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
      target.classList.add('active');
      var titleEl = document.getElementById('page-title');
      if (titleEl) titleEl.textContent = target.querySelector('.label').textContent;
      renderView(target.getAttribute('data-page'));
      closeMobileMenu(); // pilih menu -> drawer otomatis tertutup di mobile
    });
  });
