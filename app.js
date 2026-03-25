// ============================================================
// app.js — لۆجیکی UI و تێکراکردنی بەکارهێنەر
// ============================================================

const PAGE_TITLES = {
  dashboard:  '📊 داشبۆرد',
  products:   '📦 کاڵاکان',
  addProduct: '➕ کاڵای نوێ',
  profits:    '📈 قازانج و زەرەر',
  currencies: '💱 دراوەکان',
  suppliers:  '🏪 فرۆشیارەکان',
  settings:   '⚙️ ڕێکخستن',
  customers:  '👥 کڕیارەکان',
};

let currentRange    = 'month';
let currentRangeFrom = '', currentRangeTo = '';
let searchTimeout   = null;

// ===== HELPERS =====
function el(id)  { return document.getElementById(id); }
function v(id)   { return (el(id)||{}).value || ''; }
function fv(id)  { return parseFloat(v(id)) || 0; }

function showA(cid, type, msg) {
  const e = el(cid); if (!e) return;
  e.innerHTML = `<div class="alert al-${type}">${msg}</div>`;
  if (type !== 'bad') setTimeout(() => { e.innerHTML = ''; }, 4000);
}

function getDueBadgeClass(dueDate) {
  if (!dueDate) return 'b-gray';
  const diff = Math.round((new Date(dueDate) - new Date(today())) / 86400000);
  if (diff < 0)  return 'b-bad';
  if (diff <= 7) return 'b-warn';
  return 'b-info';
}
function formatDueDate(dueDate) {
  if (!dueDate) return '';
  const diff = Math.round((new Date(dueDate) - new Date(today())) / 86400000);
  if (diff < 0)  return `تێپەڕیوە (${Math.abs(diff)} ڕۆژ)`;
  if (diff === 0) return 'ئەمڕۆ!';
  if (diff <= 7)  return `${diff} ڕۆژ`;
  return dueDate;
}


function openSidebar() {
  document.querySelector('.sidebar').classList.add('mobile-open');
  document.querySelector('.sidebar-overlay').classList.add('show');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('mobile-open');
  document.querySelector('.sidebar-overlay').classList.remove('show');
}

// ===== NAVIGATION =====
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-i').forEach(n => n.classList.remove('active'));
  const pg = el('pg-' + name); if (pg) pg.classList.add('active');
  const pt = el('pageTitle'); if (pt) pt.textContent = PAGE_TITLES[name] || name;
  document.querySelectorAll('.nav-i').forEach(n => {
    if ((n.getAttribute('onclick') || '').includes("'" + name + "'")) n.classList.add('active');
  });
  closeSidebar();
  const fns = {
    dashboard: renderDash, products: renderProducts,
    addProduct: renderAddProduct, profits: renderProfits,
    currencies: renderCurrencies, suppliers: renderSuppliers,
    settings: renderSettings, customers: renderCustomers,
  };
  if (fns[name]) fns[name]();
}

// ===== FILL SELECTS =====
function fillCurrencySelects() {
  const currs = getCurrencies();
  document.querySelectorAll('.curr-select').forEach(e => {
    const cur = e.value;
    e.innerHTML = currs.map(c => `<option value="${c.code}">${c.flag} ${c.code}</option>`).join('');
    if (cur) e.value = cur;
  });
}
function fillSupplierSelect() {
  const e = el('apSupplier'); if (!e) return;
  const cur = e.value;
  e.innerHTML = `<option value="">— بەبێ فرۆشیار —</option>`
    + getSuppliers().map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  if (cur) e.value = cur;
}

// ===== LOW STOCK WARNING =====
function renderLowStockBanner() {
  const low = getLowStockProducts(5);
  const b = el('lowStockBanner'); if (!b) return;
  if (!low.length) { b.innerHTML = ''; return; }
  b.innerHTML = `<div class="stock-alert" onclick="showPage('products')">
    ⚠️ ${low.length} کاڵا ستۆکی کەمیان هەیە: ${low.map(p => `<strong>${p.name}</strong> (${p.qty} ${p.unit})`).join('، ')}
  </div>`;
}

// ===== DEBT DUE BANNER =====
function renderDebtDueBanner() {
  const b = el('debtDueBanner'); if (!b) return;
  const alerts = getDebtDueAlerts();
  if (!alerts.length) { b.innerHTML = ''; return; }

  const overdues = alerts.filter(a => a.status === 'overdue');
  const soons    = alerts.filter(a => a.status === 'soon');

  let html = '';
  if (overdues.length) {
    html += `<div class="debt-due-banner overdue" onclick="showPage('products')">
      <span class="ddb-icon">🚨</span>
      <div class="ddb-body">
        <div class="ddb-title">${overdues.length} قەرزار بەرواری دابینی تێپەڕیوە!</div>
        <div class="ddb-names">${overdues.map(a =>
          `<span class="ddb-name">${a.name} · ${fmtC(fromUSD(a.owedUSD,'IQD'),'IQD')}</span>`
        ).join('')}</div>
      </div>
    </div>`;
  }
  if (soons.length) {
    html += `<div class="debt-due-banner soon" onclick="showPage('products')">
      <span class="ddb-icon">⏰</span>
      <div class="ddb-body">
        <div class="ddb-title">${soons.length} قەرزار بەرواری کۆتاییان نزیکە (ناو ٧ ڕۆژ)</div>
        <div class="ddb-names">${soons.map(a =>
          `<span class="ddb-name">${a.name} · ${a.diffDays === 0 ? 'ئەمڕۆ!' : a.diffDays + ' ڕۆژ'}</span>`
        ).join('')}</div>
      </div>
    </div>`;
  }
  b.innerHTML = html;
}


