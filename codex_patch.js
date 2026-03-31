(function () {
  if (window.__codexFeaturePatchLoaded) return;
  window.__codexFeaturePatchLoaded = true;

  const PATCH_PAGE_TITLES = {
    dashboard: 'داشبۆرد',
    products: 'کاڵاکان',
    addProduct: 'زیادکردنی کاڵای نوێ',
    profits: 'ڕاپۆرت و قازانج',
    expenses: 'خەرجییەکان',
    currencies: 'دراوەکان',
    suppliers: 'فرۆشیارەکان',
    settings: 'ڕێکخستن و پشتگیری',
    customers: 'کڕیارەکان',
  };

  let dashboardQuickAction = 'sell';
  let reportExportMode = 'business';
  let reportExportProductId = '';
  let globalSearchQuery = '';
  let globalSearchTimer = null;
  let globalSearchFlatResults = [];
  let globalSearchActiveIndex = -1;
  const undoStack = [];
  let undoToastTimer = null;

  function activePageName() {
    const page = document.querySelector('.page.active');
    return page ? page.id.replace(/^pg-/, '') : 'dashboard';
  }

  function escAttr(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function injectPatchStyles() {
    if (document.getElementById('codex-patch-style')) return;
    const style = document.createElement('style');
    style.id = 'codex-patch-style';
    style.textContent = `
      .mobile-menu-fab{display:none !important}
      .topbar-main{display:flex;align-items:center;gap:10px;min-width:0}
      .topbar-main h2{margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .global-search{position:relative;min-width:300px;max-width:460px;width:min(46vw,460px)}
      .global-search input{width:100%;padding:10px 70px 10px 36px;background:var(--bg3);border:1.5px solid var(--border);border-radius:999px;color:var(--text);font-family:inherit;font-size:13px}
      .global-search input:focus{outline:none;border-color:var(--primary)}
      .global-search-ico{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
      .global-search-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:2px 6px}
      .global-search-results{position:absolute;top:calc(100% + 10px);right:0;left:0;background:var(--card);border:1px solid var(--border2);border-radius:16px;box-shadow:var(--shm);padding:10px;display:none;max-height:min(70vh,520px);overflow:auto;z-index:120}
      .global-search-results.open{display:block}
      .gs-head{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase}
      .gs-item{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;cursor:pointer;border:1px solid transparent}
      .gs-item.is-active,.gs-item:hover{background:var(--bg3);border-color:var(--border)}
      .gs-title{font-size:12px;font-weight:700;color:var(--text)}
      .gs-meta{font-size:11px;color:var(--muted);margin-top:3px;line-height:1.5}
      .gs-badge{font-size:10px;padding:3px 8px;border-radius:999px;background:var(--bg3);color:var(--primary);font-weight:700;white-space:nowrap}
      .report-export-shell{display:grid;gap:14px}
      .report-export-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .report-preview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .report-preview-card{background:var(--bg3);border:1px solid var(--border);border-radius:14px;padding:12px}
      .report-preview-card .lbl{display:block;font-size:11px;color:var(--muted);margin-bottom:6px}
      .report-preview-card .val{display:block;font-size:14px;font-weight:800}
      .report-export-note{font-size:12px;color:var(--muted);line-height:1.8}
      .report-recon-card{background:linear-gradient(180deg,rgba(79,142,247,.05),rgba(255,255,255,.02));border:1px solid rgba(79,142,247,.16)}
      .report-recon-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .report-recon-item{padding:12px;border-radius:12px;background:var(--bg3);border:1px solid var(--border)}
      .report-recon-item .head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .report-recon-item .head strong{font-size:12px}
      .report-recon-item .meta{font-size:11px;color:var(--muted);line-height:1.7}
      .dash-inline-hint{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;border-radius:12px;background:rgba(79,142,247,.08);border:1px solid rgba(79,142,247,.2)}
      .dash-inline-hint span{font-size:11px;color:var(--text)}
      .dash-inline-hint strong{color:var(--primary)}
      .dash-attention-list,.dash-recent-list{display:flex;flex-direction:column;gap:8px}
      .dash-attention-item{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:11px 12px;border-radius:12px;background:var(--bg3);border:1px solid var(--border)}
      .dash-attention-item .meta{font-size:11px;color:var(--muted);margin-top:3px;line-height:1.6}
      .dash-attention-item .badge{flex-shrink:0}
      .settings-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .settings-status-card{padding:12px;border-radius:14px;background:var(--bg3);border:1px solid var(--border)}
      .settings-status-card .k{display:block;font-size:11px;color:var(--muted);margin-bottom:6px}
      .settings-status-card .v{display:block;font-size:14px;font-weight:800}
      .settings-actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
      .settings-note{font-size:12px;color:var(--muted);line-height:1.8}
      .settings-check-list{display:flex;flex-direction:column;gap:8px}
      .settings-check-item{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:11px 12px;border-radius:12px;background:var(--bg3);border:1px solid var(--border)}
      .settings-check-item .meta{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.6}
      .settings-check-item .badge{flex-shrink:0}
      .btn[aria-busy="true"]{opacity:.78;pointer-events:none}
      .dash-today-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:16px}
      .dash-quick-shell{margin-bottom:16px}
      .dash-quick-actions{grid-template-columns:repeat(3,minmax(0,1fr)) !important}
      .dqa-btn.is-active{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.25);filter:brightness(1.08)}
      .dqa-debt{background:rgba(248,113,113,.14);color:var(--bad);border:1.5px solid rgba(248,113,113,.3)}
      .dqa-expense{background:rgba(251,191,36,.14);color:var(--warn);border:1.5px solid rgba(251,191,36,.3)}
      .dqa-customer{background:rgba(96,165,250,.14);color:var(--info);border:1.5px solid rgba(96,165,250,.3)}
      .dash-quick-panel{background:var(--bg3);border:1px solid var(--border);border-radius:14px;padding:14px}
      .dash-quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .dash-quick-note{font-size:12px;color:var(--muted);margin-bottom:12px;line-height:1.7}
      .dash-mini-card .sl{font-size:10px}
      .dash-recent-list{display:flex;flex-direction:column;gap:8px}
      .dash-recent-item{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}
      .dash-recent-item:last-child{border-bottom:none}
      .undo-toast-host{position:fixed;left:20px;bottom:20px;z-index:300;display:flex;flex-direction:column;gap:8px;max-width:min(420px,92vw)}
      .undo-toast{background:var(--card);border:1px solid var(--border2);border-radius:16px;padding:14px 16px;box-shadow:var(--shm);display:flex;align-items:center;justify-content:space-between;gap:12px}
      .undo-toast strong{display:block;font-size:13px}
      .undo-toast span{display:block;font-size:11px;color:var(--muted);margin-top:3px}
      .ev-item{align-items:flex-start !important;flex-wrap:wrap}
      .ev-item .ev-info{flex:1 1 190px;min-width:0}
      .ev-item .ev-title,.ev-item .ev-meta{overflow-wrap:anywhere;word-break:break-word}
      .ev-side{margin-right:auto;text-align:left;display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:130px}
      .ev-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .receipt-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
      .receipt-paper{background:#fff;color:#111;border-radius:18px;padding:22px;border:1px solid #dbe3ef;max-width:820px;margin:0 auto}
      .receipt-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media (max-width:960px){.dash-today-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.report-export-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.report-preview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.settings-status-grid,.report-recon-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:768px){.global-search{min-width:0;width:min(100vw - 34px,100%)}.topbar{padding:12px}.topbar-right{flex:1}.dash-today-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dash-quick-grid{grid-template-columns:1fr}.dash-quick-actions{grid-template-columns:repeat(2,minmax(0,1fr)) !important}.dqa-btn:last-child{grid-column:span 2}.undo-toast-host{left:10px;right:10px;bottom:10px}.report-export-grid,.report-preview-grid,.settings-status-grid,.report-recon-grid{grid-template-columns:1fr}}
      @media print{.undo-toast-host,.global-search-results,.global-search-clear{display:none !important}}
    `;
    document.head.appendChild(style);
  }

  function initAppShell() {
    injectPatchStyles();
    const main = document.querySelector('.main');
    if (!main) return;

    if (!document.getElementById('appTopbar')) {
      const topbar = document.createElement('div');
      topbar.className = 'topbar';
      topbar.id = 'appTopbar';
      topbar.innerHTML = `
        <div class="topbar-main">
          <button class="menu-btn" onclick="openSidebar()">☰</button>
          <h2 id="pageTitle">${PATCH_PAGE_TITLES.dashboard}</h2>
        </div>
        <div class="topbar-right">
          <div class="global-search">
            <span class="global-search-ico">🔎</span>
            <input id="globalSearchInput" type="search" placeholder="گەڕان لە کاڵا، کڕیار، خەرجی و مامەڵە..." oninput="handleGlobalSearchInput(this.value)" onfocus="handleGlobalSearchInput(this.value)" onkeydown="handleGlobalSearchKeydown(event)">
            <button id="globalSearchClear" class="global-search-clear" type="button" onclick="clearGlobalSearch()">×</button>
            <div id="globalSearchResults" class="global-search-results"></div>
          </div>
        </div>`;
      main.insertBefore(topbar, main.firstChild);
    }

    if (!document.getElementById('undoToastHost')) {
      const host = document.createElement('div');
      host.id = 'undoToastHost';
      host.className = 'undo-toast-host';
      document.body.appendChild(host);
    }

    const dashPage = document.getElementById('pg-dashboard');
    if (dashPage && !document.getElementById('dashTodayCards')) {
      const stats = document.getElementById('dashStats');
      const quick = dashPage.querySelector('.dash-quick-actions');
      if (stats) stats.insertAdjacentHTML('afterend', '<div id="dashTodayCards" class="dash-today-grid"></div>');
      if (quick) {
        quick.innerHTML = `
          <button class="dqa-btn dqa-sell" data-dq-action="sell" onclick="setDashboardQuickAction('sell')">💰 فرۆشتنی خێرا</button>
          <button class="dqa-btn dqa-load" data-dq-action="load" onclick="setDashboardQuickAction('load')">📥 بارکردنی خێرا</button>
          <button class="dqa-btn dqa-debt" data-dq-action="debt" onclick="setDashboardQuickAction('debt')">💳 وەرگرتنی قەرز</button>
          <button class="dqa-btn dqa-expense" data-dq-action="expense" onclick="setDashboardQuickAction('expense')">💸 خەرجی</button>
          <button class="dqa-btn dqa-customer" data-dq-action="customer" onclick="setDashboardQuickAction('customer')">👤 کڕیاری نوێ</button>
          <button class="dqa-btn dqa-add" data-dq-action="product" onclick="setDashboardQuickAction('product')">📦 کاڵای نوێ</button>`;
        quick.insertAdjacentHTML('afterend', '<div class="card dash-quick-shell"><div class="ctitle">مامەڵەی خێرا<div class="ca"><button class="btn btn-ol btn-sm" onclick="showPage(\'products\')">کاڵاکان</button></div></div><div id="dashQuickPanel" class="dash-quick-panel"></div></div><div class="grid-2"><div class="card"><div class="ctitle">چاڵاکییەکانی ئەمڕۆ</div><div id="dashRecentList" class="dash-recent-list"></div></div><div class="card"><div class="ctitle">پێویستی سەرنج</div><div id="dashAttentionList" class="dash-attention-list"></div></div></div>');
      }
    }

    document.addEventListener('click', ev => {
      const box = document.getElementById('globalSearchResults');
      const wrap = ev.target.closest('.global-search');
      if (!wrap && box) box.classList.remove('open');
    }, { once: false });
  }

  window.initAppShell = initAppShell;

  window.showPage = function showPagePatched(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-i').forEach(n => n.classList.remove('active'));
    const pg = document.getElementById('pg-' + name); if (pg) pg.classList.add('active');
    const pt = document.getElementById('pageTitle'); if (pt) pt.textContent = PATCH_PAGE_TITLES[name] || name;
    document.querySelectorAll('.nav-i').forEach(n => {
      if ((n.getAttribute('onclick') || '').includes("'" + name + "'")) n.classList.add('active');
    });
    closeSidebar();
    const fns = {
      dashboard: renderDash, products: renderProducts,
      addProduct: renderAddProduct, profits: renderProfits,
      currencies: renderCurrencies, suppliers: renderSuppliers,
      settings: renderSettings, expenses: () => renderExpenses(true), customers: renderCustomers,
    };
    if (fns[name]) fns[name]();
    setTimeout(enhanceRenderedViews, 0);
  };

  function createUndoCapture(label) {
    return {
      label,
      snapshot: createBackupSnapshot(),
      createdAt: Date.now(),
    };
  }

  function commitUndoCapture(capture) {
    if (!capture || !capture.snapshot) return;
    undoStack.push(capture);
    while (undoStack.length > 5) undoStack.shift();
    showUndoToast(capture.label);
  }

  function showUndoToast(label) {
    const host = document.getElementById('undoToastHost');
    if (!host) return;
    clearTimeout(undoToastTimer);
    host.innerHTML = `
      <div class="undo-toast">
        <div>
          <strong>پاشەکەوت کرا</strong>
          <span>${escHtml(label)} هەر ئێستا کرا. دەتوانیت بگەڕێیتەوە.</span>
        </div>
        <button class="btn btn-ol btn-sm" onclick="undoLastAction()">گەڕانەوە</button>
      </div>`;
    undoToastTimer = setTimeout(() => { host.innerHTML = ''; }, 18000);
  }

  window.undoLastAction = function undoLastAction() {
    const last = undoStack.pop();
    if (!last) return;
    applyBackupSnapshot(last.snapshot);
    const current = activePageName();
    showPage(current);
    const host = document.getElementById('undoToastHost');
    if (host) {
      host.innerHTML = `<div class="undo-toast"><div><strong>گەڕایەوە</strong><span>${escHtml(last.label)} هەڵوەشایەوە.</span></div></div>`;
      clearTimeout(undoToastTimer);
      undoToastTimer = setTimeout(() => { host.innerHTML = ''; }, 5000);
    }
  };

  function rerenderAfterMutation() {
    renderLowStockBanner();
    renderDebtDueBanner();
    renderDash();
    if (document.getElementById('pg-products')?.classList.contains('active')) renderProducts();
    if (document.getElementById('pg-profits')?.classList.contains('active')) renderProfits();
    if (document.getElementById('pg-expenses')?.classList.contains('active')) renderExpenses(false);
    if (document.getElementById('pg-customers')?.classList.contains('active')) renderCustomers();
    if (document.getElementById('pg-settings')?.classList.contains('active')) renderSettings();
    setTimeout(enhanceRenderedViews, 0);
  }

  window.registerCustomer = function registerCustomerPatched(name, phone) {
    const cleanName = (name || '').trim();
    const cleanPhone = normalizePhone(phone || '');
    if (!cleanName && !cleanPhone) return null;
    const token = getOrCreateCustomerToken(cleanName, cleanPhone);
    const registry = DB.get('customerTokens') || {};
    const entry = Object.values(registry).find(item => item && item.token === token) || null;
    return {
      token,
      name: entry?.name || cleanName || 'کڕیار',
      phone: entry?.phone || cleanPhone || '',
      createdAt: entry?.createdAt || new Date().toISOString(),
    };
  };

  window.applyBackupSnapshot = function applyBackupSnapshotPatched(snapshot) {
    const payload = snapshot && snapshot.sanitized ? snapshot.sanitized : snapshot;
    const validated = validateBackupPayload(payload);
    const sanitized = validated.sanitized || payload;
    saveCurrencies(sanitized.currencies);
    DB.set('products', sanitized.products);
    DB.set('events', sanitized.events);
    DB.set('suppliers', sanitized.suppliers);
    DB.set('customerTokens', sanitized.customerTokens);
    DB.set('eventIndex', sanitized.eventIndex);
    DB.set('customerCache', sanitized.customerCache);
    setLastSyncAt(validated.preview?.lastSyncAt || sanitized.exportedAt || '');
    repairCustomerRegistry();
    _migrateOrphanedTokens();
    reconcileLegacyProductStock();
    buildCustomerEventIndex();
    invalidateAllCustomerCache();
    invalidateStatsCache();
    silentAutoBackup();
    return { ...sanitized, preview: validated.preview };
  };

  function formatDateTimeLabel(value) {
    if (!value) return 'هێشتا نییە';
    try {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toLocaleString('en-GB');
    } catch (_) {}
    return String(value);
  }

  function storageSizeLabel(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return `${fmtN(value / (1024 * 1024), 2)} MB`;
    if (value >= 1024) return `${fmtN(value / 1024, 1)} KB`;
    return `${value} B`;
  }

  function estimatePmStorageBytes() {
    if (window.PMStorage?.estimateManagedBytesSync) return PMStorage.estimateManagedBytesSync();
    return Object.keys(localStorage)
      .filter(key => key.startsWith('pm_'))
      .reduce((sum, key) => sum + new Blob([String(localStorage.getItem(key) || '')]).size + key.length, 0);
  }

  function getStoredBackupMeta(kind = 'current') {
    const key = kind === 'prev' ? 'autobackup_prev' : 'autobackup';
    const data = DB.get(key);
    if (!data) return null;
    try {
      const parsed = data;
      const preview = validateBackupPayload(parsed).preview;
      return { kind, raw: JSON.stringify(parsed), preview, exportedAt: parsed?.exportedAt || '', savedAt: DB.get('autobackup_date') || '' };
    } catch (error) {
      return { kind, raw: JSON.stringify(data), preview: null, exportedAt: '', savedAt: '', error: error.message };
    }
  }

  function buildHealthChecks() {
    const products = getProducts();
    const events = getAllEvents();
    const productIdSet = new Set(products.map(item => String(item.id)));
    const seenProductIds = new Set();
    const duplicateProductIds = [];
    const namelessProducts = [];
    const negativeStockProducts = [];
    const stockDriftProducts = [];
    products.forEach(item => {
      const id = String(item.id);
      if (seenProductIds.has(id)) duplicateProductIds.push(item.name || `#${id}`);
      seenProductIds.add(id);
      if (!String(item.name || '').trim()) namelessProducts.push(`#${id}`);
      const stats = getProductStats(item.id);
      if (stats.stockQty < -0.001) negativeStockProducts.push(`${item.name || id} (${fmtN(stats.stockQty, 2)})`);
      if (item.stockMode !== 'manual' && Math.abs((stats.stockQtyLegacy || 0) - (stats.stockQtyEvent || 0)) > 0.001) {
        stockDriftProducts.push(`${item.name || id} (${fmtN(stats.stockQtyLegacy || 0, 2)} / ${fmtN(stats.stockQtyEvent || 0, 2)})`);
      }
    });

    const orphanEvents = events.filter(ev => {
      if (ev?.type === 'expense') return ev.productId != null && ev.productId !== '' && !productIdSet.has(String(ev.productId));
      if (ev?.productId == null || ev?.productId === '') return false;
      return !productIdSet.has(String(ev.productId));
    });

    const registry = DB.get('customerTokens') || {};
    const seenPhones = new Map();
    const duplicatePhones = [];
    Object.values(registry).forEach(entry => {
      const phone = normalizePhone(entry?.phone || '');
      if (!phone) return;
      if (seenPhones.has(phone)) duplicatePhones.push(phone);
      seenPhones.set(phone, true);
    });

    const global = getGlobalStats();
    const productRevenueSum = roundMoney(products.reduce((sum, item) => sum + (getProductStats(item.id).totalRevenueUSD || 0), 0));
    const productDebtSum = roundMoney(products.reduce((sum, item) => sum + (getProductStats(item.id).debtRemainUSD || 0), 0));
    const productStockValueSum = roundMoney(products.reduce((sum, item) => sum + (getProductStats(item.id).remainingStockValueUSD || 0), 0));
    const revenueDiff = roundMoney(Math.abs(productRevenueSum - (global.totalRevenueUSD || 0)));
    const debtDiff = roundMoney(Math.abs(productDebtSum - (global.debtRemainUSD || 0)));
    const stockValueDiff = roundMoney(Math.abs(productStockValueSum - (global.remainingStockValueUSD || 0)));

    return [
      { level: duplicateProductIds.length ? 'bad' : 'ok', label: 'ناسنامەی کاڵاکان', detail: duplicateProductIds.length ? `${duplicateProductIds.length} دووبارە هەیە` : 'دووبارە نییە' },
      { level: namelessProducts.length ? 'warn' : 'ok', label: 'ناوی کاڵا', detail: namelessProducts.length ? `${namelessProducts.length} کاڵا ناوی تەواو نییە` : 'هەموو کاڵاکان ناویان هەیە' },
      { level: orphanEvents.length ? 'bad' : 'ok', label: 'مامەڵەی بێ پەیوەندی', detail: orphanEvents.length ? `${orphanEvents.length} مامەڵە productId ی دروست نییە` : 'هیچ مامەڵەی بێ پەیوەندی نییە' },
      { level: negativeStockProducts.length ? 'bad' : 'ok', label: 'ستۆکی نێگاتیڤ', detail: negativeStockProducts.length ? `${negativeStockProducts.length} کاڵا ستۆکی نێگاتیڤ هەیە` : 'ستۆکی نێگاتیڤ نییە' },
      { level: stockDriftProducts.length ? 'warn' : 'ok', label: 'هاوتایی ستۆک', detail: stockDriftProducts.length ? `${stockDriftProducts.length} کاڵا لە legacy/event جیاوازن` : 'legacy و event stock هاوتان' },
      { level: duplicatePhones.length ? 'warn' : 'ok', label: 'ژمارەی کڕیاران', detail: duplicatePhones.length ? `${duplicatePhones.length} ژمارە دووبارە بووەتەوە` : 'ژمارە دووبارە نییە' },
      { level: revenueDiff > 0.01 ? 'bad' : 'ok', label: 'هاوتایی فرۆشتن', detail: revenueDiff > 0.01 ? `جیاوازی ${fmtC(revenueDiff, 'USD')}` : 'کۆی فرۆشتن هاوتایە' },
      { level: debtDiff > 0.01 ? 'bad' : 'ok', label: 'هاوتایی قەرز', detail: debtDiff > 0.01 ? `جیاوازی ${fmtC(debtDiff, 'USD')}` : 'کۆی قەرز هاوتایە' },
      { level: stockValueDiff > 0.01 ? 'bad' : 'ok', label: 'بەهای ستۆک', detail: stockValueDiff > 0.01 ? `جیاوازی ${fmtC(stockValueDiff, 'USD')}` : 'بەهای ستۆک هاوتایە' },
    ];
  }

  function renderHealthChecksHtml(checks) {
    const badgeMap = { ok: 'b-ok', warn: 'b-warn', bad: 'b-bad' };
    const labelMap = { ok: 'باش', warn: 'پێویستی پشکنین', bad: 'کێشە' };
    return (checks || []).map(item => `
      <div class="settings-check-item">
        <div>
          <div class="gs-title">${escHtml(item.label)}</div>
          <div class="meta">${escHtml(item.detail)}</div>
        </div>
        <span class="badge ${badgeMap[item.level] || 'b-gray'}">${labelMap[item.level] || item.level}</span>
      </div>`).join('');
  }

  window.runAppHealthCheck = function runAppHealthCheck() {
    const checks = buildHealthChecks();
    DB.set('lastHealthCheckAt', new Date().toISOString());
    const host = document.getElementById('settingsHealthList');
    if (host) host.innerHTML = renderHealthChecksHtml(checks);
    const summaryHost = document.getElementById('settingsHealthSummary');
    if (summaryHost) {
      const badCount = checks.filter(item => item.level === 'bad').length;
      const warnCount = checks.filter(item => item.level === 'warn').length;
      summaryHost.textContent = badCount ? `${badCount} کێشە و ${warnCount} ئاگاداری دۆزرایەوە` : warnCount ? `${warnCount} ئاگاداری دۆزرایەوە` : 'هەموو پشکنینەکان باشن';
    }
    const note = document.getElementById('settingsHealthCheckedAt');
    if (note) note.textContent = `دوایین پشکنین: ${formatDateTimeLabel(DB.get('lastHealthCheckAt') || '')}`;
    return checks;
  };

  window.downloadStoredBackup = function downloadStoredBackup(kind = 'current') {
    const meta = getStoredBackupMeta(kind);
    if (!meta?.raw) return showA('settingsAlert', 'bad', 'هیچ auto backup ـێک نەدۆزرایەوە.');
    const blob = new Blob([meta.raw], { type: 'application/json' });
    const when = meta.exportedAt ? String(meta.exportedAt).slice(0, 16).replace(/[T:]/g, '-') : today();
    downloadBlob(blob, `${kind === 'prev' ? 'prev-' : ''}autobackup-${when}.json`);
    showA('settingsAlert', 'ok', '✅ auto backup داگیرا.');
  };

  function renderSettingsEnhancements() {
    const page = document.getElementById('pg-settings');
    if (!page) return;
    let root = document.getElementById('settingsEnhancedRoot');
    const firstCard = page.querySelector('.card');
    if (!root) {
      root = document.createElement('div');
      root.id = 'settingsEnhancedRoot';
      if (firstCard) firstCard.insertAdjacentElement('afterend', root);
      else page.appendChild(root);
    }
    const autoBackup = getStoredBackupMeta('current');
    const prevBackup = getStoredBackupMeta('prev');
    const storageBytes = estimatePmStorageBytes();
    const storageMode = (typeof DB !== 'undefined' && typeof DB.mode === 'function') ? DB.mode() : 'localStorage';
    const manualBackupAt = DB.get('manualBackupAt') || '';
    const lastHealthCheckAt = DB.get('lastHealthCheckAt') || '';
    const lastSyncAt = getLastSyncAt() || '';
    const checks = buildHealthChecks();
    const badCount = checks.filter(item => item.level === 'bad').length;
    const warnCount = checks.filter(item => item.level === 'warn').length;
    root.innerHTML = `
      <div class="card">
        <div class="ctitle">🛡️ پاراستنی داتا<div class="ca"><button class="btn btn-g btn-sm" type="button" onclick="downloadStoredBackup('current')">Auto Backup</button>${prevBackup?.raw ? `<button class="btn btn-ol btn-sm" type="button" onclick="downloadStoredBackup('prev')">Backup ی پێشوو</button>` : ''}</div></div>
        <div class="settings-status-grid">
          <div class="settings-status-card"><span class="k">قەبارەی داتا</span><span class="v">${storageSizeLabel(storageBytes)}</span></div>
          <div class="settings-status-card"><span class="k">جۆری بیرگە</span><span class="v">${storageMode === 'indexedDB' ? 'IndexedDB' : 'localStorage fallback'}</span></div>
          <div class="settings-status-card"><span class="k">دوایین auto backup</span><span class="v" style="font-size:12px">${formatDateTimeLabel(autoBackup?.savedAt || autoBackup?.exportedAt)}</span></div>
          <div class="settings-status-card"><span class="k">دوایین manual backup</span><span class="v" style="font-size:12px">${formatDateTimeLabel(manualBackupAt)}</span></div>
          <div class="settings-status-card"><span class="k">دوایین sync / import</span><span class="v" style="font-size:12px">${formatDateTimeLabel(lastSyncAt)}</span></div>
        </div>
        <div class="settings-note">auto backup هر 10 خولەک یەکجار نوێ دەبێتەوە. باشترین ڕێگاش ئەوەیە هەر کاتێک کاری زۆرت کرد، JSON backup ـێکیش خۆت دابەزێنیت.</div>
      </div>
      <div class="card">
        <div class="ctitle">🧪 پشکنینی خۆکار<div class="ca"><span id="settingsHealthSummary" class="tag">${badCount ? `${badCount} کێشە` : warnCount ? `${warnCount} ئاگاداری` : 'باش'}</span><button class="btn btn-p btn-sm" type="button" onclick="runAppHealthCheck()">Run Check</button></div></div>
        <div class="settings-note" style="margin-bottom:12px">ئەم بەشە هەموو business data ـەکە پشکنین دەکات: ناسنامە، مامەڵە، ستۆک، قەرز، و هاوتایی ژمارەکان.</div>
        <div id="settingsHealthList" class="settings-check-list">${renderHealthChecksHtml(checks)}</div>
        <div id="settingsHealthCheckedAt" class="settings-note" style="margin-top:12px">دوایین پشکنین: ${formatDateTimeLabel(lastHealthCheckAt)}</div>
      </div>`;
  }

  function reportTypeLabel(type) {
    const map = {
      load: 'بارکردن', shipping: 'کرێی بار', tax: 'باج', raseed: 'ڕەسید', omola: 'عومولە', expense: 'خەرجی',
      sell_cash: 'فرۆشتنی نەقد', sell_debt: 'فرۆشتنی قەرز', debt_pay: 'پارەدانەوەی قەرز',
    };
    return map[type] || type;
  }

  window.buildDetailedReport = function buildDetailedReportPatched(from, to) {
    const reportFrom = from || '2000-01-01';
    const reportTo = to || '2099-12-31';
    const productExpenseTypes = new Set(['expense', 'shipping', 'tax', 'raseed', 'omola']);
    const products = getProducts();
    const allEvents = getAllEvents();
    const rangeEvents = allEvents.filter(ev => _isDateInRange((ev?.date || (ev?.createdAt || '').slice(0, 10)), reportFrom, reportTo));
    const currentGlobal = getGlobalStats();
    const rangeGlobal = getProfitByRange(reportFrom, reportTo);
    const productStatsMap = {};
    const productRows = products.map(p => {
      const stats = getProductStats(p.id);
      productStatsMap[p.id] = stats;
      return { productId: p.id, name: p.name, unit: p.unit, supplier: p.supplier || '', currentStockQty: roundMoney(stats.stockQty), currentStockValueUSD: roundMoney(stats.remainingStockValueUSD), loadedQty: 0, soldQty: 0, purchaseUSD: 0, productExpenseUSD: 0, revenueUSD: 0, cashRevenueUSD: 0, debtRevenueUSD: 0, debtPaidUSD: 0, debtRemainUSD: roundMoney(stats.debtRemainUSD), soldCostUSD: 0, grossProfitUSD: 0, netProfitUSD: 0, txCount: 0, lastSaleDate: '', lastLoadDate: '', status: stats.stockQty <= 0 ? 'خەڵاس' : stats.stockQty <= 5 ? 'ستۆک کەم' : 'باش', marginPct: 0 };
    });
    const productMap = Object.fromEntries(productRows.map(row => [String(row.productId), row]));
    const customerMap = {};
    const eventsLog = [];

    allEvents.forEach(ev => {
      const row = productMap[String(ev?.productId ?? '')];
      if (!row) return;
      const d = ev?.date || (ev?.createdAt || '').slice(0, 10);
      if (ev.type === 'load' && d && (!row.lastLoadDate || d > row.lastLoadDate)) row.lastLoadDate = d;
      if ((ev.type === 'sell_cash' || ev.type === 'sell_debt') && d && (!row.lastSaleDate || d > row.lastSaleDate)) row.lastSaleDate = d;
    });

    rangeEvents.forEach(ev => {
      const product = ev.productId != null && ev.productId !== '' ? getProduct(ev.productId) : null;
      const amount = parseFloat(ev.totalPrice != null ? ev.totalPrice : (ev.amount != null ? ev.amount : 0)) || 0;
      const amountUSD = Number.isFinite(parseFloat(ev.amountUSD)) ? parseFloat(ev.amountUSD) : toUSD(amount, ev.currency || 'USD');
      const eventDate = ev.date || (ev.createdAt || '').slice(0, 10);
      eventsLog.push({ id: ev.id, date: eventDate, type: reportTypeLabel(ev.type), productName: product?.name || '', qty: ev.qty != null ? roundMoney(parseFloat(ev.qty) || 0) : '', unit: product?.unit || '', amount: roundMoney(amount), currency: ev.currency || 'USD', amountUSD: roundMoney(amountUSD), customerName: ev.buyer || '', phone: normalizePhone(ev.phone || ''), note: ev.note || '' });
      const row = productMap[String(ev.productId ?? '')];
      if (row) {
        if (ev.type === 'load') { row.loadedQty += parseFloat(ev.qty) || 0; row.purchaseUSD += amountUSD; row.txCount += 1; }
        if (ev.type === 'sell_cash') { row.soldQty += parseFloat(ev.qty) || 0; row.cashRevenueUSD += amountUSD; row.revenueUSD += amountUSD; row.txCount += 1; }
        if (ev.type === 'sell_debt') { row.soldQty += parseFloat(ev.qty) || 0; row.debtRevenueUSD += amountUSD; row.revenueUSD += amountUSD; row.txCount += 1; }
        if (ev.type === 'debt_pay') { row.debtPaidUSD += amountUSD; row.txCount += 1; }
        if (productExpenseTypes.has(ev.type) && ev.productId != null && ev.productId !== '') { row.productExpenseUSD += amountUSD; row.txCount += 1; }
      }
      const token = ev.customerToken || '';
      if (token) {
        if (!customerMap[token]) customerMap[token] = { token, name: ev.buyer || 'کڕیار', phone: normalizePhone(ev.phone || ''), debtSalesUSD: 0, paymentsUSD: 0, debtRemainUSD: 0, txCount: 0, lastTxDate: '', lastDueDate: '' };
        const c = customerMap[token];
        if (eventDate && (!c.lastTxDate || eventDate > c.lastTxDate)) c.lastTxDate = eventDate;
        if (ev.type === 'sell_debt') { c.debtSalesUSD += amountUSD; if (ev.dueDate && (!c.lastDueDate || ev.dueDate > c.lastDueDate)) c.lastDueDate = ev.dueDate; }
        if (ev.type === 'debt_pay') c.paymentsUSD += amountUSD;
        c.txCount += 1;
      }
    });

    productRows.forEach(row => {
      row.loadedQty = roundMoney(row.loadedQty); row.soldQty = roundMoney(row.soldQty); row.purchaseUSD = roundMoney(row.purchaseUSD); row.productExpenseUSD = roundMoney(row.productExpenseUSD); row.cashRevenueUSD = roundMoney(row.cashRevenueUSD); row.debtRevenueUSD = roundMoney(row.debtRevenueUSD); row.revenueUSD = roundMoney(row.revenueUSD); row.debtPaidUSD = roundMoney(row.debtPaidUSD); row.soldCostUSD = roundMoney((productStatsMap[row.productId]?.unitCostUSD || 0) * row.soldQty); row.grossProfitUSD = roundMoney(row.revenueUSD - row.soldCostUSD); row.netProfitUSD = roundMoney(row.grossProfitUSD); row.marginPct = row.revenueUSD > 0 ? roundMoney((row.grossProfitUSD / row.revenueUSD) * 100) : 0;
    });

    const customerRows = Object.values(customerMap).map(row => {
      const summary = row.token ? getCustomerDebtSummary(row.token) : null;
      return { ...row, debtSalesUSD: roundMoney(row.debtSalesUSD), paymentsUSD: roundMoney(row.paymentsUSD), debtRemainUSD: roundMoney(summary?.debtRemainUSD || 0), lastTxDate: row.lastTxDate || summary?.txHistory?.[0]?.date || '', lastDueDate: row.lastDueDate || summary?.productBreakdown?.map(pb => pb.dueDate).filter(Boolean).sort().slice(-1)[0] || '' };
    }).filter(row => row.txCount > 0 || row.debtRemainUSD > 0.001).sort((a, b) => b.debtRemainUSD - a.debtRemainUSD || b.txCount - a.txCount);

    const expenseRows = getExpenseEvents({ from: reportFrom, to: reportTo, includeProductCharges: true }).map(ev => {
      const amount = parseFloat(ev.amount != null ? ev.amount : (ev.totalPrice != null ? ev.totalPrice : 0)) || 0;
      const amountUSD = Number.isFinite(parseFloat(ev.amountUSD)) ? parseFloat(ev.amountUSD) : toUSD(amount, ev.currency || 'USD');
      const product = ev.productId != null && ev.productId !== '' ? getProduct(ev.productId) : null;
      const scope = ev.productId != null && ev.productId !== '' ? 'سەر بە کاڵا' : 'گشتی';
      return { id: ev.id, date: ev.date || (ev.createdAt || '').slice(0, 10), category: ev.type === 'expense' ? (ev.expenseCategory || 'خەرجی') : reportTypeLabel(ev.type), productName: product?.name || 'گشتی', type: scope, amount: roundMoney(amount), currency: ev.currency || 'USD', amountUSD: roundMoney(amountUSD), note: ev.note || '' };
    });

    const saleEvents = rangeEvents.filter(ev => ev.type === 'sell_cash' || ev.type === 'sell_debt');
    const productExpensesUSD = roundMoney(expenseRows.filter(row => row.type === 'سەر بە کاڵا').reduce((sum, row) => sum + (parseFloat(row.amountUSD) || 0), 0));
    const generalExpensesUSD = roundMoney(expenseRows.filter(row => row.type === 'گشتی').reduce((sum, row) => sum + (parseFloat(row.amountUSD) || 0), 0));
    const totalExpensesUSD = roundMoney(productExpensesUSD + generalExpensesUSD);
    const expenseByCategory = Object.entries(expenseRows.reduce((acc, row) => {
      acc[row.category] = roundMoney((acc[row.category] || 0) + (parseFloat(row.amountUSD) || 0));
      return acc;
    }, {})).map(([category, amountUSD]) => ({ category, amountUSD })).sort((a, b) => b.amountUSD - a.amountUSD);
    const expenseByMonth = Object.entries(expenseRows.reduce((acc, row) => {
      const monthKey = String(row.date || '').slice(0, 7) || 'نازانراو';
      acc[monthKey] = roundMoney((acc[monthKey] || 0) + (parseFloat(row.amountUSD) || 0));
      return acc;
    }, {})).map(([month, amountUSD]) => ({ month, amountUSD })).sort((a, b) => a.month.localeCompare(b.month));
    const sortedProductRows = productRows.slice().sort((a, b) => b.netProfitUSD - a.netProfitUSD || b.revenueUSD - a.revenueUSD);
    const sortedCustomerRows = customerRows.slice();
    const sortedEventsLog = eventsLog.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || 0) - (a.id || 0));
    const summary = {
      totalRevenueUSD: roundMoney(rangeGlobal.revenueUSD),
      cashSalesUSD: roundMoney(rangeEvents.filter(ev => ev.type === 'sell_cash').reduce((sum, ev) => sum + toUSD(ev.totalPrice, ev.currency), 0)),
      debtSalesUSD: roundMoney(rangeEvents.filter(ev => ev.type === 'sell_debt').reduce((sum, ev) => sum + toUSD(ev.totalPrice, ev.currency), 0)),
      debtCollectedUSD: roundMoney(rangeGlobal.debtPaidUSD),
      productExpensesUSD,
      generalExpensesUSD,
      totalExpensesUSD,
      soldCostUSD: roundMoney(rangeGlobal.soldCostUSD),
      grossProfitUSD: roundMoney(rangeGlobal.profitUSD),
      netProfitUSD: roundMoney(rangeGlobal.profitUSD - generalExpensesUSD),
      remainingStockValueUSD: roundMoney(currentGlobal.remainingStockValueUSD),
      remainingDebtUSD: roundMoney(currentGlobal.debtRemainUSD),
      soldQty: roundMoney(rangeGlobal.soldQty),
      saleCount: saleEvents.length,
      transactionCount: rangeEvents.length,
      productCount: sortedProductRows.length,
      customerCount: sortedCustomerRows.length,
      expenseCount: expenseRows.length,
    };

    return {
      range: { from: reportFrom, to: reportTo },
      generatedAt: new Date().toISOString(),
      summary,
      topProfitProducts: sortedProductRows.slice(0, 5),
      topDebtCustomers: sortedCustomerRows.slice().sort((a, b) => b.debtRemainUSD - a.debtRemainUSD || b.txCount - a.txCount).slice(0, 5),
      topExpenseCategories: expenseByCategory.slice(0, 5),
      productRows: sortedProductRows,
      customerRows: sortedCustomerRows,
      expenseRows,
      expenseByCategory,
      expenseByMonth,
      eventsLog: sortedEventsLog,
    };
  };

  function xlsxEscape(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function xlsxColName(index) {
    let n = index + 1;
    let name = '';
    while (n > 0) {
      const mod = (n - 1) % 26;
      name = String.fromCharCode(65 + mod) + name;
      n = Math.floor((n - mod - 1) / 26);
    }
    return name;
  }

  function xlsxCellXml(rowIndex, colIndex, value) {
    if (value == null || value === '') return '';
    const ref = `${xlsxColName(colIndex)}${rowIndex + 1}`;
    if (typeof value === 'number') return `<c r="${ref}"><v>${Number(value)}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xlsxEscape(value)}</t></is></c>`;
  }

  function xlsxSheetXml(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const colCount = safeRows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    const lastRef = safeRows.length && colCount ? `${xlsxColName(colCount - 1)}${safeRows.length}` : 'A1';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastRef}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetData>${safeRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${(row || []).map((cell, colIndex) => xlsxCellXml(rowIndex, colIndex, cell)).join('')}</row>`).join('')}</sheetData>
  ${safeRows.length > 1 && colCount ? `<autoFilter ref="A1:${lastRef}"/>` : ''}
</worksheet>`;
  }

  let xlsxCrcTable = null;
  function xlsxBuildCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }

  function xlsxCrc32(bytes) {
    if (!xlsxCrcTable) xlsxCrcTable = xlsxBuildCrcTable();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = xlsxCrcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function xlsxConcat(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    parts.forEach(part => { out.set(part, offset); offset += part.length; });
    return out;
  }

  function xlsxZip(files) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach(file => {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = encoder.encode(String(file.data));
      const crc = xlsxCrc32(dataBytes);
      const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(14, crc, true); lv.setUint32(18, dataBytes.length, true); lv.setUint32(22, dataBytes.length, true); lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30); local.set(dataBytes, 30 + nameBytes.length); locals.push(local);
      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(16, crc, true); cv.setUint32(20, dataBytes.length, true); cv.setUint32(24, dataBytes.length, true); cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
      central.set(nameBytes, 46); centrals.push(central);
      offset += local.length;
    });
    const localBytes = xlsxConcat(locals);
    const centralBytes = xlsxConcat(centrals);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralBytes.length, true); ev.setUint32(16, localBytes.length, true);
    return new Blob([localBytes, centralBytes, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildWorkbook(sheets, fileName) {
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xlsxEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const files = [
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rootRels },
      { name: 'xl/workbook.xml', data: workbookXml },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
      { name: 'xl/styles.xml', data: stylesXml },
      ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: xlsxSheetXml(sheet.rows) })),
    ];
    downloadBlob(xlsxZip(files), fileName);
  }

  window.exportReportsWorkbook = function exportReportsWorkbookPatched(from, to) {
    const report = buildDetailedReport(from, to);
    buildWorkbook([
      { name: 'پوختە', rows: [['شاخص', 'بەها'], ['لە', report.range.from], ['بۆ', report.range.to], ['کۆی فرۆشتن', report.summary.totalRevenueUSD], ['فرۆشتنی نەقد', report.summary.cashSalesUSD], ['فرۆشتنی قەرز', report.summary.debtSalesUSD], ['قەرز وەرگیراو', report.summary.debtCollectedUSD], ['خەرجیی سەر بە کاڵا', report.summary.productExpensesUSD], ['خەرجیی گشتی', report.summary.generalExpensesUSD], ['کۆی خەرجی', report.summary.totalExpensesUSD], ['تێچووی فرۆشراو', report.summary.soldCostUSD], ['قازانجی گشتی', report.summary.grossProfitUSD], ['قازانجی خاوێن', report.summary.netProfitUSD], ['بەهای ستۆکی ماوە', report.summary.remainingStockValueUSD], ['قەرزی ماوە', report.summary.remainingDebtUSD]] },
      { name: 'ڕاپۆرتی کاڵاکان', rows: [['ناوی کاڵا','یەکە','فرۆشیار','ستۆک','بارکراو','فرۆشراو','کڕین USD','خەرجی (USD)','فرۆشتن USD','قازانج USD','قازانجی خاوێن','قەرزی ماوە','ڕێژەی قازانج','دۆخ','دوایین فرۆشتن','دوایین بار'], ...report.productRows.map(row => [row.name,row.unit,row.supplier,row.currentStockQty,row.loadedQty,row.soldQty,row.purchaseUSD,row.productExpenseUSD,row.revenueUSD,row.grossProfitUSD,row.netProfitUSD,row.debtRemainUSD,row.marginPct,row.status,row.lastSaleDate,row.lastLoadDate]) ] },
      { name: 'ڕاپۆرتی کڕیاران', rows: [['ناوی کڕیار','ژمارە','فرۆشتنی قەرز','پارەدانەوە','قەرزی ماوە','ژمارەی مامەڵە','دوایین مامەڵە','دوایین بەرواری قەرز'], ...report.customerRows.map(row => [row.name,row.phone,row.debtSalesUSD,row.paymentsUSD,row.debtRemainUSD,row.txCount,row.lastTxDate,row.lastDueDate])] },
      { name: 'ڕاپۆرتی خەرجی', rows: [['بەروار','جۆر','کاڵا','پۆل','بڕ','دراو','USD','تێبینی'], ...report.expenseRows.map(row => [row.date,row.category,row.productName,row.type,row.amount,row.currency,row.amountUSD,row.note])] },
      { name: 'تۆماری مامەڵەکان', rows: [['بەروار','جۆر','کاڵا','بڕ','یەکە','بڕی پارە','دراو','USD','کڕیار','ژمارە','تێبینی'], ...report.eventsLog.map(row => [row.date,row.type,row.productName,row.qty,row.unit,row.amount,row.currency,row.amountUSD,row.customerName,row.phone,row.note])] },
    ], `report-${today()}.xlsx`);
    return report;
  };

  window.exportProductWorkbook = function exportProductWorkbookPatched(productId) {
    const product = getProduct(productId);
    if (!product) throw new Error('کاڵا نەدۆزرایەوە');
    const stats = getProductStats(productId);
    const events = getEvents(productId).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || 0) - (b.id || 0));
    buildWorkbook([
      { name: 'وردەکاریی کاڵا', rows: [['شاخص','بەها'], ['ناوی کاڵا', product.name], ['یەکە', product.unit], ['فرۆشیار', product.supplier || ''], ['ستۆکی ئێستا', stats.stockQty], ['کۆی بارکراو', stats.totalLoadedQty], ['کۆی فرۆشراو', stats.totalSoldQty], ['کۆی کڕین (USD)', stats.totalCostUSD], ['خەرجی (USD)', stats.expenseUSD], ['داهاتی نەقد (USD)', stats.cashRevenueUSD], ['داهاتی قەرز (USD)', stats.debtRevenueUSD], ['پارەدانەوەی قەرز (USD)', stats.debtPaidUSD], ['قەرزی ماوە (USD)', stats.debtRemainUSD], ['قازانجی گشتی (USD)', stats.profitUSD]] },
      { name: 'مامەڵەکان', rows: [['بەروار','جۆر','بڕ','نرخ','کۆی نرخ','دراو','کڕیار/فرۆشیار','تێبینی'], ...events.map(ev => [ev.date || (ev.createdAt || '').slice(0, 10), reportTypeLabel(ev.type), ev.qty ?? '', ev.unitPrice ?? '', ev.totalPrice ?? ev.amount ?? '', ev.currency || 'USD', ev.buyer || ev.supplier || '', ev.note || ''])] },
    ], `product-${String(product.name || 'item').replace(/\s+/g, '-').replace(/[^\w\-\u0600-\u06FF]/g, '').slice(0, 24) || 'item'}-${today().slice(0, 7)}.xlsx`);
  };

  function safeSheetName(name, fallback) {
    const cleaned = String(name || fallback || 'Sheet')
      .replace(/[\\/*?:[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31);
    return cleaned || (fallback || 'Sheet');
  }

  function slugifyReportName(name, fallback = 'report') {
    const slug = String(name || fallback)
      .toLowerCase()
      .replace(/[^\w\u0600-\u06FF]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    return slug || fallback;
  }

  function reportRangeFilePart(from, to) {
    if (from === '2000-01-01' && to === '2099-12-31') return 'all-time';
    if (String(from || '').slice(0, 7) === String(to || '').slice(0, 7)) return String(from || today()).slice(0, 7);
    return `${from}_to_${to}`;
  }

  function eventDateKey(ev) {
    return ev?.date || (ev?.createdAt || '').slice(0, 10);
  }

  function eventTimeLabel(ev) {
    const iso = ev?.createdAt || '';
    return iso && iso.includes('T') ? iso.slice(11, 16) : '';
  }

  function eventAmountValue(ev) {
    return parseFloat(ev?.totalPrice != null ? ev.totalPrice : (ev?.amount != null ? ev.amount : 0)) || 0;
  }

  function eventAmountUSDValue(ev) {
    const amount = eventAmountValue(ev);
    return Number.isFinite(parseFloat(ev?.amountUSD)) ? parseFloat(ev.amountUSD) : toUSD(amount, ev?.currency || 'USD');
  }

  function filterEventsByRange(events, from, to) {
    return (events || []).filter(ev => _isDateInRange(eventDateKey(ev), from, to));
  }

  function xlsxRichCell(value, style = 'text', type) {
    if (value == null || value === '') return '';
    const inferredType = type || (typeof value === 'number' ? 'number' : 'string');
    return { value, style, type: inferredType };
  }

  function xlsxRichHeaderRow(labels) {
    return (labels || []).map(label => xlsxRichCell(label, 'header', 'string'));
  }

  function xlsxRichTotalRow(columns, items, label = 'کۆی گشتی') {
    return columns.map((column, index) => {
      if (index === 0) return xlsxRichCell(label, 'total', 'string');
      if (column.total === 'sum') {
        const total = (items || []).reduce((sum, item) => {
          const value = typeof column.value === 'function' ? column.value(item) : item?.[column.key];
          return sum + (Number(value) || 0);
        }, 0);
        return xlsxRichCell(roundMoney(total), 'totalNumber', 'number');
      }
      if (column.total === 'count') return xlsxRichCell((items || []).length, 'totalNumber', 'number');
      return '';
    });
  }

  function xlsxRichStyleId(styleName) {
    const map = { default: 0, header: 1, total: 2, number: 3, totalNumber: 4, text: 5, integer: 6 };
    return map[styleName] != null ? map[styleName] : 0;
  }

  function xlsxRichCellXml(rowIndex, colIndex, cell) {
    if (cell == null || cell === '') return '';
    const normalized = (cell && typeof cell === 'object' && !Array.isArray(cell) && Object.prototype.hasOwnProperty.call(cell, 'value'))
      ? cell
      : xlsxRichCell(cell, typeof cell === 'number' ? 'number' : 'text');
    if (normalized.value == null || normalized.value === '') return '';
    const ref = `${xlsxColName(colIndex)}${rowIndex + 1}`;
    const styleId = xlsxRichStyleId(normalized.style);
    const styleAttr = styleId ? ` s="${styleId}"` : '';
    if (normalized.type === 'number') return `<c r="${ref}"${styleAttr}><v>${Number(normalized.value)}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${xlsxEscape(normalized.value)}</t></is></c>`;
  }

  function xlsxRichColsXml(widths) {
    if (!Array.isArray(widths) || !widths.length) return '';
    return `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Number(width) || 14}" customWidth="1"/>`).join('')}</cols>`;
  }

  function xlsxRichSheetXml(sheet) {
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    const colCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    const lastRef = rows.length && colCount ? `${xlsxColName(colCount - 1)}${rows.length}` : 'A1';
    const freezeRows = sheet?.freezeRows == null ? 1 : Math.max(0, Number(sheet.freezeRows) || 0);
    const widths = Array.isArray(sheet?.columns) ? sheet.columns : [];
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastRef}"/>
  ${xlsxRichColsXml(widths)}
  <sheetViews><sheetView workbookViewId="0" rightToLeft="1">${freezeRows ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews>
  <sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${(row || []).map((cell, colIndex) => xlsxRichCellXml(rowIndex, colIndex, cell)).join('')}</row>`).join('')}</sheetData>
  ${rows.length > 1 && colCount && sheet?.autoFilter !== false ? `<autoFilter ref="A1:${lastRef}"/>` : ''}
</worksheet>`;
  }

  function buildWorkbookRich(sheets, fileName) {
    const safeSheets = (sheets || []).map((sheet, index) => ({ ...sheet, name: safeSheetName(sheet?.name, `Sheet${index + 1}`) }));
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safeSheets.map((sheet, index) => `<sheet name="${xlsxEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safeSheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
  <fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FF"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs>
</styleSheet>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${safeSheets.map((sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const files = [
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rootRels },
      { name: 'xl/workbook.xml', data: workbookXml },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
      { name: 'xl/styles.xml', data: stylesXml },
      ...safeSheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: xlsxRichSheetXml(sheet) })),
    ];
    downloadBlob(xlsxZip(files), fileName);
  }

  function buildSheetFromColumns(name, columns, items, opts = {}) {
    const list = Array.isArray(items) ? items : [];
    const header = xlsxRichHeaderRow(columns.map(column => column.label));
    const rows = [header, ...list.map(item => columns.map(column => {
      const value = typeof column.value === 'function' ? column.value(item) : item?.[column.key];
      if (value == null || value === '') return '';
      const style = column.style || (typeof value === 'number' ? 'number' : 'text');
      const type = column.type || (typeof value === 'number' ? 'number' : 'string');
      return xlsxRichCell(value, style, type);
    }))];
    if (opts.totalLabel) rows.push(xlsxRichTotalRow(columns, list, opts.totalLabel));
    return { name, rows, columns: columns.map(column => column.width || 16), freezeRows: 1, autoFilter: opts.autoFilter !== false };
  }

  function buildSummarySheetRows(report) {
    const generatedAt = String(report.generatedAt || '').replace('T', ' ').slice(0, 19);
    const rows = [
      xlsxRichHeaderRow(['شاخص', 'بەها']),
      [xlsxRichCell('بەرواری دروستکردن', 'text'), xlsxRichCell(generatedAt, 'text')],
      [xlsxRichCell('لە', 'text'), xlsxRichCell(report.range.from, 'text')],
      [xlsxRichCell('بۆ', 'text'), xlsxRichCell(report.range.to, 'text')],
      [xlsxRichCell('کۆی فرۆشتن USD', 'text'), xlsxRichCell(report.summary.totalRevenueUSD, 'number', 'number')],
      [xlsxRichCell('فرۆشتنی نەقد USD', 'text'), xlsxRichCell(report.summary.cashSalesUSD, 'number', 'number')],
      [xlsxRichCell('فرۆشتنی قەرز USD', 'text'), xlsxRichCell(report.summary.debtSalesUSD, 'number', 'number')],
      [xlsxRichCell('قەرز وەرگیراو USD', 'text'), xlsxRichCell(report.summary.debtCollectedUSD, 'number', 'number')],
      [xlsxRichCell('تێچووی فرۆشراو USD', 'text'), xlsxRichCell(report.summary.soldCostUSD, 'number', 'number')],
      [xlsxRichCell('قازانجی گشتی USD', 'text'), xlsxRichCell(report.summary.grossProfitUSD, 'number', 'number')],
      [xlsxRichCell('خەرجیی گشتی USD', 'text'), xlsxRichCell(report.summary.generalExpensesUSD, 'number', 'number')],
      [xlsxRichCell('خەرجیی سەر بە کاڵا USD', 'text'), xlsxRichCell(report.summary.productExpensesUSD, 'number', 'number')],
      [xlsxRichCell('کۆی خەرجی USD', 'text'), xlsxRichCell(report.summary.totalExpensesUSD, 'number', 'number')],
      [xlsxRichCell('قازانجی خاوێن USD', 'text'), xlsxRichCell(report.summary.netProfitUSD, 'number', 'number')],
      [xlsxRichCell('بەهای ستۆکی ماوە USD', 'text'), xlsxRichCell(report.summary.remainingStockValueUSD, 'number', 'number')],
      [xlsxRichCell('قەرزی ماوە USD', 'text'), xlsxRichCell(report.summary.remainingDebtUSD, 'number', 'number')],
      [xlsxRichCell('بڕی فرۆشراو', 'text'), xlsxRichCell(report.summary.soldQty, 'number', 'number')],
      [xlsxRichCell('ژمارەی مامەڵەی فرۆشتن', 'text'), xlsxRichCell(report.summary.saleCount, 'integer', 'number')],
      [xlsxRichCell('کۆی مامەڵەکان', 'text'), xlsxRichCell(report.summary.transactionCount, 'integer', 'number')],
      ['',''],
      xlsxRichHeaderRow(['باشترین کاڵاکان', 'قازانج USD']),
      ...report.topProfitProducts.map(row => [xlsxRichCell(row.name, 'text'), xlsxRichCell(row.netProfitUSD, 'number', 'number')]),
      ['',''],
      xlsxRichHeaderRow(['قەرزداری سەرەکی', 'قەرزی ماوە USD']),
      ...report.topDebtCustomers.map(row => [xlsxRichCell(row.name, 'text'), xlsxRichCell(row.debtRemainUSD, 'number', 'number')]),
      ['',''],
      xlsxRichHeaderRow(['زۆرترین جۆری خەرجی', 'USD']),
      ...report.topExpenseCategories.map(row => [xlsxRichCell(row.category, 'text'), xlsxRichCell(row.amountUSD, 'number', 'number')]),
    ];
    return { name: 'Summary', rows, columns: [34, 20], freezeRows: 1, autoFilter: false };
  }

  function buildBusinessWorkbookSheets(report) {
    return [
      buildSummarySheetRows(report),
      buildSheetFromColumns('Products_Report', [
        { label: 'Product ID', key: 'productId', width: 12, style: 'integer', type: 'number' },
        { label: 'Product Name', key: 'name', width: 24 },
        { label: 'Unit', key: 'unit', width: 12 },
        { label: 'Supplier', key: 'supplier', width: 20 },
        { label: 'Current Stock Qty', key: 'currentStockQty', width: 16, style: 'number', total: 'sum' },
        { label: 'Current Stock Value USD', key: 'currentStockValueUSD', width: 20, style: 'number', total: 'sum' },
        { label: 'Loaded Qty', key: 'loadedQty', width: 14, style: 'number', total: 'sum' },
        { label: 'Sold Qty', key: 'soldQty', width: 14, style: 'number', total: 'sum' },
        { label: 'Purchase Cost USD', key: 'purchaseUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Product Expenses USD', key: 'productExpenseUSD', width: 20, style: 'number', total: 'sum' },
        { label: 'Revenue USD', key: 'revenueUSD', width: 16, style: 'number', total: 'sum' },
        { label: 'Cash Revenue USD', key: 'cashRevenueUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Debt Revenue USD', key: 'debtRevenueUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Debt Paid USD', key: 'debtPaidUSD', width: 16, style: 'number', total: 'sum' },
        { label: 'Debt Remaining USD', key: 'debtRemainUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Sold Cost USD', key: 'soldCostUSD', width: 16, style: 'number', total: 'sum' },
        { label: 'Gross Profit USD', key: 'grossProfitUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Net Profit USD', key: 'netProfitUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Margin %', key: 'marginPct', width: 12, style: 'number' },
        { label: 'Tx Count', key: 'txCount', width: 12, style: 'integer', type: 'number', total: 'sum' },
        { label: 'Last Sale Date', key: 'lastSaleDate', width: 14 },
        { label: 'Last Load Date', key: 'lastLoadDate', width: 14 },
        { label: 'Status', key: 'status', width: 12 },
      ], report.productRows, { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Customers_Report', [
        { label: 'Token', key: 'token', width: 28 },
        { label: 'Customer Name', key: 'name', width: 24 },
        { label: 'Phone', key: 'phone', width: 18 },
        { label: 'Debt Sales USD', key: 'debtSalesUSD', width: 16, style: 'number', total: 'sum' },
        { label: 'Payments USD', key: 'paymentsUSD', width: 16, style: 'number', total: 'sum' },
        { label: 'Remaining Debt USD', key: 'debtRemainUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Transaction Count', key: 'txCount', width: 16, style: 'integer', type: 'number', total: 'sum' },
        { label: 'Last Transaction Date', key: 'lastTxDate', width: 16 },
        { label: 'Last Due Date', key: 'lastDueDate', width: 14 },
      ], report.customerRows, { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Expenses_Report', [
        { label: 'Event ID', key: 'id', width: 12, style: 'integer', type: 'number' },
        { label: 'Date', key: 'date', width: 14 },
        { label: 'Category', key: 'category', width: 18 },
        { label: 'Product', key: 'productName', width: 22 },
        { label: 'Scope', key: 'type', width: 14 },
        { label: 'Amount', key: 'amount', width: 14, style: 'number', total: 'sum' },
        { label: 'Currency', key: 'currency', width: 10 },
        { label: 'Amount USD', key: 'amountUSD', width: 14, style: 'number', total: 'sum' },
        { label: 'Note', key: 'note', width: 30 },
      ], report.expenseRows, { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Expense_By_Category', [
        { label: 'Category', key: 'category', width: 22 },
        { label: 'Total Amount USD', key: 'amountUSD', width: 18, style: 'number', total: 'sum' },
      ], report.expenseByCategory, { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Expense_By_Month', [
        { label: 'Month', key: 'month', width: 18 },
        { label: 'Total Amount USD', key: 'amountUSD', width: 18, style: 'number', total: 'sum' },
      ], report.expenseByMonth, { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Events_Log', [
        { label: 'ID', key: 'id', width: 10, style: 'integer', type: 'number' },
        { label: 'Date', key: 'date', width: 14 },
        { label: 'Type', key: 'type', width: 18 },
        { label: 'Product', key: 'productName', width: 22 },
        { label: 'Qty', key: 'qty', width: 12, style: 'number' },
        { label: 'Unit', key: 'unit', width: 12 },
        { label: 'Amount', key: 'amount', width: 14, style: 'number' },
        { label: 'Currency', key: 'currency', width: 10 },
        { label: 'Amount USD', key: 'amountUSD', width: 14, style: 'number', total: 'sum' },
        { label: 'Customer Name', key: 'customerName', width: 20 },
        { label: 'Phone', key: 'phone', width: 16 },
        { label: 'Note', key: 'note', width: 28 },
      ], report.eventsLog, { totalLabel: 'کۆی گشتی' }),
    ];
  }

  function buildAllProductsWorkbookSheets(report) {
    const businessSheets = buildBusinessWorkbookSheets(report);
    const rankingRows = report.productRows.slice().sort((a, b) => b.netProfitUSD - a.netProfitUSD || b.revenueUSD - a.revenueUSD);
    const lowStockRows = report.productRows.filter(row => row.currentStockQty <= 5);
    const debtRows = report.productRows.filter(row => row.debtRemainUSD > 0.001).sort((a, b) => b.debtRemainUSD - a.debtRemainUSD || b.revenueUSD - a.revenueUSD);
    return [
      businessSheets[0],
      businessSheets[1],
      buildSheetFromColumns('Product_Profit_Ranking', [
        { label: 'Rank', key: '__rank', width: 10, style: 'integer', type: 'number' },
        { label: 'Product Name', key: 'name', width: 24 },
        { label: 'Supplier', key: 'supplier', width: 20 },
        { label: 'Revenue USD', key: 'revenueUSD', width: 16, style: 'number', total: 'sum' },
        { label: 'Net Profit USD', key: 'netProfitUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Margin %', key: 'marginPct', width: 12, style: 'number' },
        { label: 'Current Stock Qty', key: 'currentStockQty', width: 16, style: 'number' },
        { label: 'Status', key: 'status', width: 14 },
      ], rankingRows.map((row, index) => ({ ...row, __rank: index + 1 })), { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Low_Stock', [
        { label: 'Product ID', key: 'productId', width: 12, style: 'integer', type: 'number' },
        { label: 'Product Name', key: 'name', width: 24 },
        { label: 'Unit', key: 'unit', width: 12 },
        { label: 'Supplier', key: 'supplier', width: 20 },
        { label: 'Current Stock Qty', key: 'currentStockQty', width: 16, style: 'number', total: 'sum' },
        { label: 'Current Stock Value USD', key: 'currentStockValueUSD', width: 20, style: 'number', total: 'sum' },
        { label: 'Debt Remaining USD', key: 'debtRemainUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Last Sale Date', key: 'lastSaleDate', width: 14 },
        { label: 'Status', key: 'status', width: 12 },
      ], lowStockRows, { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Debt_Products', [
        { label: 'Product ID', key: 'productId', width: 12, style: 'integer', type: 'number' },
        { label: 'Product Name', key: 'name', width: 24 },
        { label: 'Supplier', key: 'supplier', width: 20 },
        { label: 'Debt Revenue USD', key: 'debtRevenueUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Debt Paid USD', key: 'debtPaidUSD', width: 16, style: 'number', total: 'sum' },
        { label: 'Debt Remaining USD', key: 'debtRemainUSD', width: 18, style: 'number', total: 'sum' },
        { label: 'Tx Count', key: 'txCount', width: 12, style: 'integer', type: 'number', total: 'sum' },
        { label: 'Status', key: 'status', width: 12 },
      ], debtRows, { totalLabel: 'کۆی گشتی' }),
      businessSheets[6],
    ];
  }

  function computeEventStockQty(events) {
    return roundMoney((events || []).reduce((sum, ev) => {
      if (ev?.type === 'load') return sum + (parseFloat(ev.qty) || 0);
      if (ev?.type === 'sell_cash' || ev?.type === 'sell_debt') return sum - (parseFloat(ev.qty) || 0);
      return sum;
    }, 0));
  }

  function buildProductWorkbookReport(productId, from, to) {
    const product = getProduct(productId);
    if (!product) return null;
    const reportFrom = from || '2000-01-01';
    const reportTo = to || '2099-12-31';
    const allEvents = getEvents(productId).slice().sort((a, b) => (eventDateKey(a) || '').localeCompare(eventDateKey(b) || '') || (a.id || 0) - (b.id || 0));
    const rangeEvents = filterEventsByRange(allEvents, reportFrom, reportTo);
    const stats = getProductStats(productId);
    const expenseTypes = new Set(['expense', 'shipping', 'tax', 'raseed', 'omola']);
    const loadEvents = rangeEvents.filter(ev => ev.type === 'load');
    const salesEvents = rangeEvents.filter(ev => ev.type === 'sell_cash' || ev.type === 'sell_debt');
    const paymentEvents = rangeEvents.filter(ev => ev.type === 'debt_pay');
    const productExpenseEvents = rangeEvents.filter(ev => expenseTypes.has(ev.type));
    const totalLoadedQty = roundMoney(loadEvents.reduce((sum, ev) => sum + (parseFloat(ev.qty) || 0), 0));
    const totalSoldQty = roundMoney(salesEvents.reduce((sum, ev) => sum + (parseFloat(ev.qty) || 0), 0));
    const totalPurchaseCostUSD = roundMoney(loadEvents.reduce((sum, ev) => sum + eventAmountUSDValue(ev), 0));
    const totalProductExpensesUSD = roundMoney(productExpenseEvents.reduce((sum, ev) => sum + eventAmountUSDValue(ev), 0));
    const totalCashRevenueUSD = roundMoney(salesEvents.filter(ev => ev.type === 'sell_cash').reduce((sum, ev) => sum + eventAmountUSDValue(ev), 0));
    const totalDebtRevenueUSD = roundMoney(salesEvents.filter(ev => ev.type === 'sell_debt').reduce((sum, ev) => sum + eventAmountUSDValue(ev), 0));
    const totalDebtPaidUSD = roundMoney(paymentEvents.reduce((sum, ev) => sum + eventAmountUSDValue(ev), 0));
    const totalRevenueUSD = roundMoney(totalCashRevenueUSD + totalDebtRevenueUSD);
    const soldCostUSD = roundMoney(totalSoldQty * (stats.unitCostUSD || 0));
    const grossProfitUSD = roundMoney(totalRevenueUSD - soldCostUSD);
    const netProfitUSD = roundMoney(grossProfitUSD - totalProductExpensesUSD);
    const marginPct = totalRevenueUSD > 0 ? roundMoney((netProfitUSD / totalRevenueUSD) * 100) : 0;
    const openingStockQty = computeEventStockQty(allEvents.filter(ev => {
      const date = eventDateKey(ev);
      return date && date < reportFrom;
    }));
    const closingStockQty = computeEventStockQty(allEvents.filter(ev => {
      const date = eventDateKey(ev);
      return date && date <= reportTo;
    }));
    const avgInventoryQty = roundMoney((Math.max(0, openingStockQty) + Math.max(0, closingStockQty)) / 2);
    const turnoverRatio = avgInventoryQty > 0 ? roundMoney(totalSoldQty / avgInventoryQty) : 0;

    return {
      product,
      stats,
      range: { from: reportFrom, to: reportTo },
      summary: {
        currentStockQty: roundMoney(stats.stockQty),
        currentStockValueUSD: roundMoney(stats.remainingStockValueUSD),
        totalLoadedQty,
        totalSoldQty,
        totalPurchaseCostUSD,
        totalProductExpensesUSD,
        totalCostUSD: roundMoney(totalPurchaseCostUSD + totalProductExpensesUSD),
        unitCostUSD: roundMoney(stats.unitCostUSD || 0),
        totalCashRevenueUSD,
        totalDebtRevenueUSD,
        totalDebtPaidUSD,
        totalDebtRemainingUSD: roundMoney(stats.debtRemainUSD || 0),
        periodDebtRemainingUSD: roundMoney(Math.max(0, totalDebtRevenueUSD - totalDebtPaidUSD)),
        soldCostUSD,
        grossProfitUSD,
        netProfitUSD,
        marginPct,
        averageSalePriceUSD: totalSoldQty > 0 ? roundMoney(totalRevenueUSD / totalSoldQty) : 0,
        openingStockQty,
        closingStockQty,
        turnoverRatio,
      },
      loadHistory: loadEvents.map(ev => ({
        date: eventDateKey(ev),
        qty: roundMoney(parseFloat(ev.qty) || 0),
        unitPrice: roundMoney(parseFloat(ev.unitPrice) || 0),
        totalPrice: roundMoney(eventAmountValue(ev)),
        currency: ev.currency || 'USD',
        amountUSD: roundMoney(eventAmountUSDValue(ev)),
        supplier: ev.supplier || product.supplier || '',
        note: ev.note || '',
      })),
      salesHistory: salesEvents.map(ev => ({
        date: eventDateKey(ev),
        type: reportTypeLabel(ev.type),
        customerName: ev.buyer || '',
        phone: normalizePhone(ev.phone || ''),
        qty: roundMoney(parseFloat(ev.qty) || 0),
        unit: product.unit || '',
        unitSalePrice: roundMoney(parseFloat(ev.unitPrice) || 0),
        totalPrice: roundMoney(eventAmountValue(ev)),
        currency: ev.currency || 'USD',
        amountUSD: roundMoney(eventAmountUSDValue(ev)),
        dueDate: ev.dueDate || '',
        note: ev.note || '',
      })),
      payments: paymentEvents.map(ev => ({
        date: eventDateKey(ev),
        customerName: ev.buyer || '',
        phone: normalizePhone(ev.phone || ''),
        amount: roundMoney(parseFloat(ev.amount) || 0),
        currency: ev.currency || 'USD',
        amountUSD: roundMoney(eventAmountUSDValue(ev)),
        note: ev.note || '',
      })),
      productExpenses: productExpenseEvents.map(ev => ({
        date: eventDateKey(ev),
        category: ev.type === 'expense' ? (ev.expenseCategory || 'خەرجی') : reportTypeLabel(ev.type),
        amount: roundMoney(eventAmountValue(ev)),
        currency: ev.currency || 'USD',
        amountUSD: roundMoney(eventAmountUSDValue(ev)),
        note: ev.note || '',
      })),
    };
  }

  function buildProductWorkbookSheets(productReport) {
    const summary = productReport.summary;
    return [
      {
        name: 'Product_Summary',
        rows: [
          xlsxRichHeaderRow(['شاخص', 'بەها']),
          [xlsxRichCell('Product Name', 'text'), xlsxRichCell(productReport.product.name, 'text')],
          [xlsxRichCell('Unit', 'text'), xlsxRichCell(productReport.product.unit || '', 'text')],
          [xlsxRichCell('Supplier', 'text'), xlsxRichCell(productReport.product.supplier || '', 'text')],
          [xlsxRichCell('Report Period', 'text'), xlsxRichCell(`${productReport.range.from} -> ${productReport.range.to}`, 'text')],
          [xlsxRichCell('Current Stock Qty', 'text'), xlsxRichCell(summary.currentStockQty, 'number', 'number')],
          [xlsxRichCell('Current Stock Value USD', 'text'), xlsxRichCell(summary.currentStockValueUSD, 'number', 'number')],
          [xlsxRichCell('Total Loaded Qty', 'text'), xlsxRichCell(summary.totalLoadedQty, 'number', 'number')],
          [xlsxRichCell('Total Sold Qty', 'text'), xlsxRichCell(summary.totalSoldQty, 'number', 'number')],
          [xlsxRichCell('Total Purchase Cost USD', 'text'), xlsxRichCell(summary.totalPurchaseCostUSD, 'number', 'number')],
          [xlsxRichCell('Total Product Expenses USD', 'text'), xlsxRichCell(summary.totalProductExpensesUSD, 'number', 'number')],
          [xlsxRichCell('Total Cost USD', 'text'), xlsxRichCell(summary.totalCostUSD, 'number', 'number')],
          [xlsxRichCell('Unit Cost USD', 'text'), xlsxRichCell(summary.unitCostUSD, 'number', 'number')],
          [xlsxRichCell('Total Cash Revenue USD', 'text'), xlsxRichCell(summary.totalCashRevenueUSD, 'number', 'number')],
          [xlsxRichCell('Total Debt Revenue USD', 'text'), xlsxRichCell(summary.totalDebtRevenueUSD, 'number', 'number')],
          [xlsxRichCell('Total Debt Paid USD', 'text'), xlsxRichCell(summary.totalDebtPaidUSD, 'number', 'number')],
          [xlsxRichCell('Total Debt Remaining USD', 'text'), xlsxRichCell(summary.totalDebtRemainingUSD, 'number', 'number')],
          [xlsxRichCell('Sold Cost USD', 'text'), xlsxRichCell(summary.soldCostUSD, 'number', 'number')],
          [xlsxRichCell('Gross Profit USD', 'text'), xlsxRichCell(summary.grossProfitUSD, 'number', 'number')],
          [xlsxRichCell('Net Profit USD', 'text'), xlsxRichCell(summary.netProfitUSD, 'number', 'number')],
          [xlsxRichCell('Margin %', 'text'), xlsxRichCell(summary.marginPct, 'number', 'number')],
        ],
        columns: [28, 24],
        freezeRows: 1,
        autoFilter: false,
      },
      buildSheetFromColumns('Load_History', [
        { label: 'Date', key: 'date', width: 14 },
        { label: 'Qty', key: 'qty', width: 12, style: 'number', total: 'sum' },
        { label: 'Unit Price', key: 'unitPrice', width: 14, style: 'number' },
        { label: 'Total Price', key: 'totalPrice', width: 14, style: 'number', total: 'sum' },
        { label: 'Currency', key: 'currency', width: 10 },
        { label: 'USD Value', key: 'amountUSD', width: 14, style: 'number', total: 'sum' },
        { label: 'Supplier', key: 'supplier', width: 22 },
        { label: 'Note', key: 'note', width: 28 },
      ], productReport.loadHistory, { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Sales_History', [
        { label: 'Date', key: 'date', width: 14 },
        { label: 'Type', key: 'type', width: 18 },
        { label: 'Customer Name', key: 'customerName', width: 20 },
        { label: 'Phone', key: 'phone', width: 16 },
        { label: 'Qty', key: 'qty', width: 12, style: 'number', total: 'sum' },
        { label: 'Unit', key: 'unit', width: 10 },
        { label: 'Unit Sale Price', key: 'unitSalePrice', width: 16, style: 'number' },
        { label: 'Total Price', key: 'totalPrice', width: 14, style: 'number', total: 'sum' },
        { label: 'Currency', key: 'currency', width: 10 },
        { label: 'USD Value', key: 'amountUSD', width: 14, style: 'number', total: 'sum' },
        { label: 'Due Date', key: 'dueDate', width: 14 },
        { label: 'Note', key: 'note', width: 26 },
      ], productReport.salesHistory, { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Payments', [
        { label: 'Date', key: 'date', width: 14 },
        { label: 'Customer Name', key: 'customerName', width: 20 },
        { label: 'Phone', key: 'phone', width: 16 },
        { label: 'Amount', key: 'amount', width: 14, style: 'number', total: 'sum' },
        { label: 'Currency', key: 'currency', width: 10 },
        { label: 'USD Value', key: 'amountUSD', width: 14, style: 'number', total: 'sum' },
        { label: 'Note', key: 'note', width: 28 },
      ], productReport.payments, { totalLabel: 'کۆی گشتی' }),
      buildSheetFromColumns('Product_Expenses', [
        { label: 'Date', key: 'date', width: 14 },
        { label: 'Category/Type', key: 'category', width: 20 },
        { label: 'Amount', key: 'amount', width: 14, style: 'number', total: 'sum' },
        { label: 'Currency', key: 'currency', width: 10 },
        { label: 'USD Value', key: 'amountUSD', width: 14, style: 'number', total: 'sum' },
        { label: 'Note', key: 'note', width: 28 },
      ], productReport.productExpenses, { totalLabel: 'کۆی گشتی' }),
      {
        name: 'Profit_Analysis',
        rows: [
          xlsxRichHeaderRow(['شاخص', 'بەها']),
          [xlsxRichCell('Total Revenue USD', 'text'), xlsxRichCell(roundMoney(summary.totalCashRevenueUSD + summary.totalDebtRevenueUSD), 'number', 'number')],
          [xlsxRichCell('Sold Cost USD', 'text'), xlsxRichCell(summary.soldCostUSD, 'number', 'number')],
          [xlsxRichCell('Gross Profit USD', 'text'), xlsxRichCell(summary.grossProfitUSD, 'number', 'number')],
          [xlsxRichCell('Product Expenses USD', 'text'), xlsxRichCell(summary.totalProductExpensesUSD, 'number', 'number')],
          [xlsxRichCell('Net Profit USD', 'text'), xlsxRichCell(summary.netProfitUSD, 'number', 'number')],
          [xlsxRichCell('Average Sale Price USD', 'text'), xlsxRichCell(summary.averageSalePriceUSD, 'number', 'number')],
          [xlsxRichCell('Average Unit Cost USD', 'text'), xlsxRichCell(summary.unitCostUSD, 'number', 'number')],
          [xlsxRichCell('Opening Stock Qty', 'text'), xlsxRichCell(summary.openingStockQty, 'number', 'number')],
          [xlsxRichCell('Closing Stock Qty', 'text'), xlsxRichCell(summary.closingStockQty, 'number', 'number')],
          [xlsxRichCell('Turnover Ratio', 'text'), xlsxRichCell(summary.turnoverRatio, 'number', 'number')],
        ],
        columns: [28, 22],
        freezeRows: 1,
        autoFilter: false,
      },
    ];
  }

  window.exportReportsWorkbook = function exportReportsWorkbookPatchedRich(from, to) {
    const report = buildDetailedReport(from, to);
    buildWorkbookRich(buildBusinessWorkbookSheets(report), `business-report-${reportRangeFilePart(report.range.from, report.range.to)}.xlsx`);
  };

  window.exportAllProductsWorkbook = function exportAllProductsWorkbookPatched(from, to) {
    const report = buildDetailedReport(from, to);
    buildWorkbookRich(buildAllProductsWorkbookSheets(report), `all-products-report-${reportRangeFilePart(report.range.from, report.range.to)}.xlsx`);
  };

  window.exportProductWorkbook = function exportProductWorkbookPatchedRich(productId, from, to) {
    const productReport = buildProductWorkbookReport(productId, from, to);
    if (!productReport) return alert('کاڵا نەدۆزرایەوە');
    buildWorkbookRich(buildProductWorkbookSheets(productReport), `product-report-${slugifyReportName(productReport.product.name, 'item')}-${reportRangeFilePart(productReport.range.from, productReport.range.to)}.xlsx`);
  };

  function matchQuery(text, query) {
    return String(text || '').toLowerCase().includes(query);
  }

  function searchAllEntities(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return { products: [], customers: [], expenses: [], transactions: [], suppliers: [] };
    const products = getProducts().filter(p => matchQuery(p.name, q) || matchQuery(p.supplier, q) || matchQuery(p.unit, q) || matchQuery(p.note, q)).slice(0, 6);
    const customers = getCustomerStats().filter(c => matchQuery(c.name, q) || matchQuery(c.phone, q) || matchQuery(c.token, q) || (Array.isArray(c.products) && c.products.some(name => matchQuery(name, q)))).slice(0, 6);
    const expenses = getExpenseEvents({ includeProductCharges: true }).filter(ev => {
      const prod = ev.productId != null && ev.productId !== '' ? getProduct(ev.productId) : null;
      return matchQuery(ev.expenseCategory, q) || matchQuery(reportTypeLabel(ev.type), q) || matchQuery(ev.note, q) || matchQuery(prod?.name, q);
    }).slice(0, 6);
    const transactions = getAllEvents().filter(ev => {
      const prod = ev.productId != null && ev.productId !== '' ? getProduct(ev.productId) : null;
      return matchQuery(reportTypeLabel(ev.type), q) || matchQuery(prod?.name, q) || matchQuery(ev.buyer, q) || matchQuery(ev.phone, q) || matchQuery(ev.customerToken, q) || matchQuery(ev.supplier, q) || matchQuery(ev.note, q) || matchQuery(ev.date, q);
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || 0) - (a.id || 0)).slice(0, 8);
    const supplierMap = {};
    getSuppliers().forEach(item => {
      if (!item?.name) return;
      supplierMap[item.name] = { name: item.name, phone: item.phone || '', productCount: getProducts().filter(p => p.supplier === item.name).length };
    });
    getProducts().forEach(item => {
      const supplier = (item.supplier || '').trim();
      if (!supplier) return;
      if (!supplierMap[supplier]) supplierMap[supplier] = { name: supplier, phone: '', productCount: 0 };
      supplierMap[supplier].productCount += 1;
    });
    const suppliers = Object.values(supplierMap).filter(item => matchQuery(item.name, q) || matchQuery(item.phone, q)).slice(0, 6);
    return { products, customers, expenses, transactions, suppliers };
  }

  window.handleGlobalSearchInput = function handleGlobalSearchInput(query) {
    globalSearchQuery = String(query || '').trim();
    const box = document.getElementById('globalSearchResults');
    if (!box) return;
    clearTimeout(globalSearchTimer);
    globalSearchTimer = setTimeout(() => {
      if (!globalSearchQuery) {
        box.classList.remove('open');
        box.innerHTML = '';
        globalSearchFlatResults = [];
        globalSearchActiveIndex = -1;
        return;
      }
      const results = searchAllEntities(globalSearchQuery);
      const sections = [
        ['کاڵاکان', results.products.map(item => ({ title: item.name, meta: `${item.supplier || 'بێ فرۆشیار'} | ${fmtN(getProductStats(item.id).stockQty, 2)} ${item.unit}`, badge: 'کاڵا', click: `openSearchProduct(${item.id})` }))],
        ['کڕیاران', results.customers.map(item => ({ title: item.name, meta: `${item.phone || 'بێ ژمارە'} | ${fmtC(item.remainUSD || 0, 'USD')}`, badge: 'کڕیار', click: `openSearchCustomer(${JSON.stringify(item.phone || '')}, ${JSON.stringify(item.name || '')})` }))],
        ['خەرجییەکان', results.expenses.map(item => ({ title: item.expenseCategory || reportTypeLabel(item.type) || 'خەرجی', meta: `${item.date || ''} | ${fmtC(item.amount || item.totalPrice || 0, item.currency || 'USD')} | ${(getProduct(item.productId)?.name) || 'گشتی'}`, badge: 'خەرجی', click: `openSearchExpense(${JSON.stringify(item.expenseCategory || reportTypeLabel(item.type) || '')})` }))],
        ['مامەڵەکان', results.transactions.map(item => ({ title: `${reportTypeLabel(item.type)}${item.buyer ? ' | ' + item.buyer : ''}`, meta: `${item.date || ''} | ${(getProduct(item.productId)?.name) || ''} | ${item.note || ''}`, badge: 'مامەڵە', click: `openSearchTransaction(${item.id}, ${item.productId != null ? item.productId : 'null'})` }))],
        ['فرۆشیارەکان', results.suppliers.map(item => ({ title: item.name, meta: `${item.phone || 'بێ ژمارە'} | ${item.productCount} کاڵا`, badge: 'فرۆشیار', click: `openSearchSupplier(${JSON.stringify(item.name || '')})` }))],
      ].filter(section => section[1].length);
      if (!sections.length) {
        box.innerHTML = '<div class="empty" style="padding:18px">هیچ ئەنجامێک نەدۆزرایەوە.</div>';
        box.classList.add('open');
        globalSearchFlatResults = [];
        globalSearchActiveIndex = -1;
        return;
      }
      globalSearchFlatResults = [];
      sections.forEach(section => section[1].forEach(item => globalSearchFlatResults.push(item)));
      globalSearchActiveIndex = -1;
      let flatIndex = 0;
      box.innerHTML = sections.map(([title, items]) => `
        <div>
          <div class="gs-head"><span>${title}</span><span>${items.length}</span></div>
          ${items.map(item => {
            const itemIndex = flatIndex++;
            return `<div class="gs-item" data-gs-index="${itemIndex}" onclick="${item.click}; clearGlobalSearch();"><div><div class="gs-title">${escHtml(item.title)}</div><div class="gs-meta">${escHtml(item.meta)}</div></div><span class="gs-badge">${escHtml(item.badge)}</span></div>`;
          }).join('')}
        </div>`).join('');
      box.classList.add('open');
    }, 120);
  };

  function syncGlobalSearchActiveItem() {
    const items = Array.from(document.querySelectorAll('#globalSearchResults .gs-item'));
    items.forEach((item, index) => item.classList.toggle('is-active', index === globalSearchActiveIndex));
    const activeItem = items[globalSearchActiveIndex];
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
  }

  window.handleGlobalSearchKeydown = function handleGlobalSearchKeydown(event) {
    const items = Array.from(document.querySelectorAll('#globalSearchResults .gs-item'));
    if (!items.length) {
      if (event.key === 'Escape') clearGlobalSearch();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      globalSearchActiveIndex = Math.min(items.length - 1, globalSearchActiveIndex + 1);
      syncGlobalSearchActiveItem();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      globalSearchActiveIndex = Math.max(0, globalSearchActiveIndex - 1);
      syncGlobalSearchActiveItem();
      return;
    }
    if (event.key === 'Enter') {
      if (globalSearchActiveIndex < 0) globalSearchActiveIndex = 0;
      if (items[globalSearchActiveIndex]) {
        event.preventDefault();
        items[globalSearchActiveIndex].click();
      }
      return;
    }
    if (event.key === 'Escape') clearGlobalSearch();
  };

  window.clearGlobalSearch = function clearGlobalSearch() {
    const input = document.getElementById('globalSearchInput');
    const box = document.getElementById('globalSearchResults');
    if (input) input.value = '';
    if (box) { box.innerHTML = ''; box.classList.remove('open'); }
    globalSearchQuery = '';
    globalSearchFlatResults = [];
    globalSearchActiveIndex = -1;
  };

  window.openSearchProduct = function openSearchProduct(productId) {
    showPage('products');
    const product = getProduct(productId);
    const search = document.getElementById('prodSearchInput');
    if (search && product) search.value = product.name;
    if (product) searchProducts(product.name);
    setTimeout(() => quickOpenTab(productId, 'history'), 90);
  };

  window.openSearchCustomer = function openSearchCustomer(phone, name) {
    showPage('customers');
    setTimeout(() => {
      renderCustomers();
      const input = document.getElementById('custSearch');
      if (input) {
        input.value = phone || name;
        renderCustomers();
      }
    }, 40);
  };

  window.openSearchExpense = function openSearchExpense(category) {
    showPage('expenses');
    const input = document.getElementById('expenseSearch');
    if (input) input.value = category || '';
    setTimeout(() => filterExpenses(), 40);
  };

  window.openSearchSupplier = function openSearchSupplier(name) {
    showPage('suppliers');
    setTimeout(() => {
      const title = Array.from(document.querySelectorAll('#suppList .ev-title')).find(node => String(node.textContent || '').trim() === String(name || '').trim());
      if (title) title.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  };

  window.openSearchTransaction = function openSearchTransaction(eventId, productId) {
    if (productId != null && productId !== 'null') {
      openSearchProduct(productId);
      setTimeout(() => quickOpenTab(productId, 'history'), 120);
    } else {
      openEventReceipt(eventId);
    }
  };

  function sanitizeBrokenVisibleText(root) {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    const fixes = [
      ['أ¢â‚¬آ¢', ' | '],
      ['â€¢', ' | '],
      ['آ·', ' | '],
      ['â€”', '-'],
      ['â†©ï¸ڈ', '↩'],
      ['ًں”ژ', '🔎'],
      ['ًں’³', 'قەرزی ماوە: '],
      ['ًں“‍', '📞 '],
      ['ًں’¸', '💰 '],
      ['ًں’µ', '💵 '],
      ['ًں“‌', '💳 '],
      ['ًں§¾', '💳 '],
      ['ًں‘¤', '👤 '],
      ['ًںڑڑ', '🚚 '],
      ['ًںڈ›ï¸ڈ', '🏷️ '],
      ['ًںڈ­', '🏪 '],
      ['â‌Œ', '⛔ '],
    ];
    let node;
    while ((node = walker.nextNode())) {
      let text = node.nodeValue || '';
      let next = text;
      fixes.forEach(([from, to]) => { next = next.split(from).join(to); });
      if (next !== text) node.nodeValue = next;
    }
  }

  function enhanceReceiptButtons(scope = document) {
    scope.querySelectorAll('.ev-item, .hist-item').forEach(item => {
      const dangerBtn = item.querySelector('.btn-bad');
      if (!dangerBtn || item.querySelector('.btn-receipt')) return;
      const onclickText = dangerBtn.getAttribute('onclick') || '';
      const match = onclickText.match(/\((\d+)/);
      if (!match) return;
      const eventId = Number(match[1]);
      const side = item.querySelector('.ev-side') || (() => {
        const amount = item.querySelector('.ev-amount');
        if (!amount) return null;
        const wrapper = document.createElement('div');
        wrapper.className = 'ev-side';
        amount.parentNode.insertBefore(wrapper, amount);
        wrapper.appendChild(amount);
        return wrapper;
      })();
      if (!side) return;
      let actions = side.querySelector('.ev-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'ev-actions';
        side.appendChild(actions);
      }
      const receiptBtn = document.createElement('button');
      receiptBtn.className = 'btn btn-g btn-xs btn-receipt';
      receiptBtn.type = 'button';
      receiptBtn.textContent = 'رسید';
      receiptBtn.onclick = () => openEventReceipt(eventId);
      actions.insertBefore(receiptBtn, actions.firstChild);
      if (dangerBtn.parentElement !== actions) actions.appendChild(dangerBtn);
    });
  }

  window.enhanceRenderedViews = function enhanceRenderedViews(scope) {
    const root = scope || document;
    sanitizeBrokenVisibleText(root);
    enhanceReceiptButtons(root);
  };

  function dashboardCurrencyOptions(selected = 'USD') {
    return getCurrencies().map(c => `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${c.flag} ${c.code}</option>`).join('');
  }

  function dashboardProductOptions() {
    return getProducts().map(p => `<option value="${p.id}">${escHtml(p.name)}${p.supplier ? ' | ' + escHtml(p.supplier) : ''}</option>`).join('');
  }

  function dashboardDebtTargetOptions() {
    const debtors = [];
    getCustomerStats().filter(c => c.remainUSD > 0.001).forEach(c => {
      const summary = c.token ? getCustomerDebtSummary(c.token) : null;
      if (!summary) return;
      summary.productBreakdown.filter(pb => pb.remainUSD > 0.001).forEach(pb => {
        debtors.push({ token: c.token, name: summary.name, phone: summary.phone, productId: pb.prodId, productName: pb.name, remainUSD: pb.remainUSD });
      });
    });
    return debtors.map(item => `<option value="${item.productId}|${escAttr(item.token)}|${escAttr(item.name)}|${escAttr(item.phone)}|${item.remainUSD}">${escHtml(item.name)} | ${escHtml(item.productName)} | ${fmtC(item.remainUSD, 'USD')}</option>`).join('');
  }

  window.updateDashboardSellMeta = function updateDashboardSellMeta() {
    const host = document.getElementById('dqSellStockHint');
    const productId = document.getElementById('dqSellProduct')?.value;
    const qty = parseFloat(document.getElementById('dqSellQty')?.value) || 0;
    if (!host) return;
    const product = getProduct(productId);
    if (!product) {
      host.innerHTML = '';
      return;
    }
    const stats = getProductStats(productId);
    const remainAfter = roundMoney(stats.stockQty - qty);
    host.innerHTML = `
      <span><strong>ستۆکی ئێستا:</strong> ${fmtN(stats.stockQty, 2)} ${escHtml(product.unit || '')}</span>
      <span><strong>دوای فرۆشتن:</strong> <span class="${remainAfter < 0 ? 'tbad' : 'tok'}">${fmtN(remainAfter, 2)} ${escHtml(product.unit || '')}</span></span>
      <span><strong>نرخی یەکەی تێچوو:</strong> ${fmtC(stats.unitCostUSD || 0, 'USD')}</span>
      <span><strong>قەرزی ماوە:</strong> ${fmtC(stats.debtRemainUSD || 0, 'USD')}</span>`;
  };

  window.updateDashboardLoadMeta = function updateDashboardLoadMeta() {
    const host = document.getElementById('dqLoadProductHint');
    const productId = document.getElementById('dqLoadProduct')?.value;
    if (!host) return;
    const product = getProduct(productId);
    if (!product) {
      host.innerHTML = '';
      return;
    }
    const stats = getProductStats(productId);
    host.innerHTML = `
      <span><strong>کاڵا:</strong> ${escHtml(product.name)}</span>
      <span><strong>ستۆکی ئێستا:</strong> ${fmtN(stats.stockQty, 2)} ${escHtml(product.unit || '')}</span>
      <span><strong>فرۆشیار:</strong> ${escHtml(product.supplier || 'بێ فرۆشیار')}</span>`;
  };

  window.updateDashboardDebtMeta = function updateDashboardDebtMeta() {
    const host = document.getElementById('dqDebtRemainHint');
    const raw = document.getElementById('dqDebtTarget')?.value || '';
    const amount = parseFloat(document.getElementById('dqDebtAmount')?.value) || 0;
    const currency = document.getElementById('dqDebtCurrency')?.value || 'IQD';
    if (!host) return;
    if (!raw) {
      host.innerHTML = '';
      return;
    }
    const [productId, token, name, phone, remainRaw] = raw.split('|');
    const remainUSD = parseFloat(remainRaw) || 0;
    const payUSD = toUSD(amount || 0, currency);
    const product = getProduct(productId);
    host.innerHTML = `
      <span><strong>کڕیار:</strong> ${escHtml(name || 'کڕیار')}</span>
      <span><strong>کاڵا:</strong> ${escHtml(product?.name || '—')}</span>
      <span><strong>قەرزی ئێستا:</strong> ${fmtC(remainUSD, 'USD')}</span>
      <span><strong>دوای پارەدانەوە:</strong> <span class="${payUSD > remainUSD + 0.01 ? 'tbad' : 'tok'}">${fmtC(Math.max(0, remainUSD - payUSD), 'USD')}</span></span>
      <span><strong>ژمارە:</strong> ${escHtml(phone || 'بێ ژمارە')}</span>`;
  };

  function refreshDashboardQuickMeta() {
    window.updateDashboardSellMeta();
    window.updateDashboardLoadMeta();
    window.updateDashboardDebtMeta();
  }

  function describeRecentEvent(ev) {
    const product = ev?.productId != null ? getProduct(ev.productId) : null;
    const amount = ev?.totalPrice ?? ev?.amount ?? 0;
    return `${reportTypeLabel(ev?.type || '')}${product ? ' | ' + product.name : ''}${amount ? ' | ' + fmtC(amount, ev.currency || 'USD') : ''}`;
  }

  function renderDashboardQuickPanel() {
    const hasProducts = getProducts().length > 0;
    if (!hasProducts && (dashboardQuickAction === 'sell' || dashboardQuickAction === 'load' || dashboardQuickAction === 'debt')) {
      return `<div class="empty" style="padding:20px"><span class="ei">📦</span>بۆ ئەم کارە سەرەتا کاڵا زیاد بکە.<br><button class="btn btn-p btn-sm mt8" onclick="setDashboardQuickAction('product')">کاڵای نوێ</button></div>`;
    }
    if (dashboardQuickAction === 'sell') {
      return `
        <div class="dash-quick-note">فرۆشتنێک لە شوێنی یەکدا تۆمار بکە. بۆ فرۆشتنی قەرز، ناوی کڕیار یان ژمارە و بەرواری پارەدانەوە پێویستە.</div>
        <div id="dashQuickAlert"></div>
        <div class="dash-quick-grid">
          <div class="fg"><label>کاڵا</label><select id="dqSellProduct" onchange="updateDashboardSellMeta()">${dashboardProductOptions()}</select></div>
          <div class="fg"><label>بڕ</label><input id="dqSellQty" type="number" step="0.001" min="0" inputmode="decimal" placeholder="0" oninput="updateDashboardSellMeta()"></div>
          <div class="fg"><label>نرخی یەکە</label><input id="dqSellPrice" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div>
          <div class="fg"><label>دراو</label><select id="dqSellCurrency">${dashboardCurrencyOptions('IQD')}</select></div>
          <div class="fg"><label>جۆری پارەدان</label><select id="dqSellType" onchange="toggleDashboardSellDue(this.value)"><option value="sell_cash">نەقد</option><option value="sell_debt">قەرز</option></select></div>
          <div class="fg" id="dqSellDueWrap" style="display:none"><label>بەرواری پارەدانەوە</label><input id="dqSellDueDate" type="date" value="${today()}"></div>
          <div class="fg"><label>ناوی کڕیار</label><input id="dqSellBuyer" placeholder="ناوی کڕیار..."></div>
          <div class="fg"><label>ژمارەی مۆبایل</label><input id="dqSellPhone" placeholder="07XXXXXXXXX" type="tel" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9+]/g,'')"></div>
          <div class="fg"><label>بەروار</label><input id="dqSellDate" type="date" value="${today()}"></div>
          <div class="fg"><label>تێبینی</label><input id="dqSellNote" placeholder="..." ></div>
          <div id="dqSellStockHint" class="dash-inline-hint"></div>
        </div>
        <button class="btn btn-ok btn-bl mt12" onclick="submitDashboardQuickSell()">تۆمارکردنی فرۆشتن</button>`;
    }
    if (dashboardQuickAction === 'load') {
      return `
        <div class="dash-quick-note">بارکردنێکی خێرا بۆ کاڵای هەبوو تۆمار بکە.</div>
        <div id="dashQuickAlert"></div>
        <div class="dash-quick-grid">
          <div class="fg"><label>کاڵا</label><select id="dqLoadProduct" onchange="updateDashboardLoadMeta()">${dashboardProductOptions()}</select></div>
          <div class="fg"><label>بڕ</label><input id="dqLoadQty" type="number" step="0.001" min="0" inputmode="decimal" placeholder="0"></div>
          <div class="fg"><label>کۆی نرخ</label><input id="dqLoadTotal" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div>
          <div class="fg"><label>دراو</label><select id="dqLoadCurrency">${dashboardCurrencyOptions('IQD')}</select></div>
          <div class="fg"><label>فرۆشیار</label><input id="dqLoadSupplier" placeholder="ناوی فرۆشیار..."></div>
          <div class="fg"><label>بەروار</label><input id="dqLoadDate" type="date" value="${today()}"></div>
          <div class="fg c2"><label>تێبینی</label><input id="dqLoadNote" placeholder="..." ></div>
          <div id="dqLoadProductHint" class="dash-inline-hint"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-p" onclick="submitDashboardQuickLoad()">تۆمارکردنی بار</button><button class="btn btn-g" type="button" onclick="setDashboardQuickAction('product')">+ کاڵای نوێ</button></div>`;
    }
    if (dashboardQuickAction === 'debt') {
      return `
        <div class="dash-quick-note">بڕی قەرز وەربگرە. ئەم لیستە تەنها کڕیارانی قەرزدار نیشان دەدات.</div>
        <div id="dashQuickAlert"></div>
        <div class="dash-quick-grid">
          <div class="fg c2"><label>کڕیار / کاڵا</label><select id="dqDebtTarget" onchange="updateDashboardDebtMeta()">${dashboardDebtTargetOptions() || '<option value="">هیچ قەرزێک نییە</option>'}</select></div>
          <div class="fg"><label>بڕ</label><input id="dqDebtAmount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" oninput="updateDashboardDebtMeta()"></div>
          <div class="fg"><label>دراو</label><select id="dqDebtCurrency" onchange="updateDashboardDebtMeta()">${dashboardCurrencyOptions('IQD')}</select></div>
          <div class="fg"><label>بەروار</label><input id="dqDebtDate" type="date" value="${today()}"></div>
          <div class="fg"><label>تێبینی</label><input id="dqDebtNote" placeholder="..." ></div>
          <div id="dqDebtRemainHint" class="dash-inline-hint"></div>
        </div>
        <button class="btn btn-ok btn-bl mt12" onclick="submitDashboardQuickDebt()">تۆمارکردنی پارەدانەوە</button>`;
    }
    if (dashboardQuickAction === 'expense') {
      return `
        <div class="dash-quick-note">خەرجییەک تۆمار بکە. دەتوانیت سەر بە کاڵا بێت یان گشتی.</div>
        <div id="dashQuickAlert"></div>
        <div class="dash-quick-grid">
          <div class="fg"><label>جۆر</label><input id="dqExpenseCategory" placeholder="نمونە: کرێی هاتووچۆ"></div>
          <div class="fg"><label>بڕ</label><input id="dqExpenseAmount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div>
          <div class="fg"><label>دراو</label><select id="dqExpenseCurrency">${dashboardCurrencyOptions('USD')}</select></div>
          <div class="fg"><label>کاڵا</label><select id="dqExpenseProduct"><option value="">گشتی</option>${dashboardProductOptions()}</select></div>
          <div class="fg"><label>بەروار</label><input id="dqExpenseDate" type="date" value="${today()}"></div>
          <div class="fg"><label>تێبینی</label><input id="dqExpenseNote" placeholder="..." ></div>
        </div>
        <button class="btn btn-a btn-bl mt12" onclick="submitDashboardQuickExpense()">تۆمارکردنی خەرجی</button>`;
    }
    if (dashboardQuickAction === 'customer') {
      return `
        <div class="dash-quick-note">کڕیارێکی نوێ تۆمار بکە بۆ ئەوەی دواتر بە خێرایی هەڵیبژێریت.</div>
        <div id="dashQuickAlert"></div>
        <div class="dash-quick-grid">
          <div class="fg"><label>ناوی کڕیار</label><input id="dqCustomerName" placeholder="ناوی کڕیار..."></div>
          <div class="fg"><label>ژمارەی مۆبایل</label><input id="dqCustomerPhone" placeholder="07XXXXXXXXX" type="tel" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9+]/g,'')"></div>
        </div>
        <button class="btn btn-p btn-bl mt12" onclick="submitDashboardQuickCustomer()">تۆمارکردنی کڕیار</button>`;
    }
    return `
      <div class="dash-quick-note">کاڵایەکی نوێ دروست بکە و لە هەمان کاتدا بارەکەی تۆمار بکە.</div>
      <div id="dashQuickAlert"></div>
      <div class="dash-quick-grid">
        <div class="fg"><label>ناوی کاڵا</label><input id="dqProductName" placeholder="ناوی کاڵا..."></div>
        <div class="fg"><label>یەکە</label><input id="dqProductUnit" value="دانە"></div>
        <div class="fg"><label>بڕ</label><input id="dqProductQty" type="number" step="0.001" min="0" inputmode="decimal" placeholder="0"></div>
        <div class="fg"><label>کۆی نرخ</label><input id="dqProductTotal" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div>
        <div class="fg"><label>دراو</label><select id="dqProductCurrency">${dashboardCurrencyOptions('IQD')}</select></div>
        <div class="fg"><label>فرۆشیار</label><input id="dqProductSupplier" placeholder="فرۆشیار..."></div>
        <div class="fg"><label>بەروار</label><input id="dqProductDate" type="date" value="${today()}"></div>
        <div class="fg"><label>تێبینی</label><input id="dqProductNote" placeholder="..." ></div>
      </div>
      <button class="btn btn-ok btn-bl mt12" onclick="submitDashboardQuickProduct()">تۆمارکردنی کاڵا</button>`;
  }

  window.setDashboardQuickAction = function setDashboardQuickAction(action) {
    dashboardQuickAction = action;
    renderDash();
  };

  window.toggleDashboardSellDue = function toggleDashboardSellDue(type) {
    const wrap = document.getElementById('dqSellDueWrap');
    if (wrap) wrap.style.display = type === 'sell_debt' ? '' : 'none';
  };

  window.renderDash = function renderDashPatched() {
    initAppShell();
    renderLowStockBanner();
    renderDebtDueBanner();
    const products = getProducts();
    const global = getGlobalStats();
    const todayKey = today();
    const now = new Date();
    const monthFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthStats = getProfitByRange(monthFrom, todayKey);
    const todayStats = getProfitByRange(todayKey, todayKey);
    const todayExpenses = getExpenseStatsByRange(todayKey, todayKey, { includeProductCharges: true });
    const lowStock = getLowStockProducts(5);
    const overdueDebt = getDebtDueAlerts().filter(item => item.diffDays < 0);
    const dueToday = getDebtDueAlerts().filter(item => item.diffDays === 0);
    const recentEvents = getAllEvents().slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || 0) - (a.id || 0)).slice(0, 12);
    const todayEvents = recentEvents.filter(ev => eventDateKey(ev) === todayKey).slice(0, 8);
    const lastActivity = recentEvents[0];
    const topProducts = products.map(p => ({ ...p, ...getProductStats(p.id) })).sort((a, b) => b.profitUSD - a.profitUSD).slice(0, 5);
    const debtCollectedTodayUSD = roundMoney(getAllEvents().filter(ev => ev.type === 'debt_pay' && eventDateKey(ev) === todayKey).reduce((sum, ev) => sum + eventAmountUSDValue(ev), 0));
    const newDebtTodayUSD = roundMoney(getAllEvents().filter(ev => ev.type === 'sell_debt' && eventDateKey(ev) === todayKey).reduce((sum, ev) => sum + eventAmountUSDValue(ev), 0));
    const todayTxCount = getAllEvents().filter(ev => eventDateKey(ev) === todayKey).length;
    const todayNetProfitUSD = roundMoney(todayStats.profitUSD - todayExpenses.totalExpensesUSD);

    if (document.getElementById('dashStats')) document.getElementById('dashStats').innerHTML = `
      <div class="scard info"><div class="si">📦</div><div class="sv" style="color:var(--info)">${products.length}</div><div class="sl">کۆی کاڵاکان</div></div>
      <div class="scard ok"><div class="si">💰</div><div class="sv tok">${fmtC(global.totalRevenueUSD, 'USD')}</div><div class="sl">کۆی فرۆشتن</div></div>
      <div class="scard bad"><div class="si">📉</div><div class="sv tbad">${fmtC(global.soldCostUSD, 'USD')}</div><div class="sl">تێچووی فرۆشراو</div></div>
      <div class="scard ${global.profitUSD >= 0 ? 'ok' : 'bad'}"><div class="si">📊</div><div class="sv ${global.profitUSD >= 0 ? 'tok' : 'tbad'}">${fmtC(global.profitUSD, 'USD')}</div><div class="sl">قازانجی گشتی</div></div>
      <div class="scard ${global.debtRemainUSD > 0 ? 'bad' : 'ok'}"><div class="si">💳</div><div class="sv ${global.debtRemainUSD > 0 ? 'tbad' : 'tok'}">${fmtC(global.debtRemainUSD, 'USD')}</div><div class="sl">قەرزی ماوە</div></div>
      <div class="scard info"><div class="si">🏷</div><div class="sv" style="color:var(--info)">${fmtC(global.remainingStockValueUSD, 'USD')}</div><div class="sl">بەهای ستۆکی ماوە</div></div>`;

    const todayCards = document.getElementById('dashTodayCards');
    if (todayCards) todayCards.innerHTML = `
      <div class="scard dash-mini-card ok"><div class="si">💰</div><div class="sv tok">${fmtC(todayStats.revenueUSD, 'USD')}</div><div class="sl">فرۆشتنی ئەمڕۆ</div></div>
      <div class="scard dash-mini-card warn"><div class="si">💸</div><div class="sv twarn">${fmtC(todayExpenses.totalExpensesUSD, 'USD')}</div><div class="sl">خەرجیی ئەمڕۆ</div></div>
      <div class="scard dash-mini-card ${todayNetProfitUSD >= 0 ? 'ok' : 'bad'}"><div class="si">📈</div><div class="sv ${todayNetProfitUSD >= 0 ? 'tok' : 'tbad'}">${fmtC(todayNetProfitUSD, 'USD')}</div><div class="sl">قازانجی ئەمڕۆ</div></div>
      <div class="scard dash-mini-card info"><div class="si">💳</div><div class="sv" style="color:var(--info)">${fmtC(debtCollectedTodayUSD, 'USD')}</div><div class="sl">قەرزی وەرگیراوی ئەمڕۆ</div></div>
      <div class="scard dash-mini-card bad"><div class="si">🧾</div><div class="sv tbad">${fmtC(newDebtTodayUSD, 'USD')}</div><div class="sl">قەرزی نوێی ئەمڕۆ</div></div>
      <div class="scard dash-mini-card ${lowStock.length ? 'warn' : 'ok'}"><div class="si">📦</div><div class="sv ${lowStock.length ? 'twarn' : 'tok'}">${lowStock.length}</div><div class="sl">ستۆکی کەم</div></div>
      <div class="scard dash-mini-card ${overdueDebt.length ? 'bad' : 'ok'}"><div class="si">⏰</div><div class="sv ${overdueDebt.length ? 'tbad' : 'tok'}">${overdueDebt.length}</div><div class="sl">قەرزی دواکەوتوو</div></div>
      <div class="scard dash-mini-card info"><div class="si">🧮</div><div class="sv" style="color:var(--info)">${todayTxCount}</div><div class="sl">مامەڵەی ئەمڕۆ</div></div>`;

    document.querySelectorAll('[data-dq-action]').forEach(btn => btn.classList.toggle('is-active', btn.getAttribute('data-dq-action') === dashboardQuickAction));
    const quickPanel = document.getElementById('dashQuickPanel');
    if (quickPanel) quickPanel.innerHTML = renderDashboardQuickPanel();
    setTimeout(refreshDashboardQuickMeta, 0);

    if (document.getElementById('dashMonthProfit')) document.getElementById('dashMonthProfit').innerHTML = `
      <div class="sum-box" style="padding:14px">
        <div class="sum-row"><span class="lbl">فرۆشتنی ئەم مانگە</span><span class="val tok">${fmtC(monthStats.revenueUSD, 'USD')}</span></div>
        <div class="sum-row"><span class="lbl">تێچووی فرۆشراو</span><span class="val tbad">${fmtC(monthStats.soldCostUSD, 'USD')}</span></div>
        <div class="sum-row"><span class="lbl">فرۆشتنی ئەمڕۆ</span><span class="val tok">${fmtC(todayStats.revenueUSD, 'USD')}</span></div>
        <div class="sum-row"><span class="lbl">خەرجیی ئەمڕۆ</span><span class="val twarn">${fmtC(todayExpenses.totalExpensesUSD, 'USD')}</span></div>
        <div class="sum-total"><span>قازانجی ئەم مانگە</span><span class="${monthStats.profitUSD >= 0 ? 'tok' : 'tbad'}">${fmtC(monthStats.profitUSD, 'USD')}</span></div>
      </div>`;

    if (document.getElementById('dashDebt')) document.getElementById('dashDebt').innerHTML = getCustomerStats().filter(c => c.remainUSD > 0.001).slice(0, 6).map(c => `
      <div class="dash-recent-item"><div><div class="gs-title">${escHtml(c.name)}</div><div class="gs-meta">${escHtml(c.phone || 'بێ ژمارە')} | ${c.txCount} مامەڵە</div></div><div class="tbad fw8">${fmtC(c.remainUSD, 'USD')}</div></div>`).join('') || '<div class="empty" style="padding:18px">هیچ قەرزدارێک نییە.</div>';

    if (document.getElementById('dashTopProds')) document.getElementById('dashTopProds').innerHTML = topProducts.map((p, index) => `
      <div class="dash-recent-item"><div><div class="gs-title">${index + 1}. ${escHtml(p.name)}</div><div class="gs-meta">${fmtN(p.stockQty, 2)} ${escHtml(p.unit)} | ${p.supplier ? escHtml(p.supplier) : 'بێ فرۆشیار'}</div></div><div class="${p.profitUSD >= 0 ? 'tok' : 'tbad'} fw8">${fmtC(p.profitUSD, 'USD')}</div></div>`).join('') || '<div class="empty" style="padding:18px">هیچ کاڵایەک نییە.</div>';

    const recentBox = document.getElementById('dashRecentList');
    if (recentBox) recentBox.innerHTML = todayEvents.map(ev => `<div class="dash-recent-item"><div><div class="gs-title">${escHtml(describeRecentEvent(ev))}</div><div class="gs-meta">${escHtml(eventTimeLabel(ev) || eventDateKey(ev) || '')}${ev.note ? ' | ' + escHtml(ev.note) : ''}</div></div><div class="ev-actions"><button class="btn btn-g btn-xs" onclick="openEventReceipt(${ev.id})">پسووڵە</button></div></div>`).join('') || '<div class="empty" style="padding:18px">ئەمڕۆ هێشتا هیچ چاڵاکییەک نییە.</div>';

    const attentionBox = document.getElementById('dashAttentionList');
    const attentionItems = [
      ...overdueDebt.map(item => ({ title: item.name, meta: `${item.phone || 'بێ ژمارە'} | ${fmtC(item.owedUSD, 'USD')} | ${item.dueDate}`, badge: 'دواکەوتوو', cls: 'b-bad' })),
      ...dueToday.map(item => ({ title: item.name, meta: `${item.phone || 'بێ ژمارە'} | ${fmtC(item.owedUSD, 'USD')} | ${item.dueDate}`, badge: 'ئەمڕۆ', cls: 'b-warn' })),
      ...lowStock.slice(0, 6).map(item => {
        const stats = getProductStats(item.id);
        return { title: item.name, meta: `${fmtN(stats.stockQty, 2)} ${item.unit} | ${item.supplier || 'بێ فرۆشیار'}`, badge: stats.stockQty <= 0 ? 'خەڵاس' : 'ستۆک کەم', cls: stats.stockQty <= 0 ? 'b-bad' : 'b-warn' };
      }),
    ].slice(0, 10);
    if (attentionBox) attentionBox.innerHTML = attentionItems.map(item => `<div class="dash-attention-item"><div><div class="gs-title">${escHtml(item.title)}</div><div class="meta">${escHtml(item.meta)}</div></div><span class="badge ${item.cls}">${escHtml(item.badge)}</span></div>`).join('') || '<div class="empty" style="padding:18px">هیچ شتێک پێویستی بە سەرنجی خێرا نییە.</div>';

    const newHash = `${products.length}|${getAllEvents().length}|${_statsCacheVersion}|${chartMonthRange}`;
    if (newHash !== _lastChartHash) { _lastChartHash = newHash; setTimeout(() => renderCharts(), 50); }
    setTimeout(enhanceRenderedViews, 0);
  };

  function showDashQuickAlert(type, message) {
    const host = document.getElementById('dashQuickAlert');
    if (host) showA('dashQuickAlert', type, message);
  }

  window.getCustomerStats = function getCustomerStatsPatched() {
    const evs = getAllEvents();
    const prods = getProducts();
    const registry = DB.get('customerTokens') || {};
    const map = {};
    Object.values(registry).forEach(entry => {
      if (!entry || !entry.token) return;
      map[entry.token] = { token: entry.token, name: entry.name || 'کڕیار', phone: entry.phone || '', totalUSD: 0, debtUSD: 0, paidUSD: 0, txCount: 0, products: new Set() };
    });
    evs.forEach(ev => {
      if (!ev.phone && !ev.customerToken) return;
      const normPhone = normalizePhone(ev.phone || '');
      const key = ev.customerToken || normPhone;
      if (!key) return;
      if (!map[key]) map[key] = { token: ev.customerToken || '', name: ev.buyer || 'کڕیار', phone: normPhone || '', totalUSD: 0, debtUSD: 0, paidUSD: 0, txCount: 0, products: new Set() };
      const c = map[key];
      if (ev.buyer && !c.name) c.name = ev.buyer;
      if (normPhone && !c.phone) c.phone = normPhone;
      if (ev.type === 'sell_cash' || ev.type === 'sell_debt') {
        c.totalUSD += toUSD(ev.totalPrice, ev.currency); c.txCount += 1; if (ev.type === 'sell_debt') c.debtUSD += toUSD(ev.totalPrice, ev.currency);
        const prod = prods.find(p => p.id == ev.productId); if (prod) c.products.add(prod.name);
      }
      if (ev.type === 'debt_pay') { c.paidUSD += toUSD(ev.amount, ev.currency); c.txCount += 1; }
    });
    return Object.values(map).map(c => ({ ...c, remainUSD: Math.max(0, roundMoney(c.debtUSD - c.paidUSD)), products: [...c.products] })).sort((a, b) => b.remainUSD - a.remainUSD || b.totalUSD - a.totalUSD || a.name.localeCompare(b.name, 'ar'));
  };

  window.submitDashboardQuickSell = function submitDashboardQuickSell() {
    const productId = document.getElementById('dqSellProduct')?.value;
    const qty = parseFloat(document.getElementById('dqSellQty')?.value) || 0;
    const unitPrice = parseFloat(document.getElementById('dqSellPrice')?.value) || 0;
    const currency = document.getElementById('dqSellCurrency')?.value || 'IQD';
    const type = document.getElementById('dqSellType')?.value || 'sell_cash';
    const buyer = (document.getElementById('dqSellBuyer')?.value || '').trim();
    const phoneRaw = (document.getElementById('dqSellPhone')?.value || '').trim();
    const phone = phoneRaw ? normalizePhone(phoneRaw) : '';
    const dueDate = document.getElementById('dqSellDueDate')?.value || '';
    const date = document.getElementById('dqSellDate')?.value || today();
    const note = document.getElementById('dqSellNote')?.value || '';
    const prod = getProduct(productId);
    if (!prod) return showDashQuickAlert('bad', 'کاڵا هەڵبژێرە.');
    if (!(qty > 0)) return showDashQuickAlert('bad', 'بڕ پێویستە.');
    if (!(unitPrice > 0)) return showDashQuickAlert('bad', 'نرخ پێویستە.');
    const stats = getProductStats(productId);
    if (stats.stockQty < qty) return showDashQuickAlert('bad', `ستۆک کەمە. ماوە: ${fmtN(stats.stockQty, 2)} ${prod.unit}`);
    if (type === 'sell_debt' && !buyer && !phone) return showDashQuickAlert('bad', 'بۆ فرۆشتنی قەرز ناوی کڕیار یان ژمارە پێویستە.');
    if (type === 'sell_debt' && !dueDate) return showDashQuickAlert('bad', 'بەرواری پارەدانەوە پێویستە.');
    const rateSnapshot = getCurrencies().find(c => c.code === currency)?.rateToUSD || 1;
    const capture = createUndoCapture('فرۆشتنی خێرا');
    const ev = addEvent({ productId, type, qty, unitPrice, rawTotal: qty * unitPrice, discountType: '', discountValue: 0, discountAmount: 0, totalPrice: qty * unitPrice, currency, rateSnapshot, buyer, phone, customerToken: (buyer || phone) ? getOrCreateCustomerToken(buyer, phone) : '', dueDate: type === 'sell_debt' ? dueDate : '', date, note });
    if (!ev) return showDashQuickAlert('bad', 'تۆمارکردن شکستی هێنا.');
    updateProductQty(productId, -qty);
    commitUndoCapture(capture);
    rerenderAfterMutation();
    ['dqSellQty', 'dqSellPrice', 'dqSellBuyer', 'dqSellPhone', 'dqSellNote'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    window.updateDashboardSellMeta();
    showDashQuickAlert('ok', '✅ فرۆشتن تۆمارکرا.');
  };

  window.submitDashboardQuickLoad = function submitDashboardQuickLoad() {
    const productId = document.getElementById('dqLoadProduct')?.value;
    const qty = parseFloat(document.getElementById('dqLoadQty')?.value) || 0;
    const totalPrice = parseFloat(document.getElementById('dqLoadTotal')?.value) || 0;
    const currency = document.getElementById('dqLoadCurrency')?.value || 'IQD';
    const supplier = document.getElementById('dqLoadSupplier')?.value || '';
    const date = document.getElementById('dqLoadDate')?.value || today();
    const note = document.getElementById('dqLoadNote')?.value || '';
    if (!getProduct(productId)) return showDashQuickAlert('bad', 'کاڵا هەڵبژێرە.');
    if (!(qty > 0)) return showDashQuickAlert('bad', 'بڕ پێویستە.');
    if (!(totalPrice > 0)) return showDashQuickAlert('bad', 'کۆی نرخ پێویستە.');
    const capture = createUndoCapture('بارکردنی خێرا');
    const rateSnapshot = getCurrencies().find(c => c.code === currency)?.rateToUSD || 1;
    const ev = addEvent({ productId, type: 'load', qty, totalPrice, unitPrice: totalPrice / qty, currency, rateSnapshot, supplier, date, note });
    if (!ev) return showDashQuickAlert('bad', 'تۆمارکردن شکستی هێنا.');
    updateProductQty(productId, qty);
    commitUndoCapture(capture);
    rerenderAfterMutation();
    ['dqLoadQty', 'dqLoadTotal', 'dqLoadSupplier', 'dqLoadNote'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    window.updateDashboardLoadMeta();
    showDashQuickAlert('ok', '✅ بار تۆمارکرا.');
  };

  window.submitDashboardQuickDebt = function submitDashboardQuickDebt() {
    const raw = document.getElementById('dqDebtTarget')?.value || '';
    if (!raw) return showDashQuickAlert('bad', 'هیچ قەرزێک هەڵنەبژێردرا.');
    const [productId, token, name, phone, remainRaw] = raw.split('|');
    const amount = parseFloat(document.getElementById('dqDebtAmount')?.value) || 0;
    const currency = document.getElementById('dqDebtCurrency')?.value || 'IQD';
    const date = document.getElementById('dqDebtDate')?.value || today();
    const note = document.getElementById('dqDebtNote')?.value || '';
    if (!(amount > 0)) return showDashQuickAlert('bad', 'بڕ پێویستە.');
    const amountUSD = toUSD(amount, currency);
    if (amountUSD > (parseFloat(remainRaw) || 0) + 0.01) return showDashQuickAlert('bad', 'بڕی پارەدانەوە لە قەرزی ماوە زیاترە.');
    const capture = createUndoCapture('وەرگرتنی قەرز');
    const ev = addEvent({ productId, type: 'debt_pay', amount: roundMoney(amount), currency, date, buyer: name || '', phone: phone || '', note, customerToken: token || '' });
    if (!ev) return showDashQuickAlert('bad', 'تۆمارکردن شکستی هێنا.');
    commitUndoCapture(capture);
    rerenderAfterMutation();
    ['dqDebtAmount', 'dqDebtNote'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    window.updateDashboardDebtMeta();
    showDashQuickAlert('ok', '✅ پارەدانەوە تۆمارکرا.');
  };

  window.submitDashboardQuickExpense = function submitDashboardQuickExpense() {
    const category = (document.getElementById('dqExpenseCategory')?.value || '').trim();
    const amount = parseFloat(document.getElementById('dqExpenseAmount')?.value) || 0;
    const currency = document.getElementById('dqExpenseCurrency')?.value || 'USD';
    const productId = document.getElementById('dqExpenseProduct')?.value || null;
    const date = document.getElementById('dqExpenseDate')?.value || today();
    const note = document.getElementById('dqExpenseNote')?.value || '';
    if (!category) return showDashQuickAlert('bad', 'جۆری خەرجی پێویستە.');
    if (!(amount > 0)) return showDashQuickAlert('bad', 'بڕ پێویستە.');
    const capture = createUndoCapture('تۆمارکردنی خەرجی');
    const rateSnapshot = getCurrencies().find(c => c.code === currency)?.rateToUSD || 1;
    const ev = addEvent({ type: 'expense', productId, expenseCategory: category, amount, currency, rateSnapshot, amountUSD: toUSD(amount, currency), date, note });
    if (!ev) return showDashQuickAlert('bad', 'تۆمارکردن شکستی هێنا.');
    commitUndoCapture(capture);
    rerenderAfterMutation();
    ['dqExpenseCategory', 'dqExpenseAmount', 'dqExpenseNote'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    showDashQuickAlert('ok', '✅ خەرجی تۆمارکرا.');
  };

  window.submitDashboardQuickCustomer = function submitDashboardQuickCustomer() {
    const name = (document.getElementById('dqCustomerName')?.value || '').trim();
    const phoneRaw = (document.getElementById('dqCustomerPhone')?.value || '').trim();
    const phone = phoneRaw ? normalizePhone(phoneRaw) : '';
    if (!name && !phone) return showDashQuickAlert('bad', 'ناو یان ژمارە پێویستە.');
    if (phoneRaw && !phone) return showDashQuickAlert('bad', 'ژمارەی مۆبایل دروست نییە.');
    const existing = getCustomerStats().find(item => phone && item.phone === phone);
    registerCustomer(name, phone);
    rerenderAfterMutation();
    ['dqCustomerName', 'dqCustomerPhone'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    showDashQuickAlert('ok', existing ? 'ℹ️ ئەم کڕیارە پێشتر هەبوو، زانیارییەکە هەماهەنگ کرا.' : '✅ کڕیار زیادکرا.');
  };

  window.submitDashboardQuickProduct = function submitDashboardQuickProduct() {
    const name = (document.getElementById('dqProductName')?.value || '').trim();
    const unit = (document.getElementById('dqProductUnit')?.value || '').trim() || 'دانە';
    const qty = parseFloat(document.getElementById('dqProductQty')?.value) || 0;
    const totalPrice = parseFloat(document.getElementById('dqProductTotal')?.value) || 0;
    const currency = document.getElementById('dqProductCurrency')?.value || 'IQD';
    const supplier = document.getElementById('dqProductSupplier')?.value || '';
    const date = document.getElementById('dqProductDate')?.value || today();
    const note = document.getElementById('dqProductNote')?.value || '';
    if (!name) return showDashQuickAlert('bad', 'ناوی کاڵا پێویستە.');
    if (!(qty > 0)) return showDashQuickAlert('bad', 'بڕ پێویستە.');
    if (totalPrice < 0) return showDashQuickAlert('bad', 'نرخ نادروستە.');
    const capture = createUndoCapture('زیادکردنی کاڵا');
    const product = addProduct({ name, qty, unit, buyPrice: totalPrice, buyCurrency: currency, supplier, buyDate: date, note });
    const rateSnapshot = getCurrencies().find(c => c.code === currency)?.rateToUSD || 1;
    const ev = addEvent({ productId: product.id, type: 'load', qty, totalPrice, unitPrice: qty > 0 ? totalPrice / qty : 0, currency, rateSnapshot, supplier, date, note });
    if (!ev) return showDashQuickAlert('bad', 'تۆمارکردن شکستی هێنا.');
    commitUndoCapture(capture);
    rerenderAfterMutation();
    ['dqProductName', 'dqProductUnit', 'dqProductQty', 'dqProductTotal', 'dqProductSupplier', 'dqProductNote'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = id === 'dqProductUnit' ? 'دانە' : '';
    });
    showDashQuickAlert('ok', '✅ کاڵا زیادکرا و بۆ فرۆشتن ئامادەیە.');
  };

  function buildReconciliationItems(report) {
    const revenueSplit = roundMoney((report.summary.cashSalesUSD || 0) + (report.summary.debtSalesUSD || 0));
    const expectedGross = roundMoney((report.summary.totalRevenueUSD || 0) - (report.summary.soldCostUSD || 0));
    const expectedNet = roundMoney((report.summary.grossProfitUSD || 0) - (report.summary.generalExpensesUSD || 0));
    const productRevenueSum = roundMoney((report.productRows || []).reduce((sum, row) => sum + (parseFloat(row.revenueUSD) || 0), 0));
    const productDebtSum = roundMoney((report.productRows || []).reduce((sum, row) => sum + (parseFloat(row.debtRemainUSD) || 0), 0));
    const customerDebtSum = roundMoney((report.customerRows || []).reduce((sum, row) => sum + (parseFloat(row.debtRemainUSD) || 0), 0));
    const stockValueSum = roundMoney((report.productRows || []).reduce((sum, row) => sum + (parseFloat(row.currentStockValueUSD) || 0), 0));
    const diffLabel = value => Math.abs(value) <= 0.01 ? 'هاوتایە' : `جیاوازی ${fmtC(Math.abs(value), 'USD')}`;
    return [
      { title: 'فرۆشتن', good: Math.abs((report.summary.totalRevenueUSD || 0) - revenueSplit) <= 0.01, left: 'کۆی فرۆشتن', right: 'cash + debt', detail: `${fmtC(report.summary.totalRevenueUSD || 0, 'USD')} = ${fmtC(report.summary.cashSalesUSD || 0, 'USD')} + ${fmtC(report.summary.debtSalesUSD || 0, 'USD')} | ${diffLabel((report.summary.totalRevenueUSD || 0) - revenueSplit)}` },
      { title: 'قازانجی گشتی', good: Math.abs((report.summary.grossProfitUSD || 0) - expectedGross) <= 0.01, left: 'gross profit', right: 'revenue - sold cost', detail: `${fmtC(report.summary.grossProfitUSD || 0, 'USD')} = ${fmtC(report.summary.totalRevenueUSD || 0, 'USD')} - ${fmtC(report.summary.soldCostUSD || 0, 'USD')} | ${diffLabel((report.summary.grossProfitUSD || 0) - expectedGross)}` },
      { title: 'قازانجی خاوێن کاروبار', good: Math.abs((report.summary.netProfitUSD || 0) - expectedNet) <= 0.01, left: 'net profit', right: 'gross - general expenses', detail: `${fmtC(report.summary.netProfitUSD || 0, 'USD')} = ${fmtC(report.summary.grossProfitUSD || 0, 'USD')} - ${fmtC(report.summary.generalExpensesUSD || 0, 'USD')}` },
      { title: 'کۆی فرۆشتنی کاڵاکان', good: Math.abs((report.summary.totalRevenueUSD || 0) - productRevenueSum) <= 0.01, left: 'summary revenue', right: 'sum(products revenue)', detail: `${fmtC(report.summary.totalRevenueUSD || 0, 'USD')} / ${fmtC(productRevenueSum, 'USD')} | ${diffLabel((report.summary.totalRevenueUSD || 0) - productRevenueSum)}` },
      { title: 'قەرزی ماوە', good: Math.abs((report.summary.remainingDebtUSD || 0) - productDebtSum) <= 0.01 && Math.abs((report.summary.remainingDebtUSD || 0) - customerDebtSum) <= 0.01, left: 'summary / products / customers', right: 'all-time debt remain', detail: `${fmtC(report.summary.remainingDebtUSD || 0, 'USD')} / ${fmtC(productDebtSum, 'USD')} / ${fmtC(customerDebtSum, 'USD')}` },
      { title: 'بەهای ستۆک', good: Math.abs((report.summary.remainingStockValueUSD || 0) - stockValueSum) <= 0.01, left: 'summary stock value', right: 'sum(products stock value)', detail: `${fmtC(report.summary.remainingStockValueUSD || 0, 'USD')} / ${fmtC(stockValueSum, 'USD')} | ${diffLabel((report.summary.remainingStockValueUSD || 0) - stockValueSum)}` },
    ];
  }

  function renderProfitReconciliationCard(report) {
    const items = buildReconciliationItems(report);
    return `
      <div class="card report-recon-card">
        <div class="ctitle">🧮 ڕوونیی ژمارەکان</div>
        <div class="report-export-note" style="margin-bottom:12px">ئەم card ـە نیشان دەدات ژمارە سەرەکییەکان چۆن هەژمار کراون. تێبینی: لە business summary ـدا تەنها <strong>خەرجیی گشتی</strong> لە gross profit کەم دەکرێتەوە؛ خەرجیی سەر بە کاڵا لە product analysis ـدا هەژمار کراون تا دووجار حساب نەکرێن.</div>
        <div class="report-recon-grid">
          ${items.map(item => `<div class="report-recon-item"><div class="head"><strong>${escHtml(item.title)}</strong><span class="badge ${item.good ? 'b-ok' : 'b-bad'}">${item.good ? 'هاوتا' : 'پشکنین'}</span></div><div class="meta">${escHtml(item.left)} • ${escHtml(item.right)}</div><div class="meta" style="margin-top:8px;color:var(--text)">${escHtml(item.detail)}</div></div>`).join('')}
        </div>
      </div>`;
  }

  function getCurrentReportRange() {
    const range = getDateRange();
    return { from: range.from || '2000-01-01', to: range.to || today() };
  }

  window.setReportExportMode = function setReportExportMode(mode) {
    reportExportMode = mode || 'business';
    window.updateReportExportControls();
  };

  window.setReportExportProductId = function setReportExportProductId(productId) {
    reportExportProductId = productId || '';
    window.updateReportExportControls();
  };

  function getReportPreviewFileName(mode, productId, from, to) {
    if (mode === 'single_product') {
      const product = getProduct(productId);
      return `product-report-${slugifyReportName(product?.name || 'item', 'item')}-${reportRangeFilePart(from, to)}.xlsx`;
    }
    if (mode === 'all_products') return `all-products-report-${reportRangeFilePart(from, to)}.xlsx`;
    return `business-report-${reportRangeFilePart(from, to)}.xlsx`;
  }

  function buildReportExportPreviewHtml(mode, report, productReport) {
    if (mode === 'single_product') {
      if (!productReport) return '<div class="report-empty"><div class="ei">📦</div><div class="eh">کاڵا هەڵبژێرە</div><div class="ed">بۆ هەناردەی ڕاپۆرتی تاکە کاڵا، سەرەتا کاڵایەک هەڵبژێرە.</div></div>';
      return `
        <div class="report-preview-card"><span class="lbl">کاڵا</span><span class="val">${escHtml(productReport.product.name)}</span></div>
        <div class="report-preview-card"><span class="lbl">فرۆشتن</span><span class="val tok">${fmtC(productReport.summary.totalCashRevenueUSD + productReport.summary.totalDebtRevenueUSD, 'USD')}</span></div>
        <div class="report-preview-card"><span class="lbl">قازانجی خاوێن</span><span class="val ${productReport.summary.netProfitUSD >= 0 ? 'tok' : 'tbad'}">${fmtC(productReport.summary.netProfitUSD, 'USD')}</span></div>
        <div class="report-preview-card"><span class="lbl">قەرزی ماوە</span><span class="val ${productReport.summary.totalDebtRemainingUSD > 0 ? 'tbad' : 'tok'}">${fmtC(productReport.summary.totalDebtRemainingUSD, 'USD')}</span></div>`;
    }
    if (mode === 'all_products') {
      const lowStockCount = report.productRows.filter(row => row.currentStockQty <= 5).length;
      const debtCount = report.productRows.filter(row => row.debtRemainUSD > 0.001).length;
      return `
        <div class="report-preview-card"><span class="lbl">کاڵاکان</span><span class="val">${report.productRows.length}</span></div>
        <div class="report-preview-card"><span class="lbl">ستۆکی کەم</span><span class="val ${lowStockCount ? 'twarn' : 'tok'}">${lowStockCount}</span></div>
        <div class="report-preview-card"><span class="lbl">کاڵای قەرزدار</span><span class="val ${debtCount ? 'tbad' : 'tok'}">${debtCount}</span></div>
        <div class="report-preview-card"><span class="lbl">تۆماری مامەڵە</span><span class="val">${report.eventsLog.length}</span></div>`;
    }
    return `
      <div class="report-preview-card"><span class="lbl">کۆی فرۆشتن</span><span class="val tok">${fmtC(report.summary.totalRevenueUSD, 'USD')}</span></div>
      <div class="report-preview-card"><span class="lbl">قازانجی خاوێن</span><span class="val ${report.summary.netProfitUSD >= 0 ? 'tok' : 'tbad'}">${fmtC(report.summary.netProfitUSD, 'USD')}</span></div>
      <div class="report-preview-card"><span class="lbl">قەرزی ماوە</span><span class="val ${report.summary.remainingDebtUSD > 0 ? 'tbad' : 'tok'}">${fmtC(report.summary.remainingDebtUSD, 'USD')}</span></div>
      <div class="report-preview-card"><span class="lbl">تۆماری مامەڵە</span><span class="val">${report.summary.transactionCount}</span></div>`;
  }

  window.updateReportExportControls = function updateReportExportControls() {
    const { from, to } = getCurrentReportRange();
    const typeSelect = document.getElementById('reportExportType');
    const productSelect = document.getElementById('reportProductExport');
    const productWrap = document.getElementById('reportProductWrap');
    const filePreview = document.getElementById('reportFilePreview');
    const preview = document.getElementById('reportExportPreview');
    const report = buildDetailedReport(from, to);
    reportExportMode = typeSelect?.value || reportExportMode || 'business';
    if (!reportExportProductId || !getProduct(reportExportProductId)) {
      reportExportProductId = productSelect?.value || getProducts()[0]?.id || '';
    }
    if (productSelect && reportExportProductId) productSelect.value = String(reportExportProductId);
    if (productWrap) productWrap.style.display = reportExportMode === 'single_product' ? '' : 'none';
    const productReport = reportExportMode === 'single_product' && reportExportProductId ? buildProductWorkbookReport(reportExportProductId, from, to) : null;
    if (filePreview) filePreview.value = getReportPreviewFileName(reportExportMode, reportExportProductId, from, to);
    if (preview) preview.innerHTML = buildReportExportPreviewHtml(reportExportMode, report, productReport);
  };

  window.exportCurrentReportWorkbook = function exportCurrentReportWorkbook() {
    const { from, to } = getCurrentReportRange();
    const mode = document.getElementById('reportExportType')?.value || reportExportMode || 'business';
    reportExportMode = mode;
    if (mode === 'single_product') {
      const productId = document.getElementById('reportProductExport')?.value || reportExportProductId;
      if (!productId) return alert('کاڵا هەڵبژێرە');
      reportExportProductId = productId;
      exportProductWorkbook(productId, from, to);
      return;
    }
    if (mode === 'all_products') {
      exportAllProductsWorkbook(from, to);
      return;
    }
    exportReportsWorkbook(from, to);
  };

  window.exportSelectedProductReport = function exportSelectedProductReport() {
    const { from, to } = getCurrentReportRange();
    const id = document.getElementById('reportProductExport')?.value;
    if (!id) return alert('کاڵا هەڵبژێرە');
    reportExportProductId = id;
    exportProductWorkbook(id, from, to);
  };

  window.renderProfits = function renderProfitsPatched() {
    const { from, to } = getDateRange();
    if (currentRange === 'custom' && (!from || !to)) return;
    const report = buildDetailedReport(from, to);
    const content = document.getElementById('profitsContent');
    if (!content) return;
    if (!reportExportProductId || !getProduct(reportExportProductId)) reportExportProductId = getProducts()[0]?.id || '';
    const productOptions = getProducts().map(p => `<option value="${p.id}" ${String(p.id) === String(reportExportProductId) ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('');
    content.innerHTML = `
      <div class="card">
        <div class="ctitle">ڕاپۆرتی گشتی<div class="ca"><button class="btn btn-ok btn-sm" onclick="exportReportsWorkbook('${from}','${to}')">Excel</button><button class="btn btn-ol btn-sm" onclick="exportToPDF()">PDF</button></div></div>
        <div class="sgrid">
          <div class="scard ok"><div class="si">💰</div><div class="sv tok">${fmtC(report.summary.totalRevenueUSD, 'USD')}</div><div class="sl">کۆی فرۆشتن</div></div>
          <div class="scard ok"><div class="si">💵</div><div class="sv tok">${fmtC(report.summary.cashSalesUSD, 'USD')}</div><div class="sl">فرۆشتنی نەقد</div></div>
          <div class="scard bad"><div class="si">🧾</div><div class="sv tbad">${fmtC(report.summary.debtSalesUSD, 'USD')}</div><div class="sl">فرۆشتنی قەرز</div></div>
          <div class="scard info"><div class="si">💳</div><div class="sv" style="color:var(--info)">${fmtC(report.summary.debtCollectedUSD, 'USD')}</div><div class="sl">وەرگرتنی قەرز</div></div>
          <div class="scard warn"><div class="si">💸</div><div class="sv twarn">${fmtC(report.summary.totalExpensesUSD, 'USD')}</div><div class="sl">کۆی خەرجی</div></div>
          <div class="scard ${report.summary.netProfitUSD >= 0 ? 'ok' : 'bad'}"><div class="si">📈</div><div class="sv ${report.summary.netProfitUSD >= 0 ? 'tok' : 'tbad'}">${fmtC(report.summary.netProfitUSD, 'USD')}</div><div class="sl">قازانجی خاوێن</div></div>
        </div>
        <div class="sum-box">
          <div class="sum-row"><span class="lbl">لە</span><span class="val">${from}</span></div>
          <div class="sum-row"><span class="lbl">بۆ</span><span class="val">${to}</span></div>
          <div class="sum-row"><span class="lbl">تێچووی فرۆشراو</span><span class="val tbad">${fmtC(report.summary.soldCostUSD, 'USD')}</span></div>
          <div class="sum-row"><span class="lbl">خەرجیی سەر بە کاڵا</span><span class="val twarn">${fmtC(report.summary.productExpensesUSD, 'USD')}</span></div>
          <div class="sum-row"><span class="lbl">خەرجیی گشتی</span><span class="val twarn">${fmtC(report.summary.generalExpensesUSD, 'USD')}</span></div>
          <div class="sum-row"><span class="lbl">بەهای ستۆکی ماوە</span><span class="val">${fmtC(report.summary.remainingStockValueUSD, 'USD')}</span></div>
          <div class="sum-total"><span>قەرزی ماوە</span><span class="${report.summary.remainingDebtUSD > 0 ? 'tbad' : 'tok'}">${fmtC(report.summary.remainingDebtUSD, 'USD')}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="ctitle">هەناردەی Excel<div class="ca"><button class="btn btn-p btn-sm" onclick="exportCurrentReportWorkbook()">Export Excel</button></div></div>
        <div class="report-export-shell">
          <div class="report-export-grid">
            <div class="fg"><label>جۆری ڕاپۆرت</label><select id="reportExportType" onchange="setReportExportMode(this.value)"><option value="business" ${reportExportMode === 'business' ? 'selected' : ''}>ڕاپۆرتی گشتی</option><option value="all_products" ${reportExportMode === 'all_products' ? 'selected' : ''}>هەموو کاڵاکان</option><option value="single_product" ${reportExportMode === 'single_product' ? 'selected' : ''}>تاکە کاڵا</option></select></div>
            <div class="fg" id="reportProductWrap" style="display:${reportExportMode === 'single_product' ? '' : 'none'}"><label>کاڵا</label><select id="reportProductExport" onchange="setReportExportProductId(this.value)"><option value="">کاڵا هەڵبژێرە</option>${productOptions}</select></div>
            <div class="fg"><label>لە</label><input value="${from}" readonly></div>
            <div class="fg"><label>بۆ</label><input value="${to}" readonly></div>
            <div class="fg c2"><label>ناوی فایل</label><input id="reportFilePreview" value="${getReportPreviewFileName(reportExportMode, reportExportProductId, from, to)}" readonly></div>
          </div>
          <div class="report-export-note">Workbook ـەکە بە browser و بە شێوەی offline دروست دەبێت. هەژمارەکان لە هەمان business logic ی سیستەمەکە وەردەگیرێن تا ژمارەی دووجار یان هەڵە دروست نەبێت.</div>
          <div id="reportExportPreview" class="report-preview-grid">${buildReportExportPreviewHtml(reportExportMode, report, reportExportMode === 'single_product' && reportExportProductId ? buildProductWorkbookReport(reportExportProductId, from, to) : null)}</div>
        </div>
      </div>
      ${renderProfitReconciliationCard(report)}
      <div class="card">
        <div class="ctitle">ڕاپۆرتی هەموو کاڵاکان</div>
        <div class="tw"><table><thead><tr><th>کاڵا</th><th>ستۆک</th><th>کڕین</th><th>فرۆشتن</th><th>خەرجی</th><th>قازانج</th><th>قەرز</th><th>ڕێژە</th><th>دۆخ</th></tr></thead><tbody>${report.productRows.map(row => `<tr><td><strong>${escHtml(row.name)}</strong><div style="font-size:10px;color:var(--faint)">${escHtml(row.supplier || 'بێ فرۆشیار')}</div></td><td>${fmtN(row.currentStockQty,2)} ${escHtml(row.unit)}</td><td>${fmtC(row.purchaseUSD,'USD')}</td><td class="tok">${fmtC(row.revenueUSD,'USD')}</td><td class="twarn">${fmtC(row.productExpenseUSD,'USD')}</td><td><span class="badge ${row.netProfitUSD >= 0 ? 'b-ok' : 'b-bad'}">${fmtC(row.netProfitUSD,'USD')}</span></td><td class="${row.debtRemainUSD > 0 ? 'tbad' : 'tok'}">${fmtC(row.debtRemainUSD,'USD')}</td><td>${fmtN(row.marginPct,1)}%</td><td><span class="badge ${row.status === 'باش' ? 'b-ok' : row.status === 'ستۆک کەم' ? 'b-warn' : 'b-bad'}">${escHtml(row.status)}</span></td></tr>`).join('') || '<tr><td colspan="9" class="empty">هیچ کاڵایەک نییە.</td></tr>'}</tbody></table></div>
      </div>
      <div class="report-stack">
        <div class="card report-table-card"><div class="ctitle">ڕاپۆرتی کڕیاران</div><div class="tw"><table><thead><tr><th>کڕیار</th><th>ژمارە</th><th>فرۆشتنی قەرز</th><th>پارەدانەوەکان</th><th>قەرزی ماوە</th><th>مامەڵەکان</th><th>دوایین مامەڵە</th></tr></thead><tbody>${report.customerRows.map(row => `<tr><td>${escHtml(row.name)}</td><td>${escHtml(row.phone || '-')}</td><td>${fmtC(row.debtSalesUSD,'USD')}</td><td class="tok">${fmtC(row.paymentsUSD,'USD')}</td><td class="${row.debtRemainUSD > 0 ? 'tbad' : 'tok'}">${fmtC(row.debtRemainUSD,'USD')}</td><td>${row.txCount}</td><td>${escHtml(row.lastTxDate || '-')}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">هیچ کڕیارێک نییە.</td></tr>'}</tbody></table></div></div>
        <div class="card report-table-card"><div class="ctitle">ڕاپۆرتی خەرجی</div>${report.expenseRows.length ? `<div class="tw"><table><thead><tr><th>بەروار</th><th>جۆر</th><th>کاڵا</th><th>USD</th></tr></thead><tbody>${report.expenseRows.map(row => `<tr><td>${escHtml(row.date || '-')}</td><td>${escHtml(row.category)}</td><td>${escHtml(row.productName)}</td><td class="tbad">${fmtC(row.amountUSD,'USD')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="report-empty"><div class="ei">💸</div><div class="eh">هیچ خەرجییەک نییە</div><div class="ed">لە ماوەی هەڵبژێردراودا هیچ خەرجییەک تۆمار نەکراوە.</div></div>`}</div>
      </div>
      <div class="card">
        <div class="ctitle">تۆماری مامەڵەکان</div>
        <div class="tw"><table><thead><tr><th>بەروار</th><th>جۆر</th><th>کاڵا</th><th>بڕ</th><th>دراو</th><th>USD</th><th>کڕیار</th><th>تێبینی</th></tr></thead><tbody>${report.eventsLog.slice(0, 60).map(row => `<tr><td>${escHtml(row.date || '-')}</td><td>${escHtml(row.type)}</td><td>${escHtml(row.productName || '-')}</td><td>${row.qty === '' ? '-' : fmtN(row.qty,2) + ' ' + escHtml(row.unit || '')}</td><td>${fmtC(row.amount,row.currency)}</td><td>${fmtC(row.amountUSD,'USD')}</td><td>${escHtml(row.customerName || '-')}</td><td>${escHtml(row.note || '-')}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">هیچ مامەڵەیەک نییە.</td></tr>'}</tbody></table></div>
      </div>`;
    setTimeout(() => window.updateReportExportControls(), 0);
    setTimeout(enhanceRenderedViews, 0);
  };

  function findEventById(eventId) {
    return getAllEvents().find(ev => ev.id == eventId) || null;
  }

  function getDebtStateAroundEvent(target) {
    const token = target?.customerToken || (target?.buyer || target?.phone ? getOrCreateCustomerToken(target.buyer || '', target.phone || '') : '');
    if (!token) return null;
    const events = getAllEvents().filter(ev => (ev.customerToken || '') === token || ((ev.buyer || '') === (target.buyer || '') && normalizePhone(ev.phone || '') === normalizePhone(target.phone || ''))).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || 0) - (b.id || 0));
    let owed = 0;
    let before = 0;
    let after = 0;
    for (const ev of events) {
      if (ev.id === target.id) before = roundMoney(owed);
      if (ev.type === 'sell_debt') owed += toUSD(ev.totalPrice, ev.currency);
      if (ev.type === 'debt_pay') owed -= toUSD(ev.amount, ev.currency);
      owed = Math.max(0, roundMoney(owed));
      if (ev.id === target.id) { after = owed; break; }
    }
    return { beforeUSD: before, afterUSD: after, token };
  }

  function receiptText(ev, product) {
    const amount = ev.totalPrice ?? ev.amount ?? 0;
    return `${reportTypeLabel(ev.type)}\n${product ? 'کاڵا: ' + product.name + '\n' : ''}${ev.qty != null ? 'بڕ: ' + fmtN(ev.qty, 2) + ' ' + (product?.unit || '') + '\n' : ''}بڕی پارە: ${fmtC(amount, ev.currency || 'USD')}\nبەروار: ${ev.date || ''}${ev.buyer ? '\nکڕیار: ' + ev.buyer : ''}${ev.note ? '\nتێبینی: ' + ev.note : ''}`;
  }

  window.openEventReceipt = function openEventReceipt(eventId) {
    const ev = findEventById(eventId);
    if (!ev) return alert('مامەڵە نەدۆزرایەوە');
    const product = ev.productId != null ? getProduct(ev.productId) : null;
    const debtState = getDebtStateAroundEvent(ev);
    const customerLink = ev.buyer || ev.phone ? getDebtorLink(ev.buyer || '', ev.phone || '') : '';
    const phoneDigits = (ev.phone || '').replace(/\D/g, '');
    const summaryText = receiptText(ev, product);
    const waLink = phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(summaryText)}` : '';
    const amount = ev.totalPrice ?? ev.amount ?? 0;
    const rateInfo = ev.rateSnapshot && ev.currency && ev.currency !== 'USD' ? `1$ = ${fmtN(ev.rateSnapshot, 0)} ${ev.currency}` : '';
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="ckb" dir="rtl"><head><meta charset="UTF-8"><title>پسووڵە</title><style>body{font-family:'Noto Sans Arabic',sans-serif;background:#eef3f8;color:#111;padding:24px}*{box-sizing:border-box}.receipt-paper{background:#fff;color:#111;border-radius:18px;padding:22px;border:1px solid #dbe3ef;max-width:820px;margin:0 auto}.receipt-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}.receipt-grid div{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px}.receipt-title{font-size:24px;font-weight:800;margin-bottom:4px}.receipt-sub{color:#64748b;font-size:13px}.receipt-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #e5e7eb}.receipt-row:last-child{border-bottom:none}.badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#e2f4ee;color:#059669;font-weight:700;font-size:12px}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.toolbar button,.toolbar a{padding:10px 14px;border-radius:10px;border:none;background:#1f4e79;color:#fff;text-decoration:none;font-family:inherit;font-size:13px;cursor:pointer}.toolbar .alt{background:#fff;color:#1f4e79;border:1px solid #1f4e79}@media print{body{padding:0;background:#fff}.toolbar{display:none}.receipt-paper{border:none;border-radius:0;max-width:none;margin:0;box-shadow:none}}</style></head><body><div class="receipt-paper"><div class="receipt-title">پسووڵەی مامەڵە</div><div class="receipt-sub">سیستەمی بەڕێوەبردنی کاڵا | ${reportTypeLabel(ev.type)}</div><div class="receipt-grid"><div><strong>کاڵا</strong><div>${product ? escHtml(product.name) : 'گشتی'}</div></div><div><strong>بەروار</strong><div>${escHtml(ev.date || '')}</div></div><div><strong>کڕیار / فرۆشیار</strong><div>${escHtml(ev.buyer || ev.supplier || '-')}</div></div><div><strong>ژمارە</strong><div>${escHtml(ev.phone || '-')}</div></div></div><div class="receipt-row"><span>جۆر</span><strong>${escHtml(reportTypeLabel(ev.type))}</strong></div>${ev.qty != null ? `<div class="receipt-row"><span>بڕ</span><strong>${fmtN(ev.qty, 2)} ${escHtml(product?.unit || '')}</strong></div>` : ''}${ev.unitPrice != null ? `<div class="receipt-row"><span>نرخی یەکە</span><strong>${fmtC(ev.unitPrice, ev.currency || 'USD')}</strong></div>` : ''}<div class="receipt-row"><span>بڕی پارە</span><strong>${fmtC(amount, ev.currency || 'USD')}</strong></div>${rateInfo ? `<div class="receipt-row"><span>نرخی گۆڕان</span><strong>${escHtml(rateInfo)}</strong></div>` : ''}${debtState ? `<div class="receipt-row"><span>قەرزی پێشوو</span><strong>${fmtC(debtState.beforeUSD, 'USD')}</strong></div><div class="receipt-row"><span>قەرزی نوێ</span><strong>${fmtC(debtState.afterUSD, 'USD')}</strong></div>` : ''}${ev.dueDate ? `<div class="receipt-row"><span>بەرواری قەرز</span><strong>${escHtml(ev.dueDate)}</strong></div>` : ''}${ev.note ? `<div class="receipt-row"><span>تێبینی</span><strong>${escHtml(ev.note)}</strong></div>` : ''}${customerLink ? `<div class="receipt-row"><span>لینکی کڕیار</span><strong style="font-size:12px;word-break:break-all">${escHtml(customerLink)}</strong></div>` : ''}<div class="toolbar"><button onclick="window.print()">چاپ</button><button onclick="window.print()" class="alt">هەڵگرتن وەک PDF</button><button onclick="navigator.clipboard.writeText(${JSON.stringify(summaryText)}).then(()=>alert('کۆپی کرا'))" class="alt">هاوبەشکردن</button>${waLink ? `<a href="${waLink}" target="_blank">واتساپ</a>` : ''}</div></div></body></html>`);
    win.document.close();
  };

  function mutationFingerprint() {
    const lastEvent = getAllEvents().slice(-1)[0]?.id || 0;
    const lastProduct = getProducts().slice(-1)[0]?.id || 0;
    return `${getProducts().length}|${getAllEvents().length}|${lastProduct}|${lastEvent}`;
  }

  window.renderSettings = function renderSettingsPatched() {
    renderSettingsEnhancements();
    setTimeout(enhanceRenderedViews, 0);
  };

  const originalDoAddProduct = window.doAddProduct;
  const originalDoAddExpense = window.doAddExpense;
  const originalSaveLoad = window.saveLoad;
  const originalSaveSell = window.saveSell;
  const originalSaveDebtPay = window.saveDebtPay;
  const originalDeleteExpense = window.deleteExpense;
  const originalDelEvAndRefresh = window.delEvAndRefresh;
  const originalDoExport = window.doExport;
  const originalDoImport = window.doImport;
  const originalRenderProducts = window.renderProducts;
  const originalRenderCustomers = window.renderCustomers;
  const originalRenderExpenses = window.renderExpenses;
  const originalSwitchProdTab = window.switchProdTab;
  const originalRefreshProdCard = window.refreshProdCard;

  function wrapMutation(label, originalFn) {
    return function wrappedMutation() {
      const before = mutationFingerprint();
      const capture = createUndoCapture(label);
      const result = originalFn.apply(this, arguments);
      setTimeout(() => {
        if (mutationFingerprint() !== before) commitUndoCapture(capture);
        enhanceRenderedViews();
      }, 0);
      return result;
    };
  }

  if (typeof originalDoAddProduct === 'function') window.doAddProduct = wrapMutation('زیادکردنی کاڵا', originalDoAddProduct);
  if (typeof originalDoAddExpense === 'function') window.doAddExpense = wrapMutation('تۆمارکردنی خەرجی', originalDoAddExpense);
  if (typeof originalSaveLoad === 'function') window.saveLoad = wrapMutation('بارکردن', originalSaveLoad);
  if (typeof originalSaveSell === 'function') window.saveSell = wrapMutation('فرۆشتن', originalSaveSell);
  if (typeof originalSaveDebtPay === 'function') window.saveDebtPay = wrapMutation('پارەدانەوەی قەرز', originalSaveDebtPay);
  if (typeof originalDeleteExpense === 'function') window.deleteExpense = wrapMutation('سڕینەوەی خەرجی', originalDeleteExpense);
  if (typeof originalDelEvAndRefresh === 'function') window.delEvAndRefresh = wrapMutation('سڕینەوەی مامەڵە', originalDelEvAndRefresh);
  if (typeof originalDoExport === 'function') window.doExport = function () {
    const result = originalDoExport.apply(this, arguments);
    DB.set('manualBackupAt', new Date().toISOString());
    renderSettingsEnhancements();
    return result;
  };
  if (typeof originalDoImport === 'function') window.doImport = function () {
    const result = originalDoImport.apply(this, arguments);
    if (result && typeof result.finally === 'function') return result.finally(() => renderSettingsEnhancements());
    setTimeout(renderSettingsEnhancements, 0);
    return result;
  };
  if (typeof originalRenderProducts === 'function') window.renderProducts = function () { const result = originalRenderProducts.apply(this, arguments); setTimeout(enhanceRenderedViews, 0); return result; };
  if (typeof originalRenderCustomers === 'function') window.renderCustomers = function () { const result = originalRenderCustomers.apply(this, arguments); setTimeout(enhanceRenderedViews, 0); return result; };
  if (typeof originalRenderExpenses === 'function') window.renderExpenses = function () { const result = originalRenderExpenses.apply(this, arguments); setTimeout(enhanceRenderedViews, 0); return result; };
  if (typeof originalSwitchProdTab === 'function') window.switchProdTab = function () { const result = originalSwitchProdTab.apply(this, arguments); setTimeout(enhanceRenderedViews, 0); return result; };
  if (typeof originalRefreshProdCard === 'function') window.refreshProdCard = function () { const result = originalRefreshProdCard.apply(this, arguments); setTimeout(enhanceRenderedViews, 0); return result; };

  initAppShell();
  setTimeout(enhanceRenderedViews, 0);
})();