function renderDash() {
  renderLowStockBanner();
  renderDebtDueBanner();
  const prods = getProducts();
  const g  = getGlobalStats();
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  const mp = getProfitByRange(`${y}-${m}-01`, `${y}-${m}-31`);

  el('dashStats').innerHTML = `
    <div class="scard info"><div class="si">📦</div><div class="sv" style="color:var(--info)">${prods.length}</div><div class="sl">کۆی کاڵاکان</div></div>
    <div class="scard ok">  <div class="si">💰</div><div class="sv tok">${fmtC(g.totalRevenueUSD,'USD')}</div><div class="sl">کۆی فرۆشتن</div><div class="sd">${fmtC(fromUSD(g.totalRevenueUSD,'IQD'),'IQD')}</div></div>
    <div class="scard bad"> <div class="si">🛒</div><div class="sv tbad">${fmtC(g.totalCostUSD,'USD')}</div><div class="sl">کۆی خەرجی</div><div class="sd">${fmtC(fromUSD(g.totalCostUSD,'IQD'),'IQD')}</div></div>
    <div class="scard bad"> <div class="si">💳</div><div class="sv tbad">${fmtC(g.debtRemainUSD,'USD')}</div><div class="sl">قەرزی مانەوە</div><div class="sd">${fmtC(fromUSD(g.debtRemainUSD,'IQD'),'IQD')}</div></div>
    <div class="scard ${g.profitUSD >= 0 ? 'ok' : 'bad'}">
      <div class="si">${g.profitUSD >= 0 ? '📈' : '📉'}</div>
      <div class="sv ${g.profitUSD >= 0 ? 'tok' : 'tbad'}">${fmtC(g.profitUSD,'USD')}</div>
      <div class="sl">کۆی قازانج</div>
      <div class="sd">${fmtC(fromUSD(g.profitUSD,'IQD'),'IQD')}</div>
    </div>`;

  el('dashMonthProfit').innerHTML = `
    <div class="sum-box">
      <div class="sum-row"><span class="lbl">📅 فرۆشتنی ئەم مانگە</span><span class="val tok">${fmtC(mp.revenueUSD,'USD')}<span class="sd-inline">${fmtC(fromUSD(mp.revenueUSD,'IQD'),'IQD')}</span></span></div>
      <div class="sum-row"><span class="lbl">خەرجی</span><span class="val tbad">${fmtC(mp.costUSD,'USD')}<span class="sd-inline">${fmtC(fromUSD(mp.costUSD,'IQD'),'IQD')}</span></span></div>
      <div class="sum-total"><span>${mp.profitUSD >= 0 ? 'قازانج' : 'زەرەر'}</span>
        <span class="${mp.profitUSD >= 0 ? 'tok' : 'tbad'}">${fmtC(mp.profitUSD,'USD')}<span class="sd-inline">${fmtC(fromUSD(mp.profitUSD,'IQD'),'IQD')}</span></span>
      </div>
    </div>`;

  // قەرزارەکان — لە ئیڤێنتەکانی sell_debt کۆ بکەینەوە
  const allEvs = getAllEvents();
  const debtorMap = {};
  allEvs.forEach(ev => {
    if (ev.type === 'sell_debt') {
      const key = (ev.buyer||'نەناسراو') + '||' + (ev.phone||'');
      if (!debtorMap[key]) debtorMap[key] = { name: ev.buyer||'نەناسراو', phone: ev.phone||'', totalUSD: 0, products: new Set() };
      debtorMap[key].totalUSD += toUSD(ev.totalPrice, ev.currency);
      const prod = getProduct(ev.productId);
      if (prod) debtorMap[key].products.add(prod.name);
    }
    if (ev.type === 'debt_pay') {
      const key = (ev.buyer||'نەناسراو') + '||' + (ev.phone||'');
      if (debtorMap[key]) debtorMap[key].totalUSD -= toUSD(ev.amount, ev.currency);
    }
  });
  const debtors = Object.values(debtorMap).filter(d => d.totalUSD > 0.001);

  el('dashDebt').innerHTML = debtors.length
    ? debtors.sort((a,b)=>b.totalUSD-a.totalUSD).map(d => {
        const link = getDebtorLink(d.name, d.phone);
        const waMsg = encodeURIComponent(`سڵاو ${d.name} 👋\nقەرزەکەت: ${fmtC(fromUSD(d.totalUSD,'IQD'),'IQD')}\nبینینی مامەڵەکانت:\n${link}`);
        const waLink = d.phone ? `https://wa.me/${d.phone.replace(/\D/g,'')}?text=${waMsg}` : '';
        return `
        <div style="padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div>
              <div style="font-size:13px;font-weight:600">${d.name}</div>
              <div style="font-size:11px;color:var(--muted)">
                ${d.phone ? `📞 <a href="tel:${d.phone}" style="color:var(--primary);text-decoration:none">${d.phone}</a> · ` : ''}
                ${[...d.products].join('، ')}
              </div>
            </div>
            <span class="tbad fw8" style="font-size:13px">${fmtC(d.totalUSD,'USD')}<span class="sd-inline">${fmtC(fromUSD(d.totalUSD,'IQD'),'IQD')}</span></span>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <button class="btn btn-xs btn-g" onclick="copyLink('${link}')">🔗 لینک</button>
            ${waLink?`<a href="${waLink}" target="_blank" class="btn btn-xs" style="background:#25d366;color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:4px">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              واتساپ
            </a>`:''}
          </div>
        </div>`;
      }).join('')
    : `<div class="empty"><span class="ei">✅</span>هیچ قەرزێک نییە</div>`;

  const top = prods.map(p => ({ ...p, ...getProductStats(p.id) })).sort((a, b) => b.profitUSD - a.profitUSD).slice(0, 6);
  el('dashTopProds').innerHTML = top.length
    ? top.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
        <div><strong style="font-size:13px">${p.name}</strong> <span class="badge b-gray">${p.qty} ${p.unit}</span></div>
        <span class="badge ${p.profitUSD >= 0 ? 'b-ok' : 'b-bad'}">${fmtC(p.profitUSD,'USD')}</span><span class="sd-inline" style="font-size:10px;color:var(--muted);margin-right:4px">${fmtC(fromUSD(p.profitUSD,'IQD'),'IQD')}</span>
      </div>`).join('')
    : `<div class="empty"><span class="ei">📦</span>هیچ کاڵایەک نییە</div>`;

  // چارتەکان دوای render
  setTimeout(() => renderCharts(), 50);
}

// ===== CHARTS =====
let chartProfit = null, chartCost = null, chartTopProds = null;
let chartMonthRange = 6;

function setChartRange(n, btn) {
  chartMonthRange = n;
  document.querySelectorAll('#chartRangeBtns .range-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCharts();
}

function renderCharts() {
  renderChartProfit();
  renderChartCost();
  renderChartTopProds();
}

// ---- ١: قازانجی مانگانە ----
function renderChartProfit() {
  const canvas = document.getElementById('chartProfit'); if (!canvas) return;
  const months = [], revenues = [], costs = [], profits = [];
  const now = new Date();
  for (let i = chartMonthRange - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
    const from = `${y}-${m}-01`;
    const to   = `${y}-${m}-31`;
    const stat = getProfitByRange(from, to);
    months.push(MONTH_NAMES_KU[d.getMonth()]);
    revenues.push(parseFloat(fromUSD(stat.revenueUSD, 'IQD').toFixed(0)));
    costs.push(parseFloat(fromUSD(stat.costUSD, 'IQD').toFixed(0)));
    profits.push(parseFloat(fromUSD(stat.profitUSD, 'IQD').toFixed(0)));
  }
  if (chartProfit) chartProfit.destroy();
  chartProfit = new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: 'فرۆشتن', data: revenues, borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.1)', tension: 0.4, fill: true, pointBackgroundColor: '#34d399', pointRadius: 4 },
        { label: 'خەرجی',  data: costs,    borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.08)', tension: 0.4, fill: true, pointBackgroundColor: '#f87171', pointRadius: 4 },
        { label: 'قازانج', data: profits,  borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,.08)', tension: 0.4, fill: false, pointBackgroundColor: '#4f8ef7', pointRadius: 4, borderWidth: 2.5 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8896b3', font: { family: 'Noto Sans Arabic', size: 11 }, boxWidth: 12, padding: 10 } } },
      scales: {
        x: { ticks: { color: '#8896b3', font: { family: 'Noto Sans Arabic', size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: { ticks: { color: '#8896b3', font: { family: 'Noto Sans Arabic', size: 10 }, callback: v => fmtShort(v) }, grid: { color: 'rgba(255,255,255,.06)' } }
      }
    }
  });
}

// ---- ٢: دابەشکردنی خەرجی (Doughnut) ----
function renderChartCost() {
  const canvas = document.getElementById('chartCost'); if (!canvas) return;
  const prods = getProducts();
  let loadCost = 0, shipCost = 0, taxCost = 0;
  prods.forEach(p => {
    const s = getProductStats(p.id);
    loadCost += s.loadCostUSD;
    shipCost += s.shippingUSD;
    taxCost  += s.taxUSD;
  });
  const total = loadCost + shipCost + taxCost;
  if (!total) { canvas.style.display = 'none'; return; }
  canvas.style.display = '';

  if (chartCost) chartCost.destroy();
  chartCost = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['کڕین', 'کرێی بار', 'باج'],
      datasets: [{ data: [fromUSD(loadCost,'IQD'), fromUSD(shipCost,'IQD'), fromUSD(taxCost,'IQD')],
        backgroundColor: ['#f87171','#fbbf24','#60a5fa'],
        borderColor: '#1a2030', borderWidth: 3, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtC(ctx.raw,'IQD')} (${((ctx.raw/fromUSD(total,'IQD'))*100).toFixed(1)}%)` },
          bodyFont: { family: 'Noto Sans Arabic' } }
      }
    }
  });

  const legend = document.getElementById('chartCostLegend');
  if (legend) {
    const colors = ['#f87171','#fbbf24','#60a5fa'];
    const labels = ['کڕین','کرێی بار','باج'];
    const vals = [loadCost, shipCost, taxCost];
    legend.innerHTML = `<div style="display:flex;justify-content:center;gap:14px;flex-wrap:wrap">
      ${labels.map((l,i) => `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)">
        <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};display:inline-block;flex-shrink:0"></span>
        ${l}: <strong style="color:var(--text)">${((fromUSD(vals[i],'IQD')/fromUSD(total,'IQD'))*100).toFixed(0)}%</strong>
      </div>`).join('')}
    </div>`;
  }
}

// ---- ٣: باشترین کاڵاکان (Bar) ----
function renderChartTopProds() {
  const canvas = document.getElementById('chartTopProds'); if (!canvas) return;
  const prods = getProducts();
  if (!prods.length) { canvas.style.display='none'; return; }
  canvas.style.display = '';

  const sorted = prods.map(p => ({ ...p, ...getProductStats(p.id) }))
    .sort((a,b) => b.profitUSD - a.profitUSD).slice(0, 8);

  if (chartTopProds) chartTopProds.destroy();
  chartTopProds = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(p => p.name.length > 12 ? p.name.slice(0,12)+'…' : p.name),
      datasets: [{
        label: 'قازانج (IQD)',
        data: sorted.map(p => parseFloat(fromUSD(p.profitUSD,'IQD').toFixed(0))),
        backgroundColor: sorted.map(p => p.profitUSD >= 0 ? 'rgba(52,211,153,.75)' : 'rgba(248,113,113,.75)'),
        borderColor:     sorted.map(p => p.profitUSD >= 0 ? '#34d399' : '#f87171'),
        borderWidth: 1.5, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'x',
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmtC(ctx.raw,'IQD')}` }, bodyFont: { family:'Noto Sans Arabic' } }
      },
      scales: {
        x: { ticks: { color:'#8896b3', font:{ family:'Noto Sans Arabic', size:11 } }, grid:{ color:'rgba(255,255,255,.04)' } },
        y: { ticks: { color:'#8896b3', font:{ family:'Noto Sans Arabic', size:10 }, callback: v => fmtShort(v) }, grid:{ color:'rgba(255,255,255,.06)' } }
      }
    }
  });
}

function fmtShort(n) {
  const v = Math.abs(n);
  if (v >= 1e9) return (n/1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (n/1e3).toFixed(0) + 'K';
  return String(n);
}

const MONTH_NAMES_KU = ['کانوونی دووەم','شوبات','ئازار','نیسان','ئایار','حوزەیران','تەممووز','ئاب','ئەیلوول','تشرینی یەکەم','تشرینی دووەم','کانوونی یەکەم'];


function renderAddProduct() {
  fillCurrencySelects();
  fillSupplierSelect();
  const apDate = el('apDate'); if (apDate && !apDate.value) apDate.value = today();
  const apBuyCurrency = el('apBuyCurrency'); if (apBuyCurrency && !apBuyCurrency.value) apBuyCurrency.value = 'IQD';
}

function apCalc() {
  const totalPrice = fv('apBuyPrice'), curr = v('apBuyCurrency');
  if (!totalPrice || !curr) { el('apPreview').innerHTML = ''; return; }
  const totalUSD = toUSD(totalPrice, curr);
  el('apPreview').innerHTML = `
    <div class="sum-box" style="padding:12px">
      <div class="sum-row"><span class="lbl">کۆی نرخی کڕین</span><span class="val">${fmtC(totalPrice,curr)}</span></div>
      <div class="sum-row"><span class="lbl">بەرامبەر USD</span><span class="val">$${fmtN(totalUSD,2)}</span></div>
      <div class="sum-row"><span class="lbl">بەرامبەر IQD</span><span class="val">${fmtC(fromUSD(totalUSD,'IQD'),'IQD')}</span></div>
    </div>`;
}

function doAddProduct() {
  const name = v('apName').trim();
  if (!name) return showA('addProdAlert', 'bad', 'ناوی کاڵا داخڵ بکە');
  const qty = fv('apQty');
  if (qty <= 0) return showA('addProdAlert', 'bad', 'بڕ داخڵ بکە');
  const totalPrice = fv('apBuyPrice');
  const prod = addProduct({
    name, qty, unit: v('apUnit') || 'دانە',
    buyPrice: totalPrice, buyCurrency: v('apBuyCurrency') || 'IQD',
    supplier: v('apSupplier'), buyDate: v('apDate') || today(), note: v('apNote'),
  });
  if (totalPrice > 0) {
    addEvent({
      productId: prod.id, type: 'load',
      qty, totalPrice, unitPrice: qty > 0 ? totalPrice / qty : 0,
      currency: v('apBuyCurrency') || 'IQD',
      supplier: v('apSupplier'), date: v('apDate') || today(), note: v('apNote'),
    });
  }
  ['apName','apQty','apBuyPrice','apNote'].forEach(id => { const e = el(id); if (e) e.value = ''; });
  el('apPreview').innerHTML = '';
  showA('addProdAlert', 'ok', '✅ کاڵا زیادکرا!');
  setTimeout(() => showPage('products'), 1000);
}

// ===== PRODUCTS LIST =====
let currentSearch = '';

function renderProducts() {
  // badge لە sidebar
  const total = getProducts().length;
  const badge = el('sbProdBadge');
  if (badge) badge.textContent = total || '';

  // فلتەری فرۆشیار پڕ بکە
  const fs = el('filterSupplier');
  if (fs) {
    const cur = fs.value;
    const supps = [...new Set(getProducts().map(p=>p.supplier).filter(Boolean))];
    fs.innerHTML = `<option value="">🏪 هەموو فرۆشیار</option>` +
      supps.map(s=>`<option value="${s}">${s}</option>`).join('');
    if (cur) fs.value = cur;
  }

  applyFilters();
}

function applyFilters() {
  let prods = getProducts();
  const term    = currentSearch.toLowerCase().trim();
  const supp    = (el('filterSupplier')?.value)||'';
  const sort    = (el('filterSort')?.value)||'date_desc';

  if (term) prods = prods.filter(p => p.name.toLowerCase().includes(term) || (p.supplier||'').toLowerCase().includes(term));
  if (supp) prods = prods.filter(p => p.supplier === supp);

  if (sort === 'name_asc')     prods.sort((a,b)=>a.name.localeCompare(b.name));
  else if (sort === 'profit_desc') prods.sort((a,b)=>getProductStats(b.id).profitUSD - getProductStats(a.id).profitUSD);
  else if (sort === 'qty_asc') prods.sort((a,b)=>parseFloat(a.qty)-parseFloat(b.qty));
  else prods.sort((a,b)=>(b.createdAt||'')>(a.createdAt||'')?1:-1);

  const fc = el('filterCount');
  if (fc) fc.textContent = prods.length !== getProducts().length ? `${prods.length} / ${getProducts().length} کاڵا` : `${prods.length} کاڵا`;

  renderProductsList(prods);
}

function searchProducts(q) {
  currentSearch = q;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => applyFilters(), 200);
}

function renderProductsList(prods) {
  if (!prods.length) {
    el('prodsList').innerHTML = `<div class="empty"><span class="ei">📦</span>هیچ کاڵایەک نەدۆزرایەوە<br>
      <button class="btn btn-p mt8" onclick="showPage('addProduct')">➕ کاڵای نوێ</button></div>`;
    return;
  }
  el('prodsList').innerHTML = prods.map(p => renderProdCard(p)).join('');
}


function renderProdCard(p) {
  const s = getProductStats(p.id);
  const hasDebt = s.debtRemainUSD > 0.001;
  return `<div class="prod-card" id="pcard-${p.id}">
    <div class="pc-head" onclick="toggleProd(${p.id})">
      <div class="pc-head-info">
        <div class="pc-icon">📦</div>
        <div>
          <div class="pc-name">${p.name}</div>
          <div class="pc-meta">${fmtN(p.qty,2)} ${p.unit} · ${p.supplier || 'بێ فرۆشیار'}</div>
        </div>
      </div>
      <div class="pc-stats">
        <div class="pc-stat">
          <div class="v tok">${fmtC(s.totalRevenueUSD,'USD')}</div>
          <div class="l">فرۆشتن</div>
        </div>
        <div class="pc-stat">
          <div class="v tbad">${fmtC(s.totalCostUSD,'USD')}</div>
          <div class="l">خەرجی</div>
        </div>
        <div class="pc-stat">
          <div class="v ${s.profitUSD >= 0 ? 'tok' : 'tbad'}">${fmtC(s.profitUSD,'USD')}</div>
          <div class="l">${s.profitUSD >= 0 ? 'قازانج' : 'زەرەر'}</div>
          <div style="font-size:9px;color:var(--faint)">${fmtC(fromUSD(s.profitUSD,'IQD'),'IQD')}</div>
        </div>
        ${hasDebt ? `<div class="pc-stat">
          <div class="v twarn">${fmtC(s.debtRemainUSD,'USD')}</div>
          <div class="l">قەرز</div>
        </div>` : ''}
        <button class="btn btn-bad btn-xs" onclick="event.stopPropagation();delProd(${p.id})">🗑️</button>
      </div>
    </div>
    <div class="pc-body" id="pc-body-${p.id}">
      <div class="pc-tabs">
        <div class="pc-tab active" data-tab="summary" onclick="switchProdTab(${p.id},'summary',this)">📊 سەرەکی</div>
        <div class="pc-tab" data-tab="load"    onclick="switchProdTab(${p.id},'load',this)">📥 بار</div>
        <div class="pc-tab" data-tab="costs"   onclick="switchProdTab(${p.id},'costs',this)">🚚 خەرجی</div>
        <div class="pc-tab" data-tab="sell"    onclick="switchProdTab(${p.id},'sell',this)">💰 فرۆشتن</div>
        <div class="pc-tab" data-tab="debt"    onclick="switchProdTab(${p.id},'debt',this)">💳 قەرز</div>
        <div class="pc-tab" data-tab="history" onclick="switchProdTab(${p.id},'history',this)">📋 مێژوو</div>
        <div class="pc-tab" data-tab="print"   onclick="switchProdTab(${p.id},'print',this)">🖨️ پرینت</div>
      </div>
      <div class="pc-content" id="pc-content-${p.id}">
        ${renderProdSummary(p.id, s)}
      </div>
    </div>
  </div>`;
}

function toggleProd(id) {
  const body = el('pc-body-' + id); if (!body) return;
  // تابی ئەکتیڤی ئێستا بەیاددبگرە پێش داخستن
  const activeTab = body.querySelector('.pc-tab.active');
  const activeTabName = activeTab?.getAttribute('data-tab') || 'summary';

  body.classList.toggle('open');

  if (body.classList.contains('open')) {
    const s = getProductStats(id);
    const p = getProduct(id);
    const content = el('pc-content-' + id);
    const map = { summary: renderProdSummary, load: renderProdLoad, costs: renderProdCosts, sell: renderProdSell, debt: renderProdDebt, history: renderProdHistory, print: renderProdPrint };
    // تابی دوایین کراوە دووبارە نیشان بدە
    content.innerHTML = (map[activeTabName] || renderProdSummary)(id, p, s);
    // تابی دروست active بکە
    setTimeout(() => {
      const tabs = body.querySelectorAll('.pc-tab');
      tabs.forEach(t => t.classList.remove('active'));
      const targetTab = body.querySelector(`.pc-tab[data-tab="${activeTabName}"]`);
      if (targetTab) targetTab.classList.add('active');
      else if (tabs[0]) tabs[0].classList.add('active');
    }, 0);
  }
}

function switchProdTab(id, tab, btn) {
  const card = el('pcard-' + id); if (!card) return;
  card.querySelectorAll('.pc-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const s = getProductStats(id);
  const p = getProduct(id);
  const content = el('pc-content-' + id);
  const map = { summary: renderProdSummary, load: renderProdLoad, costs: renderProdCosts, sell: renderProdSell, debt: renderProdDebt, history: renderProdHistory, print: renderProdPrint };
  if (map[tab]) content.innerHTML = map[tab](id, p, s);
}

// ---- SUMMARY ----
function renderProdSummary(id, p, s) {
  if (!s) { s = p; p = null; } // پشتیوانی بۆ کێشەی کۆن (id, s)
  const pct = s.totalCostUSD > 0 ? Math.min(100, Math.max(0, (s.totalRevenueUSD / s.totalCostUSD) * 100)) : 0;
  const f = (usd) => `<span class="val-usd">${fmtC(usd,'USD')}</span><span class="val-iqd">${fmtC(fromUSD(usd,'IQD'),'IQD')}</span>`;
  const debtRemainUSD = s.debtRemainUSD;
  return `
    <div class="grid-2">
      <div class="sum-box">
        <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:10px;letter-spacing:.5px">💰 سەرەکی ئابووری</div>
        <div class="sum-row"><span class="lbl">🛒 خەرجی کڕین</span><span>${f(s.loadCostUSD)}</span></div>
        <div class="sum-row"><span class="lbl">🚚 کرێی بار</span><span>${f(s.shippingUSD)}</span></div>
        <div class="sum-row"><span class="lbl">🏛️ باج</span><span>${f(s.taxUSD)}</span></div>
        <div class="sum-row"><span class="lbl fw8">کۆی خەرجی</span><span class="tbad fw8">${f(s.totalCostUSD)}</span></div>
        <div class="divider"></div>
        <div class="sum-row"><span class="lbl">💵 نەقد</span><span class="tok">${f(s.cashRevenueUSD)}</span></div>
        <div class="sum-row"><span class="lbl">📝 قەرز</span><span class="twarn">${f(s.debtRevenueUSD)}</span></div>
        <div class="sum-row"><span class="lbl fw8">کۆی داهات</span><span class="tok fw8">${f(s.totalRevenueUSD)}</span></div>
        <div class="sum-total"><span>${s.profitUSD >= 0 ? '📈 قازانج' : '📉 زەرەر'}</span>
          <span class="${s.profitUSD >= 0 ? 'tok' : 'tbad'} fw8">${f(s.profitUSD)}</span>
        </div>
      </div>
      <div>
        <div class="sum-box" style="margin-bottom:12px">
          <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:10px;letter-spacing:.5px">📦 زانیاری ستۆک</div>
          <div class="sum-row"><span class="lbl">بارکراو</span><span class="val">${fmtN(s.totalLoadedQty,2)}</span></div>
          <div class="sum-row"><span class="lbl">فرۆشتراو</span><span class="val">${fmtN(s.totalSoldQty,2)}</span></div>
          <div class="sum-row"><span class="lbl fw8">مانەوە</span><span class="val fw8">${fmtN(s.stockQty,2)}</span></div>
        </div>
        ${debtRemainUSD > 0
          ? `<div class="sum-box" style="border-color:rgba(248,113,113,.3);background:var(--bad-bg)">
              <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:8px">💳 قەرز</div>
              <div class="sum-row"><span class="lbl">کۆی قەرز</span><span class="tbad">${f(s.debtRevenueUSD)}</span></div>
              <div class="sum-row"><span class="lbl">داواوەکرا</span><span class="tok">${f(s.debtPaidUSD)}</span></div>
              <div class="sum-total"><span>مانەوە</span><span class="tbad">${f(debtRemainUSD)}</span></div>
            </div>`
          : `<div class="sum-box" style="border-color:rgba(52,211,153,.3);background:var(--ok-bg)"><div style="text-align:center;color:var(--ok);font-weight:700;padding:8px">✅ هیچ قەرزێک نییە</div></div>`
        }
      </div>
    </div>
    <div style="margin-top:12px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:5px;font-weight:600">ڕێژەی بازگەڕانەوە</div>
      <div class="profit-bar"><div class="profit-bar-fill" style="width:${pct}%;background:${s.profitUSD >= 0 ? 'var(--ok)' : 'var(--bad)'}"></div></div>
      <div style="font-size:10px;color:var(--muted);margin-top:3px">${fmtN(pct,1)}% لە خەرجی بەرجاو</div>
    </div>`;
}

// ---- LOAD TAB ----
function renderProdLoad(id, p, s) {
  const loads = s.events.filter(e => e.type === 'load');
  return `
    <div class="ev-form">
      <div class="ev-form-title">📥 زیادکردنی بار</div>
      <div class="fg2">
        <div class="fg"><label>بڕ</label><input id="ev-qty-${id}" type="number" step="0.001" placeholder="0" min="0" oninput="evCalcLoad(${id})"></div>
        <div class="fg"><label>کۆی نرخی کڕین</label><input id="ev-uprice-${id}" type="number" step="0.01" placeholder="0.00" oninput="evCalcLoad(${id})"></div>
        <div class="fg"><label>دراو</label><select id="ev-curr-${id}" class="curr-select" onchange="evCalcLoad(${id});fillCurrencySelects()"></select></div>
        <div class="fg"><label>فرۆشیار</label><input id="ev-supp-${id}" placeholder="ناوی فرۆشیار..." value="${p.supplier||''}"></div>
        <div class="fg"><label>بەروار</label><input id="ev-date-${id}" type="date" value="${today()}"></div>
        <div class="fg"><label>تێبینی</label><input id="ev-note-${id}" placeholder="..."></div>
      </div>
      <div id="ev-preview-${id}" class="mt8"></div>
      <button class="btn btn-p btn-sm mt8" onclick="saveLoad(${id})">📥 بار تۆمارکردن</button>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">مێژووی بارکردن (${loads.length})</div>
    <div class="ev-list">${loads.length ? loads.slice().reverse().map(ev => `
      <div class="ev-item">
        <div class="ev-icon">📥</div>
        <div class="ev-info">
          <div class="ev-title">${fmtN(ev.qty,2)} ${p.unit} · ${ev.supplier||'بێ فرۆشیار'}</div>
          <div class="ev-meta">${ev.date} · نرخی یەکە: ${fmtC(ev.unitPrice,ev.currency)}</div>
        </div>
        <div class="ev-amount tok">${fmtC(ev.totalPrice,ev.currency)}</div>
        <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'load')">🗑️</button>
      </div>`).join('') : '<div class="empty">هیچ بارێک نییە</div>'}</div>`;
}

function evCalcLoad(id) {
  const qty = parseFloat(el('ev-qty-'+id)?.value)||0;
  const totalPrice = parseFloat(el('ev-uprice-'+id)?.value)||0;
  const curr = el('ev-curr-'+id)?.value||'IQD';
  if (!totalPrice) { el('ev-preview-'+id).innerHTML=''; return; }
  const usd = toUSD(totalPrice,curr);
  const unitPrice = qty > 0 ? totalPrice / qty : 0;
  el('ev-preview-'+id).innerHTML=`<div class="sum-box" style="padding:10px">
    <div class="sum-row"><span class="lbl">کۆی نرخ</span><span class="val">${fmtC(totalPrice,curr)}</span></div>
    ${qty>0?`<div class="sum-row"><span class="lbl">نرخی یەک دانە</span><span class="val">${fmtC(unitPrice,curr)}</span></div>`:''}
    <div class="sum-row"><span class="lbl">بەرامبەر IQD</span><span class="val">${fmtC(fromUSD(usd,'IQD'),'IQD')}</span></div>
  </div>`;
}

function saveLoad(id) {
  const qty = parseFloat(el('ev-qty-'+id)?.value)||0;
  const totalPrice = parseFloat(el('ev-uprice-'+id)?.value)||0;
  const curr = el('ev-curr-'+id)?.value||'IQD';
  if (qty<=0)        return alert('⚠️ بڕی کاڵا داخڵ بکە');
  if (totalPrice<=0) return alert('⚠️ نرخی کاڵا داخڵ بکە');
  addEvent({ productId:id, type:'load', qty, unitPrice: totalPrice/qty, totalPrice, currency:curr,
    supplier:el('ev-supp-'+id)?.value||'', date:el('ev-date-'+id)?.value||today(), note:el('ev-note-'+id)?.value||'' });
  updateProductQty(id, qty);
  refreshProdCard(id,'load');
}

// ---- COSTS TAB ----
function renderProdCosts(id, p, s) {
  const ships = s.events.filter(e=>e.type==='shipping');
  const taxes = s.events.filter(e=>e.type==='tax');
  const currOpts = getCurrencies().map(c=>`<option value="${c.code}">${c.flag} ${c.code}</option>`).join('');
  return `
    <div class="grid-2">
      <div>
        <div class="ev-form">
          <div class="ev-form-title">🚚 کرێی بار هەڵگر</div>
          <div class="fg2">
            <div class="fg"><label>بڕ</label><input id="ev-ship-${id}" type="number" step="0.01" placeholder="0.00"></div>
            <div class="fg"><label>دراو</label><select id="ev-shipcurr-${id}">${currOpts}</select></div>
            <div class="fg"><label>بەروار</label><input id="ev-shipdate-${id}" type="date" value="${today()}"></div>
            <div class="fg"><label>تێبینی</label><input id="ev-shipnote-${id}" placeholder="..."></div>
          </div>
          <button class="btn btn-p btn-sm" onclick="saveCost(${id},'shipping')">➕ زیادکردن</button>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">مێژووی کرێ (${ships.length})</div>
        <div class="ev-list">${ships.length ? ships.slice().reverse().map(ev=>`
          <div class="ev-item">
            <div class="ev-icon">🚚</div>
            <div class="ev-info"><div class="ev-title">کرێی بار</div><div class="ev-meta">${ev.date}${ev.note?' · '+ev.note:''}</div></div>
            <div class="ev-amount tbad">${fmtC(ev.amount,ev.currency)}</div>
            <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'costs')">🗑️</button>
          </div>`).join('') : '<div class="empty">هیچ کرێیەک نییە</div>'}</div>
      </div>
      <div>
        <div class="ev-form">
          <div class="ev-form-title">🏛️ باج</div>
          <div class="fg2">
            <div class="fg"><label>بڕی باج</label><input id="ev-tax-${id}" type="number" step="0.01" placeholder="0.00"></div>
            <div class="fg"><label>دراو</label><select id="ev-taxcurr-${id}">${currOpts}</select></div>
            <div class="fg"><label>بەروار</label><input id="ev-taxdate-${id}" type="date" value="${today()}"></div>
            <div class="fg"><label>جۆر</label><input id="ev-taxnote-${id}" placeholder="باجی هاوردە..."></div>
          </div>
          <button class="btn btn-p btn-sm" onclick="saveCost(${id},'tax')">➕ زیادکردن</button>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">مێژووی باج (${taxes.length})</div>
        <div class="ev-list">${taxes.length ? taxes.slice().reverse().map(ev=>`
          <div class="ev-item">
            <div class="ev-icon">🏛️</div>
            <div class="ev-info"><div class="ev-title">باج${ev.note?' — '+ev.note:''}</div><div class="ev-meta">${ev.date}</div></div>
            <div class="ev-amount tbad">${fmtC(ev.amount,ev.currency)}</div>
            <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'costs')">🗑️</button>
          </div>`).join('') : '<div class="empty">هیچ باجێک نییە</div>'}</div>
      </div>
    </div>`;
}

function saveCost(id, type) {
  const isShip = (type === 'shipping');
  const amt  = parseFloat(el((isShip?'ev-ship-':'ev-tax-')+id)?.value)||0;
  const curr = el((isShip?'ev-shipcurr-':'ev-taxcurr-')+id)?.value||'IQD';
  const date = el((isShip?'ev-shipdate-':'ev-taxdate-')+id)?.value||today();
  const note = el((isShip?'ev-shipnote-':'ev-taxnote-')+id)?.value||'';
  if (amt<=0) return alert('⚠️ بڕی پارە داخڵ بکە');
  addEvent({ productId:id, type, amount:amt, currency:curr, date, note });
  refreshProdCard(id,'costs');
}

// ---- SELL TAB ----
function renderProdSell(id, p, s) {
  const sells = s.events.filter(e=>e.type==='sell_cash'||e.type==='sell_debt');
  const currOpts = getCurrencies().map(c=>`<option value="${c.code}">${c.flag} ${c.code}</option>`).join('');

  // نرخی پێشنیارکراو — نرخی تەواوی یەکە + %١٠ بە IQD
  const costPerUnitUSD = s.totalLoadedQty > 0 ? s.totalCostUSD / s.totalLoadedQty : 0;
  const suggestIQD = costPerUnitUSD > 0 ? fromUSD(costPerUnitUSD * 1.1, 'IQD') : 0;
  const suggestHint = costPerUnitUSD > 0
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-size:11px;color:var(--muted)">نرخی پێشنیارکراو:</span>
        ${[1.05,1.1,1.15,1.2].map(m=>{
          const p2 = fromUSD(costPerUnitUSD*m,'IQD');
          return `<button type="button" class="btn btn-xs btn-g" onclick="setSuggestedPrice(${id},${p2.toFixed(0)})" title="+${Math.round((m-1)*100)}%">
            ${fmtC(p2,'IQD')} <span style="color:var(--ok);font-size:9px">+${Math.round((m-1)*100)}%</span>
          </button>`;
        }).join('')}
      </div>` : '';

  return `
    <div class="ev-form">
      <div class="ev-form-title">💰 فرۆشتن</div>
      ${suggestHint}
      <div class="fg2">
        <div class="fg"><label>بڕ</label><input id="ev-sqty-${id}" type="number" step="0.001" placeholder="0" oninput="evCalcSell(${id})"></div>
        <div class="fg"><label>نرخی یەکە</label><input id="ev-sprice-${id}" type="number" step="0.01" placeholder="0.00" oninput="evCalcSell(${id})"></div>
        <div class="fg"><label>دراو</label><select id="ev-scurr-${id}" onchange="evCalcSell(${id})">${currOpts}</select></div>
        <div class="fg"><label>جۆری پارەدان</label>
          <select id="ev-spay-${id}" onchange="toggleDueDateField(${id},this.value)">
            <option value="sell_cash">💵 نەقد</option>
            <option value="sell_debt">📝 قەرز</option>
          </select>
        </div>
        <div class="fg"><label>ناوی کڕیار</label><input id="ev-sbuyer-${id}" placeholder="ناوی کڕیار..."></div>
        <div class="fg"><label>ژمارە تەلەفون</label><input id="ev-sphone-${id}" placeholder="07XXXXXXXXX" type="tel" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9+]/g,'')"></div>
        <div class="fg"><label>بەروار</label><input id="ev-sdate-${id}" type="date" value="${today()}"></div>
        <div class="fg" id="ev-duedate-wrap-${id}" style="display:none">
          <label style="color:var(--warn)">⏰ بەرواری کۆتایی قەرز</label>
          <input id="ev-sduedate-${id}" type="date">
        </div>
        <div class="fg c2"><label>تێبینی</label><input id="ev-snote-${id}" placeholder="..."></div>
      </div>
      <div id="ev-sellpreview-${id}" class="mt8"></div>
      <button class="btn btn-ok btn-sm mt8" onclick="saveSell(${id})">💰 فرۆشتن تۆمارکردن</button>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">مێژووی فرۆشتن (${sells.length})</div>
    <div class="ev-list">${sells.length ? sells.slice().reverse().map(ev=>`
      <div class="ev-item">
        <div class="ev-icon">${ev.type==='sell_cash'?'💵':'📝'}</div>
        <div class="ev-info">
          <div class="ev-title">${fmtN(ev.qty,3)} ${p.unit} · ${ev.buyer||'—'}${ev.phone?' · 📞'+ev.phone:''}</div>
          <div class="ev-meta">${ev.date} · نرخ: ${fmtC(ev.unitPrice,ev.currency)} · <span class="badge ${ev.type==='sell_cash'?'b-ok':'b-warn'}">${ev.type==='sell_cash'?'نەقد':'قەرز'}</span>${ev.dueDate ? ' · <span class="badge ' + getDueBadgeClass(ev.dueDate) + '">⏰ ' + formatDueDate(ev.dueDate) + '</span>' : ''}</div>
        </div>
        <div class="ev-amount ${ev.type==='sell_cash'?'tok':'twarn'}">${fmtC(ev.totalPrice,ev.currency)}</div>
        <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'sell')">🗑️</button>
      </div>`).join('') : '<div class="empty">هیچ فرۆشتنێک نییە</div>'}</div>`;
}

function setSuggestedPrice(id, price) {
  const inp = el('ev-sprice-'+id);
  const curr = el('ev-scurr-'+id);
  if (inp) inp.value = price;
  if (curr) curr.value = 'IQD';
  evCalcSell(id);
}


function evCalcSell(id) {
  const qty = parseFloat(el('ev-sqty-'+id)?.value)||0;
  const pr  = parseFloat(el('ev-sprice-'+id)?.value)||0;
  const curr = el('ev-scurr-'+id)?.value||'IQD';
  if (!qty||!pr) { el('ev-sellpreview-'+id).innerHTML=''; return; }
  const total = qty*pr;
  const s = getProductStats(id);
  const costPerUnit = s.totalLoadedQty>0 ? s.totalCostUSD/s.totalLoadedQty : 0;
  const profitTotal = (toUSD(pr,curr) - costPerUnit)*qty;
  el('ev-sellpreview-'+id).innerHTML=`<div class="sum-box" style="padding:10px">
    <div class="sum-row"><span class="lbl">کۆی نرخ</span><span class="val">${fmtC(total,curr)}</span></div>
    <div class="sum-row"><span class="lbl">بەرامبەر IQD</span><span class="val">${fmtC(fromUSD(toUSD(total,curr),'IQD'),'IQD')}</span></div>
    ${costPerUnit>0?`<div class="sum-row"><span class="lbl">قازانجی ئەم فرۆشتنە</span><span class="val ${profitTotal>=0?'tok':'tbad'}">${fmtC(fromUSD(profitTotal,'IQD'),'IQD')}</span></div>`:''}
  </div>`;
}

function toggleDueDateField(id, val) {
  const wrap = el('ev-duedate-wrap-' + id);
  if (wrap) wrap.style.display = (val === 'sell_debt') ? 'block' : 'none';
  if (val !== 'sell_debt') { const d = el('ev-sduedate-'+id); if(d) d.value=''; }
}

// ===== ئاگادارکردنەوەی قەرزی سەردەم =====
function getDebtDueAlerts() {
  const evs = getAllEvents();
  const prods = getProducts();
  const now = today();
  const alerts = [];

  // کۆکردنەوەی قەرزارەکان بە token
  const debtorMap = {};
  evs.forEach(ev => {
    if (ev.type === 'sell_debt') {
      const key = makeCustomerToken(ev.buyer||'', ev.phone||'');
      if (!debtorMap[key]) debtorMap[key] = {
        name: ev.buyer||'نەناسراو', phone: ev.phone||'',
        owedUSD: 0, dueDates: [], productNames: new Set()
      };
      debtorMap[key].owedUSD += toUSD(ev.totalPrice, ev.currency);
      const prod = prods.find(p => p.id == ev.productId);
      if (prod) debtorMap[key].productNames.add(prod.name);
      if (ev.dueDate) debtorMap[key].dueDates.push(ev.dueDate);
    }
    if (ev.type === 'debt_pay') {
      const key = makeCustomerToken(ev.buyer||'', ev.phone||'');
      if (debtorMap[key]) debtorMap[key].owedUSD -= toUSD(ev.amount, ev.currency);
    }
  });

  Object.values(debtorMap).forEach(d => {
    if (d.owedUSD <= 0.001) return;
    if (!d.dueDates.length) return;
    const nearestDue = d.dueDates.sort()[0];
    const diffDays = Math.round((new Date(nearestDue) - new Date(now)) / 86400000);

    if (diffDays < 0) {
      alerts.push({ ...d, nearestDue, diffDays, status: 'overdue' });
    } else if (diffDays <= 7) {
      alerts.push({ ...d, nearestDue, diffDays, status: 'soon' });
    }
  });

  return alerts.sort((a, b) => a.diffDays - b.diffDays);
}

function saveSell(id) {
  const qty  = parseFloat(el('ev-sqty-'+id)?.value)||0;
  const pr   = parseFloat(el('ev-sprice-'+id)?.value)||0;
  const curr = el('ev-scurr-'+id)?.value||'IQD';
  const type = el('ev-spay-'+id)?.value||'sell_cash';
  const p = getProduct(id);
  if (qty<=0)  return alert('⚠️ بڕی کاڵا داخڵ بکە');
  if (pr<=0)   return alert('⚠️ نرخی کاڵا داخڵ بکە');
  if (p && p.qty < qty) return alert('⚠️ ستۆک بەس نییە! مانەوە: ' + p.qty + ' ' + p.unit);
  const buyer = el('ev-sbuyer-'+id)?.value?.trim()||'';
  const phone = el('ev-sphone-'+id)?.value?.trim()||'';
  if (!phone) return alert('⚠️ ژمارە تەلەفون داخڵ بکە');
  if (type==='sell_debt') {
    const dueDate = el('ev-sduedate-'+id)?.value||'';
    if (!dueDate) return alert('⚠️ بەرواری کۆتایی قەرز داخڵ بکە');
  }
  const dueDate = el('ev-sduedate-'+id)?.value||'';
  addEvent({ productId:id, type, qty, unitPrice:pr, totalPrice:qty*pr, currency:curr,
    buyer, phone, customerToken: makeCustomerToken(buyer, phone),
    dueDate: type==='sell_debt' ? dueDate : '',
    date:el('ev-sdate-'+id)?.value||today(), note:el('ev-snote-'+id)?.value||'' });
  updateProductQty(id, -qty);
  refreshProdCard(id,'sell');
}

// ---- DEBT TAB ----
function makeCustomerToken(buyer, phone) {
  const raw = (buyer||'') + '|' + (phone||'');
  let hash = 5381;
  for (let i=0; i<raw.length; i++) hash = ((hash<<5)+hash) ^ raw.charCodeAt(i);
  return Math.abs(hash).toString(36) + (buyer||'x').slice(0,3).replace(/\s/g,'');
}

function getDebtorLink(buyer, phone) {
  const token = makeCustomerToken(buyer, phone);
  return location.href.replace(/[^/]*\.html[^]*/i, 'customer.html') + '?t=' + token;
}

function renderProdDebt(id, p, s) {
  const debtPays = s.events.filter(e=>e.type==='debt_pay');
  const debtIQD  = fromUSD(s.debtRemainUSD,'IQD');
  const currOpts = getCurrencies().map(c=>`<option value="${c.code}">${c.flag} ${c.code}</option>`).join('');

  // کۆکردنەوەی قەرزارەکانی ئەم کاڵایە
  const debtorMap = {};
  s.events.forEach(ev => {
    if (ev.type === 'sell_debt') {
      const key = (ev.buyer||'نەناسراو')+'|'+(ev.phone||'');
      if (!debtorMap[key]) debtorMap[key] = { name:ev.buyer||'نەناسراو', phone:ev.phone||'', token:ev.customerToken||'', owed:0 };
      debtorMap[key].owed += toUSD(ev.totalPrice, ev.currency);
    }
    if (ev.type === 'debt_pay') {
      const key = (ev.buyer||'نەناسراو')+'|'+(ev.phone||'');
      if (debtorMap[key]) debtorMap[key].owed -= toUSD(ev.amount, ev.currency);
    }
  });
  const debtors = Object.values(debtorMap).filter(d => d.owed > 0.001);

  const debtorCards = debtors.length ? debtors.map(d => {
    const link = getDebtorLink(d.name, d.phone);
    const safeLink = link.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const waMsg = encodeURIComponent(`سڵاو ${d.name} 👋\nقەرزەکەت: ${fmtC(fromUSD(d.owed,'IQD'),'IQD')}\nبینینی هەموو مامەڵەکانت:\n${link}`);
    const waLink = d.phone ? `https://wa.me/${d.phone.replace(/\D/g,'')}?text=${waMsg}` : '';
    return `<div style="background:var(--bg);border:1px solid rgba(248,113,113,.25);border-radius:var(--rs);padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:700">${d.name}</div>
          ${d.phone?`<div style="font-size:11px;color:var(--muted)">📞 ${d.phone}</div>`:''}
        </div>
        <span class="tbad fw8">${fmtC(fromUSD(d.owed,'IQD'),'IQD')}</span>
      </div>
      <div style="background:var(--bg2);border:1px dashed var(--border2);border-radius:6px;padding:7px 10px;font-size:10px;color:var(--muted);word-break:break-all;margin-bottom:8px;font-family:monospace;direction:ltr;text-align:left;cursor:pointer;user-select:all" onclick="copyLink('${safeLink}',this.nextElementSibling.querySelector('button'))" title="کلیک بکە بۆ کۆپیکردن">${link}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-p btn-sm" style="flex:1;font-size:12px;padding:8px 10px" onclick="copyLink('${safeLink}',this)">🔗 کۆپیکردنی لینک</button>
        ${waLink?`<a href="${waLink}" target="_blank" class="btn btn-sm" style="flex:1;background:#25d366;color:#fff;text-decoration:none;justify-content:center;display:flex;align-items:center;gap:5px;padding:8px 10px;border-radius:var(--rs);font-size:12px;font-weight:700;font-family:inherit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          واتساپ
        </a>`:''}
      </div>
    </div>`;
  }).join('') : '';

  return `
    <div class="sum-box" style="margin-bottom:14px">
      <div class="sum-row"><span class="lbl">کۆی قەرز</span><span class="val tbad">${fmtC(fromUSD(s.debtRevenueUSD,'IQD'),'IQD')}</span></div>
      <div class="sum-row"><span class="lbl">داواوەکرا</span><span class="val tok">${fmtC(fromUSD(s.debtPaidUSD,'IQD'),'IQD')}</span></div>
      <div class="sum-total"><span>مانەوە</span><span class="${debtIQD>0?'tbad':'tok'}">${fmtC(debtIQD,'IQD')}</span></div>
    </div>

    ${debtorCards ? `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">👥 قەرزارەکان</div>
      ${debtorCards}
    </div>` : ''}

    ${s.debtRemainUSD>0?`<div class="ev-form">
      <div class="ev-form-title">💳 تۆمارکردنی پارەدانەوە</div>
      <div class="fg2">
        <div class="fg"><label>بڕ</label><input id="ev-dp-${id}" type="number" step="0.01" placeholder="0.00"></div>
        <div class="fg"><label>دراو</label><select id="ev-dpcurr-${id}">${currOpts}</select></div>
        <div class="fg"><label>ناوی قەرزار</label><input id="ev-dpbuyer-${id}" placeholder="..."></div>
        <div class="fg"><label>ژمارە تەلەفون</label><input id="ev-dpphone-${id}" placeholder="07XX..." type="tel"></div>
        <div class="fg c2"><label>بەروار</label><input id="ev-dpdate-${id}" type="date" value="${today()}"></div>
      </div>
      <button class="btn btn-ok btn-sm" onclick="saveDebtPay(${id})">✅ تۆمارکردن</button>
    </div>`:''}
    <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">مێژووی پارەدانەوە (${debtPays.length})</div>
    <div class="ev-list">${debtPays.length ? debtPays.slice().reverse().map(ev=>`
      <div class="ev-item">
        <div class="ev-icon">✅</div>
        <div class="ev-info">
          <div class="ev-title">${ev.buyer||'—'}</div>
          <div class="ev-meta">${ev.date}${ev.phone?' · 📞 <a href="tel:'+ev.phone+'" style="color:var(--primary);text-decoration:none">'+ev.phone+'</a>':''}</div>
        </div>
        <div class="ev-amount tok">${fmtC(ev.amount,ev.currency)}</div>
        <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'debt')">🗑️</button>
      </div>`).join('') : '<div class="empty">هیچ پارەدانەوەیەک نییە</div>'}</div>`;
}

function saveDebtPay(id) {
  const amt  = parseFloat(el('ev-dp-'+id)?.value)||0;
  const date = el('ev-dpdate-'+id)?.value||'';
  if (amt<=0)  return alert('⚠️ بڕی پارە داخڵ بکە');
  if (!date)   return alert('⚠️ بەروار داخڵ بکە');
  addEvent({ productId:id, type:'debt_pay', amount:amt, currency:el('ev-dpcurr-'+id)?.value||'IQD',
    date, buyer:el('ev-dpbuyer-'+id)?.value||'',
    phone:el('ev-dpphone-'+id)?.value||'' });
  refreshProdCard(id,'debt');
}

// ---- HISTORY TAB ----
function renderProdHistory(id, p, s) {
  const icons  = { load:'📥', shipping:'🚚', tax:'🏛️', sell_cash:'💵', sell_debt:'📝', debt_pay:'✅' };
  const labels = { load:'بار', shipping:'کرێ', tax:'باج', sell_cash:'نەقد', sell_debt:'قەرز', debt_pay:'پارەدانەوە' };
  const sorted = [...s.events].sort((a,b)=>(b.date||'')>(a.date||'')?1:-1);
  return `<div class="ev-list">${sorted.length ? sorted.map(ev=>`
    <div class="ev-item">
      <div class="ev-icon">${icons[ev.type]||'📌'}</div>
      <div class="ev-info">
        <div class="ev-title">${labels[ev.type]||ev.type}${ev.buyer?' — '+ev.buyer:ev.supplier?' — '+ev.supplier:''}</div>
        <div class="ev-meta">${ev.date||''}${ev.note?' · '+ev.note:''}</div>
      </div>
      <div class="ev-amount">${ev.totalPrice!=null?fmtC(ev.totalPrice,ev.currency):ev.amount!=null?fmtC(ev.amount,ev.currency):''}</div>
    </div>`).join('') : '<div class="empty">هیچ مێژووێک نییە</div>'}</div>`;
}

// ---- PRINT TAB ----
function renderProdPrint(id, p, s) {
  return `<div style="text-align:center;padding:20px">
    <p style="color:var(--muted);margin-bottom:14px;font-size:13px">بۆ چاپکردنی ڕاپۆرتی ئەم کاڵایە، کلیک لە دوگمەی خوارەوە بکە</p>
    <button class="btn btn-p" onclick="printProduct(${id})">🖨️ چاپکردنی ڕاپۆرت</button>
    &nbsp;
    <button class="btn btn-ol" onclick="printAllProducts()">🖨️ چاپکردنی هەموو</button>
  </div>`;
}

function printProduct(id) {
  const p = getProduct(id);
  const s = getProductStats(id);
  const win = window.open('', '_blank');
  win.document.write(buildPrintHTML([{ p, s }], `ڕاپۆرتی کاڵا: ${p.name}`));
  win.document.close();
  win.print();
}

function printAllProducts() {
  const items = getProducts().map(p => ({ p, s: getProductStats(p.id) }));
  const win = window.open('', '_blank');
  win.document.write(buildPrintHTML(items, 'ڕاپۆرتی گشتی کاڵاکان'));
  win.document.close();
  win.print();
}

function buildPrintHTML(items, title) {
  const now = new Date().toLocaleDateString('ar-IQ');
  const g = getGlobalStats();
  let body = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;color:#000;background:#fff;font-size:12px;margin:0;padding:15mm}
      h1{font-size:18px;margin-bottom:4px} h2{font-size:14px;color:#1a3a5c;margin:14px 0 6px}
      .meta{color:#666;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      th{background:#1a3a5c;color:#fff;padding:7px 10px;text-align:right;font-size:11px}
      td{padding:6px 10px;border-bottom:1px solid #ddd}
      .ok{color:#16a34a;font-weight:700} .bad{color:#dc2626;font-weight:700}
      .sum{background:#f5f7fa;padding:12px;border-radius:6px;margin-bottom:14px}
      .sum-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #ddd}
      .total{display:flex;justify-content:space-between;font-size:14px;font-weight:800;padding-top:8px;margin-top:4px}
      .divider{height:1px;background:#ddd;margin:14px 0}
      @page{margin:15mm} @media print{body{padding:0}}
    </style></head><body>
    <h1>📦 ${title}</h1>
    <div class="meta">بەروار: ${now} · کۆی کاڵاکان: ${items.length}</div>`;

  if (items.length > 1) {
    body += `<div class="sum">
      <div class="sum-row"><span>کۆی خەرجی</span><span class="bad">${fmtC(fromUSD(g.totalCostUSD,'IQD'),'IQD')}</span></div>
      <div class="sum-row"><span>کۆی فرۆشتن</span><span class="ok">${fmtC(fromUSD(g.totalRevenueUSD,'IQD'),'IQD')}</span></div>
      <div class="sum-row"><span>قەرزی مانەوە</span><span class="bad">${fmtC(fromUSD(g.debtRemainUSD,'IQD'),'IQD')}</span></div>
      <div class="total"><span>کۆی قازانج</span><span class="${g.profitUSD>=0?'ok':'bad'}">${fmtC(fromUSD(g.profitUSD,'IQD'),'IQD')}</span></div>
    </div>`;
  }

  items.forEach(({ p, s }) => {
    body += `<h2>📦 ${p.name}</h2>
    <div class="sum">
      <div class="sum-row"><span>خەرجی کڕین</span><span class="bad">${fmtC(fromUSD(s.loadCostUSD,'IQD'),'IQD')}</span></div>
      <div class="sum-row"><span>کرێی بار</span><span class="bad">${fmtC(fromUSD(s.shippingUSD,'IQD'),'IQD')}</span></div>
      <div class="sum-row"><span>باج</span><span class="bad">${fmtC(fromUSD(s.taxUSD,'IQD'),'IQD')}</span></div>
      <div class="sum-row"><span>کۆی فرۆشتن</span><span class="ok">${fmtC(fromUSD(s.totalRevenueUSD,'IQD'),'IQD')}</span></div>
      <div class="sum-row"><span>قەرزی مانەوە</span><span class="bad">${fmtC(fromUSD(s.debtRemainUSD,'IQD'),'IQD')}</span></div>
      <div class="sum-row"><span>ستۆکی مانەوە</span><span>${fmtN(s.stockQty,2)} ${p.unit}</span></div>
      <div class="total"><span>${s.profitUSD>=0?'قازانج':'زەرەر'}</span>
        <span class="${s.profitUSD>=0?'ok':'bad'}">${fmtC(fromUSD(s.profitUSD,'IQD'),'IQD')}</span>
      </div>
    </div>
    <table>
      <thead><tr><th>جۆر</th><th>بەروار</th><th>بڕ</th><th>بڕی پارە</th><th>تێبینی</th></tr></thead>
      <tbody>${s.events.sort((a,b)=>(a.date||'')>(b.date||'')?1:-1).map(ev=>`
        <tr>
          <td>${{load:'📥 بار',shipping:'🚚 کرێ',tax:'🏛️ باج',sell_cash:'💵 نەقد',sell_debt:'📝 قەرز',debt_pay:'✅ پارەدانەوە'}[ev.type]||ev.type}</td>
          <td>${ev.date||''}</td>
          <td>${ev.qty!=null?fmtN(ev.qty,2)+' '+p.unit:'-'}</td>
          <td>${ev.totalPrice!=null?fmtC(ev.totalPrice,ev.currency):ev.amount!=null?fmtC(ev.amount,ev.currency):'-'}</td>
          <td>${ev.note||ev.buyer||ev.supplier||''}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  });

  body += `</body></html>`;
  return body;
}

// ===== HELPERS =====
function refreshProdCard(id, tab) {
  const p = getProduct(id);
  const s = getProductStats(id);
  const card = el('pcard-' + id); if (!card) return;
  const meta = card.querySelector('.pc-meta');
  if (meta) meta.textContent = `${p.qty} ${p.unit} · ${p.buyDate} · ${p.supplier||'بێ فرۆشیار'}`;
  const statVals = card.querySelectorAll('.pc-stat .v');
  if (statVals[0]) statVals[0].textContent = `${fmtN(p.qty,2)} ${p.unit}`;
  if (statVals[1]) { statVals[1].textContent = fmtC(fromUSD(s.profitUSD,'IQD'),'IQD'); statVals[1].className = 'v '+(s.profitUSD>=0?'tok':'tbad'); }
  const content = el('pc-content-' + id);
  const map = { load: renderProdLoad, costs: renderProdCosts, sell: renderProdSell, debt: renderProdDebt, history: renderProdHistory };
  if (map[tab]) content.innerHTML = map[tab](id, p, s);
  else content.innerHTML = renderProdSummary(id, s);
}

function delEvAndRefresh(evId, prodId, tab) {
  if (!confirm('دڵنیایت؟')) return;
  const ev = delEvent(evId);
  if (ev && ev.type==='load') updateProductQty(prodId, -(parseFloat(ev.qty)||0));
  if (ev && (ev.type==='sell_cash'||ev.type==='sell_debt')) updateProductQty(prodId, parseFloat(ev.qty)||0);
  refreshProdCard(prodId, tab);
}

function delProd(id) {
  if (!confirm('دڵنیایت؟ هەموو داتای ئەم کاڵایە دەسڕێتەوە!')) return;
  saveProducts(getProducts().filter(p => p.id != id));
  DB.set('events', getAllEvents().filter(e => e.productId != id));
  renderProducts();
}

// ===== PROFITS PAGE =====
function setRange(type, btn) {
  currentRange = type;
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  el('customRangeRow').style.display = type==='custom' ? 'grid' : 'none';
  el('customRangeApply').style.display = type==='custom' ? 'block' : 'none';
  if (type !== 'custom') renderProfits();
}

function getDateRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (currentRange==='week')   return { from: new Date(y,m,d-6).toISOString().split('T')[0], to: today() };
  if (currentRange==='month')  return { from: new Date(y,m,1).toISOString().split('T')[0],   to: today() };
  if (currentRange==='year')   return { from: `${y}-01-01`, to: today() };
  if (currentRange==='custom') return { from: v('rangeFrom'), to: v('rangeTo') };
  return { from: '2000-01-01', to: '2099-12-31' };
}

function renderProfits() {
  const { from, to } = getDateRange();
  if (currentRange==='custom' && (!from||!to)) return;
  const g = getProfitByRange(from, to);
  const prods = getProducts();

  el('profitsContent').innerHTML = `
    <div class="card">
      <div class="ctitle">📊 سەرەکی گشتی · ${from} بۆ ${to}
        <div class="ca"><button class="btn btn-ol btn-sm" onclick="printAllProducts()">🖨️ پرینت</button></div>
      </div>
      <div class="sgrid">
        <div class="scard ok"><div class="si">💰</div><div class="sv tok">${fmtC(fromUSD(g.revenueUSD,'IQD'),'IQD')}</div><div class="sl">کۆی فرۆشتن</div></div>
        <div class="scard bad"><div class="si">🛒</div><div class="sv tbad">${fmtC(fromUSD(g.costUSD,'IQD'),'IQD')}</div><div class="sl">کۆی خەرجی</div></div>
        <div class="scard ${g.profitUSD>=0?'ok':'bad'}">
          <div class="si">${g.profitUSD>=0?'📈':'📉'}</div>
          <div class="sv ${g.profitUSD>=0?'tok':'tbad'}">${fmtC(fromUSD(g.profitUSD,'IQD'),'IQD')}</div>
          <div class="sl">${g.profitUSD>=0?'قازانج':'زەرەر'}</div>
        </div>
      </div>
      <div class="sum-box">
        <div class="sum-row">
          <span class="lbl">🇺🇸 دۆلار</span>
          <span class="val ${g.profitUSD>=0?'tok':'tbad'}">${fmtC(g.profitUSD,'USD')}</span>
        </div>
        <div class="sum-row">
          <span class="lbl">🇮🇶 دینار</span>
          <span class="val ${g.profitUSD>=0?'tok':'tbad'}">${fmtC(fromUSD(g.profitUSD,'IQD'),'IQD')}</span>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="ctitle">📦 قازانجی هەر کاڵایەک</div>
      <div class="tw"><table>
        <thead><tr><th>کاڵا</th><th>فرۆشتن IQD</th><th>خەرجی IQD</th><th>قازانج / زەرەر</th></tr></thead>
        <tbody>${prods.map(p => {
          const ps = getProductStats(p.id);
          return `<tr>
            <td><strong>${p.name}</strong></td>
            <td class="tok">${fmtC(fromUSD(ps.totalRevenueUSD,'IQD'),'IQD')}</td>
            <td class="tbad">${fmtC(fromUSD(ps.totalCostUSD,'IQD'),'IQD')}</td>
            <td><span class="badge ${ps.profitUSD>=0?'b-ok':'b-bad'}">${fmtC(fromUSD(ps.profitUSD,'IQD'),'IQD')}</span></td>
          </tr>`;}).join('') || '<tr><td colspan="4" class="empty">هیچ کاڵایەک نییە</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}

// ===== CURRENCIES =====
function renderCurrencies() {
  const list = getCurrencies();
  const lu = DB.get('rateLastUpdate');
  if (lu && el('rateLastUpdate')) el('rateLastUpdate').textContent = 'دوایین: ' + lu;
  el('currCards').innerHTML = `<div class="grid-3">${list.map(c => `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:12px;display:flex;align-items:center;gap:8px">
      <span style="font-size:24px">${c.flag}</span>
      <div style="flex:1"><div style="font-weight:700">${c.code}</div><div style="font-size:10px;color:var(--muted)">${c.name}</div></div>
      <div style="text-align:left"><div style="font-weight:700;font-size:12px">${fmtN(c.rateToUSD,c.code==='IQD'||c.code==='IRR'?0:4)}</div><div style="font-size:9px;color:var(--faint)">بەرامبەر $1</div></div>
    </div>`).join('')}</div>`;
  el('currTable').innerHTML = list.map(c=>`<tr>
    <td>${c.flag}</td><td><strong>${c.code}</strong></td><td>${c.name}</td>
    <td><input type="number" step="any" value="${c.rateToUSD}"
      style="width:110px;padding:5px 8px;background:var(--bg3);border:1.5px solid var(--border);border-radius:6px;color:var(--text);font-family:inherit;font-size:12px"
      onchange="updateRate('${c.code}',this.value)"></td>
    <td><button class="btn btn-bad btn-xs" onclick="delCurr('${c.code}')">🗑️</button></td>
  </tr>`).join('');
}

function updateRate(code, val) {
  const list = getCurrencies(); const c = list.find(x=>x.code===code);
  if (c) c.rateToUSD = parseFloat(val)||1;
  saveCurrencies(list); renderCurrencies();
}

function delCurr(code) {
  if (code==='IQD'||code==='USD') return alert('IQD و USD ناتوانرێت بسڕدرێتەوە');
  saveCurrencies(getCurrencies().filter(c=>c.code!==code));
  renderCurrencies(); fillCurrencySelects();
}

function addCurrency() {
  const code = v('nCCode').trim().toUpperCase(), name = v('nCName').trim();
  if (!code||!name) return showA('currAlert','bad','کۆد و ناو داخڵ بکە');
  const list = getCurrencies();
  if (list.find(c=>c.code===code)) return showA('currAlert','bad','ئەم دراوە پێشتر هەیە');
  list.push({ code, name, flag:v('nCFlag')||'🏳️', rateToUSD:parseFloat(v('nCRate'))||1, symbol:v('nCSym')||code });
  saveCurrencies(list);
  ['nCCode','nCName','nCFlag','nCRate','nCSym'].forEach(id=>{const e=el(id);if(e)e.value='';});
  showA('currAlert','ok','✅ دراو زیادکرا'); fillCurrencySelects(); renderCurrencies();
}

async function fetchLiveRates() {
  const btn = el('btnFetchRates'); const alertEl = el('fetchRateAlert');
  if (btn) { btn.disabled=true; btn.textContent='⏳ چاوەڕێ...'; }
  if (alertEl) alertEl.innerHTML = '';
  try {
    let data = null;
    try { const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json'); if(r.ok) data=await r.json(); } catch(_){}
    if (!data) { const r = await fetch('https://latest.currency-api.pages.dev/v1/currencies/usd.json'); if(r.ok) data=await r.json(); }
    if (!data||!data.usd) throw new Error('داتا نەگەیشت');
    const rates = data.usd; let updated=0;
    const list = getCurrencies();
    list.forEach(c=>{ if(c.code==='USD') return; const k=c.code.toLowerCase(); if(rates[k]){ c.rateToUSD=parseFloat((1/rates[k]).toFixed(6)); updated++; } });
    saveCurrencies(list);
    DB.set('rateLastUpdate', new Date().toLocaleString('en-GB'));
    if(alertEl) alertEl.innerHTML=`<div class="alert al-ok">✅ ${updated} دراو نوێ کرایەوە</div>`;
    fillCurrencySelects(); renderCurrencies();
  } catch(e) {
    if(alertEl) alertEl.innerHTML=`<div class="alert al-bad">❌ ${e.message}</div>`;
  } finally {
    if(btn){btn.disabled=false;btn.textContent='🔄 نرخی ڕەستەکەی';}
  }
}

// ===== SUPPLIERS =====
function renderSuppliers() {
  const list = getSuppliers();
  el('suppList').innerHTML = list.length
    ? `<div class="ev-list">${list.map(s=>`
        <div class="ev-item">
          <div class="ev-icon">🏪</div>
          <div class="ev-info">
            <div class="ev-title">${s.name}</div>
            ${s.phone?`<div class="ev-meta">📞 <a href="tel:${s.phone}" style="color:var(--primary);text-decoration:none">${s.phone}</a></div>`:''}
          </div>
          ${s.phone?`<a href="tel:${s.phone}" class="btn btn-ol btn-xs">📞</a>`:''}
          <button class="btn btn-bad btn-xs" onclick="delSupplier(${s.id})">🗑️</button>
        </div>`).join('')}</div>`
    : `<div class="empty">هیچ فرۆشیارێک نییە</div>`;
}
function doAddSupplier() {
  const n = v('suppName').trim(); if(!n) return showA('suppAlert','bad','ناو داخڵ بکە');
  const phone = v('suppPhone').trim();
  addSupplier(n, phone);
  el('suppName').value=''; el('suppPhone').value='';
  showA('suppAlert','ok','✅ زیادکرا'); renderSuppliers(); fillSupplierSelect();
}
function delSupplier(id) {
  DB.set('suppliers', getSuppliers().filter(s=>s.id!=id));
  renderSuppliers(); fillSupplierSelect();
}

function copyLink(url, btnEl) {
  const btn = btnEl || (typeof event !== 'undefined' ? event.target : null);
  const doFeedback = (b) => {
    if (!b) return;
    const old = b.innerHTML;
    b.innerHTML = '✅ کۆپیکرا!';
    b.style.background = 'var(--ok)';
    b.style.color = '#fff';
    setTimeout(() => { b.innerHTML = old; b.style.background = ''; b.style.color = ''; }, 2500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => doFeedback(btn)).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand('copy'); doFeedback(btn); } catch { prompt('لینکەکە کۆپی بکە:', url); }
      document.body.removeChild(ta);
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); doFeedback(btn); } catch { prompt('لینکەکە کۆپی بکە:', url); }
    document.body.removeChild(ta);
  }
}

// ===== SETTINGS PAGE =====



function renderSettings() { /* renders inline in HTML */ }

// ===== کڕیارەکان =====
function getCustomerStats() {
  const evs = getAllEvents();
  const prods = getProducts();
  const map = {};
  evs.forEach(ev => {
    if (!ev.phone) return;
    const key = ev.phone;
    if (!map[key]) map[key] = { name: ev.buyer||'نەناسراو', phone: ev.phone, totalUSD:0, debtUSD:0, paidUSD:0, txCount:0, products:new Set() };
    const c = map[key];
    if (ev.type==='sell_cash'||ev.type==='sell_debt') {
      c.totalUSD += toUSD(ev.totalPrice, ev.currency);
      c.txCount++;
      if (ev.type==='sell_debt') c.debtUSD += toUSD(ev.totalPrice, ev.currency);
      const prod = prods.find(p => p.id == ev.productId);
      if (prod) c.products.add(prod.name);
    }
    if (ev.type==='debt_pay') c.paidUSD += toUSD(ev.amount, ev.currency);
  });
  return Object.values(map).map(c => ({ ...c, remainUSD: c.debtUSD - c.paidUSD, products:[...c.products] }))
    .sort((a,b) => b.totalUSD - a.totalUSD);
}

function renderCustomers() {
  const customers = getCustomerStats();
  const cont = el('customersList'); if (!cont) return;
  if (!customers.length) {
    cont.innerHTML = '<div class="empty"><span class="ei">👥</span>هێشتا هیچ کڕیارێک نییە<br><span style="font-size:11px">کاتێک فرۆشتن تۆمار بکەیت ژمارە تەلەفون داخڵ بکە</span></div>';
    return;
  }
  const totalBought = customers.reduce((s,c) => s+c.totalUSD, 0);
  const totalDebt   = customers.reduce((s,c) => s+Math.max(0,c.remainUSD), 0);

  const rows = customers.map((c, i) => {
    const link  = getDebtorLink(c.name, c.phone);
    const debt  = c.remainUSD > 0.001;
    const waTxt = 'سڵاو ' + c.name + '\nکۆی کڕینت: ' + fmtC(fromUSD(c.totalUSD,'IQD'),'IQD') + (debt ? '\nقەرزی مانەوە: ' + fmtC(fromUSD(c.remainUSD,'IQD'),'IQD') : '\nقەرزت نییە ✅');
    const waLink = 'https://wa.me/' + c.phone.replace(/\D/g,'') + '?text=' + encodeURIComponent(waTxt);
    return '<div class="card" style="margin-bottom:10px;padding:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:14px;flex-shrink:0">' + (i+1) + '</div>' +
          '<div>' +
            '<div style="font-weight:700;font-size:14px">' + c.name + '</div>' +
            '<div style="font-size:11px;color:var(--muted)">📞 <a href="tel:' + c.phone + '" style="color:var(--primary);text-decoration:none">' + c.phone + '</a> · ' + c.txCount + ' مامەڵە</div>' +
            '<div style="font-size:10px;color:var(--faint);margin-top:2px">' + c.products.slice(0,3).join('، ') + (c.products.length>3?' ...':'') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:left">' +
          '<div style="font-weight:800;font-size:13px;color:var(--ok)">' + fmtC(c.totalUSD,'USD') + '</div>' +
          '<div style="font-size:10px;color:var(--faint)">' + fmtC(fromUSD(c.totalUSD,'IQD'),'IQD') + '</div>' +
          (debt
            ? '<div style="font-size:11px;font-weight:700;color:var(--bad);margin-top:3px">قەرز: ' + fmtC(c.remainUSD,'USD') + '</div>'
            : '<div style="font-size:10px;color:var(--ok);margin-top:3px">✅ قەرز نییە</div>') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn btn-xs btn-g" onclick="copyLink(\'' + link + '\')">🔗 لینک</button>' +
        '<a href="' + waLink + '" target="_blank" class="btn btn-xs" style="background:#25d366;color:#fff;text-decoration:none">واتساپ</a>' +
      '</div>' +
    '</div>';
  }).join('');

  cont.innerHTML =
    '<div class="sgrid" style="margin-bottom:16px">' +
      '<div class="scard info"><div class="si">👥</div><div class="sv" style="color:var(--info)">' + customers.length + '</div><div class="sl">کۆی کڕیارەکان</div></div>' +
      '<div class="scard ok"><div class="si">💰</div><div class="sv tok">' + fmtC(totalBought,'USD') + '</div><div class="sl">کۆی کڕین</div><div class="sd">' + fmtC(fromUSD(totalBought,'IQD'),'IQD') + '</div></div>' +
      '<div class="scard ' + (totalDebt>0?'bad':'ok') + '"><div class="si">💳</div><div class="sv ' + (totalDebt>0?'tbad':'tok') + '">' + fmtC(totalDebt,'USD') + '</div><div class="sl">کۆی قەرز</div><div class="sd">' + fmtC(fromUSD(totalDebt,'IQD'),'IQD') + '</div></div>' +
    '</div>' + rows;
}


function doExport() {
  exportData();
  showA('settingsAlert','ok','✅ داتا ئامادەی داگرتنە!');
}

function doImport(input) {
  const file = input.files[0]; if(!file) return;
  if (!confirm('داتای ئێستا دەسڕێتەوە و جێگای داتای نوێ دەگیرێتەوە. دڵنیایت؟')) { input.value=''; return; }
  importData(file).then(data => {
    showA('settingsAlert','ok',`✅ داتا هاوردەکرا! ${data.products.length} کاڵا`);
    input.value='';
    renderDash();
  }).catch(err => {
    showA('settingsAlert','bad','❌ هەڵە: ' + err.message);
    input.value='';
  });
}

function doReset() {
  if (!confirm('⚠️ هەموو داتاکان دەسڕێتەوە! دڵنیایت؟')) return;
  if (!confirm('دووبارە دڵنیا بە — ئەم کاره گەرانەوەی نییە!')) return;
  DB.clear(); initData();
  showA('settingsAlert','ok','✅ سیستەم ڕیسێت کرایەوە');
  showPage('dashboard');
}
