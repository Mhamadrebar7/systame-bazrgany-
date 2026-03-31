// ============================================================
// app.js — ڕووکار، UI و کارلێکی سیستەم
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

let currentRange     = 'month';
let currentRangeFrom = '', currentRangeTo = '';
let searchTimeout    = null;
let currentPage      = 1;
const PAGE_SIZE      = 20;

// ============================================================
// ===== HELPERS =====
// ============================================================
function el(id)  { return document.getElementById(id); }
function v(id)   { return (el(id) || {}).value || ''; }
function fv(id)  { return parseFloat((v(id) || '').replace(/,/g, '')) || 0; }

function showA(cid, type, msg) {
  const e = el(cid); if (!e) return;
  if (type === 'bad') {
    e.innerHTML = `<div class="alert al-${type}" style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
      <span>${msg}</span>
      <button onclick="this.closest('.alert').parentElement.innerHTML=''" style="background:none;border:none;cursor:pointer;color:inherit;opacity:.6;font-size:14px;padding:0;flex-shrink:0">?</button>
    </div>`;
  } else {
    e.innerHTML = `<div class="alert al-${type}">${msg}</div>`;
    setTimeout(() => { e.innerHTML = ''; }, 4000);
  }
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
  const sb = document.querySelector('.sidebar');
  const ov = document.querySelector('.sidebar-overlay');
  if (sb) { sb.classList.add('mobile-open'); sb.style.transform = 'translateX(0)'; }
  if (ov) ov.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  const sb = document.querySelector('.sidebar');
  const ov = document.querySelector('.sidebar-overlay');
  if (sb) { sb.classList.remove('mobile-open'); sb.style.transform = ''; }
  if (ov) ov.classList.remove('show');
  document.body.style.overflow = '';
}

// ============================================================
// ===== NAVIGATION =====
// ============================================================
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
  e.innerHTML = '<option value="">— بەبێ فرۆشیار —</option>'
    + getSuppliers().map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  if (cur) e.value = cur;
}

function renderLowStockBanner() {
  const low = getLowStockProducts(5);
  const b = el('lowStockBanner'); if (!b) return;
  if (!low.length) { b.innerHTML = ''; return; }
  b.innerHTML = `<div class="stock-alert" onclick="showPage('products')">
    ?? ${low.length} ???? ??????? ????: ${low.map(p => {
      const st = getProductStats(p.id);
      return `<strong>${escHtml(p.name)}</strong> (${fmtN(st.stockQty,2)} ${escHtml(p.unit)})`;
    }).join('? ')}
  </div>`;
}
function renderDebtDueBanner() {
  const b = el('debtDueBanner'); if (!b) return;
  const alerts = getDebtDueAlerts();
  if (!alerts.length) { b.innerHTML = ''; return; }

  const overdues = alerts.filter(a => a.status === 'overdue');
  const soons = alerts.filter(a => a.status === 'soon');

  let html = '';
  if (overdues.length) {
    html += `<div class="debt-due-banner overdue" onclick="showPage('products')">
      <span class="ddb-icon">⏰</span>
      <div class="ddb-body">
        <div class="ddb-title">${overdues.length} قەرزدار بەرواریان تێپەڕیوە!</div>
        <div class="ddb-names">${overdues.map(a =>
          `<span class="ddb-name">${escHtml(a.name)} · ${fmtC(a.owedUSD,'USD')}</span>`
        ).join('')}</div>
      </div>
    </div>`;
  }
  if (soons.length) {
    html += `<div class="debt-due-banner soon" onclick="showPage('products')">
      <span class="ddb-icon">📅</span>
      <div class="ddb-body">
        <div class="ddb-title">${soons.length} قەرزدار بەرواریان نزیکە (لە ماوەی 7 ڕۆژ)</div>
        <div class="ddb-names">${soons.map(a =>
          `<span class="ddb-name">${escHtml(a.name)} · ${a.diffDays === 0 ? 'ئەمڕۆ!' : a.diffDays + ' ڕۆژ'}</span>`
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
  const g = getGlobalStats();
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const mPad = String(m).padStart(2, '0');
  const mp = getProfitByRange(`${y}-${mPad}-01`, endOfMonth(y, m));

  el('dashStats').innerHTML = `
    <div class="scard info"><div class="si">📦</div><div class="sv" style="color:var(--info)">${prods.length}</div><div class="sl">کاڵاکان</div></div>
    <div class="scard ok"><div class="si">💰</div><div class="sv tok">${fmtC(g.totalRevenueUSD,'USD')}</div><div class="sl">کۆی فرۆشتن</div></div>
    <div class="scard bad"><div class="si">💸</div><div class="sv tbad">${fmtC(g.soldCostUSD,'USD')}</div><div class="sl">تێچووی فرۆشراو</div></div>
    <div class="scard ${g.debtRemainUSD>0?'bad':'ok'}"><div class="si">💳</div><div class="sv ${g.debtRemainUSD>0?'tbad':'tok'}">${fmtC(g.debtRemainUSD,'USD')}</div><div class="sl">قەرزی ماوە</div></div>
    <div class="scard ${g.profitUSD>=0?'ok':'bad'}">
      <div class="si">${g.profitUSD>=0?'📈':'📉'}</div>
      <div class="sv ${g.profitUSD>=0?'tok':'tbad'}">${fmtC(g.profitUSD,'USD')}</div>
      <div class="sl">${g.profitUSD>=0?'قازانج':'زەرەر'}</div>
    </div>
    <div class="scard info"><div class="si">📦</div><div class="sv" style="color:var(--info)">${fmtC(g.remainingStockValueUSD,'USD')}</div><div class="sl">نرخی ستۆک</div></div>`;

  const todayStr = today();
  const tp = getProfitByRange(todayStr, todayStr);

  el('dashMonthProfit').innerHTML = `
    <div style="margin-bottom:10px;padding:10px;background:var(--bg3);border-radius:var(--rs);text-align:center">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">ئەمڕۆ</div>
      <div style="font-size:18px;font-weight:800;color:${tp.revenueUSD>0?'var(--ok)':'var(--muted)'}">${tp.revenueUSD>0?fmtC(tp.revenueUSD,'USD'):'هیچ فرۆشتنێک نییە'}</div>
      ${tp.revenueUSD>0?`<div style="font-size:10px;color:var(--muted);margin-top:2px">${tp.profitUSD>=0?'📈':'📉'} ${fmtC(tp.profitUSD,'USD')} ${tp.profitUSD>=0?'قازانج':'زەرەر'}</div>`:''}
    </div>
    <div class="sum-box" style="padding:12px">
      <div class="sum-row"><span class="lbl">💰 کۆی فرۆشتن</span><span class="val tok">${fmtC(mp.revenueUSD,'USD')}</span></div>
      <div class="sum-row"><span class="lbl">💸 کۆی تێچوو</span><span class="val tbad">${fmtC(mp.costUSD,'USD')}</span></div>
      <div class="sum-total"><span>${mp.profitUSD>=0?'📈 قازانج':'📉 زەرەر'}</span>
        <span class="${mp.profitUSD>=0?'tok':'tbad'} fw8">${fmtC(mp.profitUSD,'USD')}</span>
      </div>
    </div>`;

  const allEvs = getAllEvents();
  const debtorMap = {};
  allEvs.forEach(ev => {
    const token = ev.customerToken || makeCustomerToken(ev.buyer || '', ev.phone || '');
    if (ev.type === 'sell_debt') {
      if (!debtorMap[token]) {
        const reg = lookupCustomerByToken(token);
        debtorMap[token] = {
          name: reg?.name || ev.buyer || 'نەناسراو',
          phone: reg?.phone || ev.phone || '',
          token,
          totalUSD: 0,
          products: new Set(),
        };
      }
      debtorMap[token].totalUSD += toUSD(ev.totalPrice, ev.currency);
      const prod = getProduct(ev.productId);
      if (prod) debtorMap[token].products.add(prod.name);
    }
    if (ev.type === 'debt_pay' && debtorMap[token]) {
      debtorMap[token].totalUSD -= toUSD(ev.amount, ev.currency);
    }
  });
  const debtors = Object.values(debtorMap).map(d => ({ ...d, totalUSD: Math.max(0, roundMoney(d.totalUSD)) })).filter(d => d.totalUSD > 0.001);

  el('dashDebt').innerHTML = debtors.length
    ? debtors.sort((a, b) => b.totalUSD - a.totalUSD).map(d => {
        const link = getDebtorLink(d.name, d.phone);
        const waMsg = encodeURIComponent(`سڵاو ${d.name} 👋\nقەرزەکەت: ${fmtC(d.totalUSD,'USD')}\nبینینی مامەڵەکانت:\n${link}`);
        const waLink = d.phone ? `https://wa.me/${d.phone.replace(/\D/g,'')}?text=${waMsg}` : '';
        return `<div style="padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div>
              <div style="font-size:13px;font-weight:600">${escHtml(d.name)}</div>
              <div style="font-size:11px;color:var(--muted)">${d.phone?`📞 <a href="tel:${escHtml(d.phone)}" style="color:var(--primary);text-decoration:none">${escHtml(d.phone)}</a> · `:''}${[...d.products].map(n=>escHtml(n)).join('، ')}</div>
            </div>
            <span class="tbad fw8">${fmtC(d.totalUSD,'USD')}</span>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <button class="btn btn-xs btn-g" onclick="copyLink('${link}')">🔗 لینک</button>
            ${waLink?`<a href="${waLink}" target="_blank" class="btn btn-xs" style="background:#25d366;color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:4px">واتساپ</a>`:''}
          </div>
        </div>`;
      }).join('')
    : `<div class="empty"><span class="ei">✅</span>هیچ قەرزێک نییە</div>`;

  const top = prods.map(p => ({ ...p, ...getProductStats(p.id) })).sort((a, b) => b.profitUSD - a.profitUSD).slice(0, 5);
  const maxProfit = top.length ? Math.max(...top.map(p => Math.abs(p.profitUSD)), 1) : 1;
  el('dashTopProds').innerHTML = top.length
    ? top.map((p, i) => {
        const pct = Math.round((Math.abs(p.profitUSD) / maxProfit) * 100);
        const isPos = p.profitUSD >= 0;
        return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:20px;height:20px;border-radius:50%;background:${isPos?'var(--ok-bg)':'var(--bad-bg)'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:${isPos?'var(--ok)':'var(--bad)'};flex-shrink:0">${i+1}</span>
              <div>
                <div style="font-size:13px;font-weight:700">${escHtml(p.name)}</div>
                <div style="font-size:10px;color:var(--muted)">${fmtN(p.stockQty,2)} ${escHtml(p.unit)} مانەوە</div>
              </div>
            </div>
            <span class="${isPos?'tok':'tbad'} fw8" style="font-size:12px">${fmtC(p.profitUSD,'USD')}</span>
          </div>
          <div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${isPos?'var(--ok)':'var(--bad)'};border-radius:2px;transition:width .5s ease"></div>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty"><span class="ei">📦</span>هیچ کاڵایەک نییە<br><button class="btn btn-p btn-sm mt8" onclick="showPage('addProduct')">➕ زیادبکە</button></div>`;

  const newHash = `${prods.length}|${allEvs.length}|${_statsCacheVersion}|${chartMonthRange}`;
  if (newHash !== _lastChartHash) {
    _lastChartHash = newHash;
    setTimeout(() => renderCharts(), 50);
  }
}

// ============================================================
// ===== CHARTS =====
// ============================================================
let chartProfit = null, chartCost = null, chartTopProds = null;
let chartMonthRange = 6;
let _lastChartHash  = '';

function setChartRange(n, btn) {
  chartMonthRange = n;
  _lastChartHash  = '';
  document.querySelectorAll('#chartRangeBtns .range-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCharts();
}

function renderCharts() {
  renderChartProfit();
  renderChartCost();
  renderChartTopProds();
}

// ---- 1: هێڵی قازانج ----
function renderChartProfit() {
  const canvas = el('chartProfit'); if (!canvas) return;
  const months = [], revenues = [], costs = [], profits = [];
  const now = new Date();
  for (let i = chartMonthRange - 1; i >= 0; i--) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y    = d.getFullYear(), mo = d.getMonth() + 1;
    const mPad = String(mo).padStart(2, '0');
    const from = `${y}-${mPad}-01`;
    // FIX: endOfMonth بۆ دیاریکردنی دوایین ڕۆژی مانگ بەکاردێت
    const to   = endOfMonth(y, mo);
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

// ---- 2: دابەشکردنی خەرجی (Doughnut) ----
function renderChartCost() {
  const canvas = el('chartCost'); if (!canvas) return;
  const prods  = getProducts();
  let loadCost = 0, shipCost = 0, taxCost = 0;
  prods.forEach(p => {
    const s   = getProductStats(p.id);
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
      datasets: [{ data: [loadCost, shipCost, taxCost],
        backgroundColor: ['#f87171','#fbbf24','#60a5fa'],
        borderColor: '#1a2030', borderWidth: 3, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${fmtC(ctx.raw,'USD')} (${((ctx.raw/total)*100).toFixed(1)}%)` },
          bodyFont: { family: 'Noto Sans Arabic' }
        }
      }
    }
  });

  const legend = el('chartCostLegend');
  if (legend) {
    const colors = ['#f87171','#fbbf24','#60a5fa'];
    const labels = ['کڕین','کرێی بار','باج'];
    const vals   = [loadCost, shipCost, taxCost];
    legend.innerHTML = `<div style="display:flex;justify-content:center;gap:14px;flex-wrap:wrap">
      ${labels.map((l, i) => `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)">
        <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};display:inline-block;flex-shrink:0"></span>
        ${l}: <strong style="color:var(--text)">${((vals[i]/total)*100).toFixed(0)}%</strong>
      </div>`).join('')}
    </div>`;
  }
}

// ---- 3: باشترین کاڵاکان (Bar) ----
function renderChartTopProds() {
  const canvas = el('chartTopProds'); if (!canvas) return;
  const prods  = getProducts();
  if (!prods.length) { canvas.style.display = 'none'; return; }
  canvas.style.display = '';

  const sorted = prods.map(p => ({ ...p, ...getProductStats(p.id) }))
    .sort((a, b) => b.profitUSD - a.profitUSD).slice(0, 8);

  if (chartTopProds) chartTopProds.destroy();
  chartTopProds = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(p => p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name),
      datasets: [{
        label: 'قازانج (IQD)',
        data:  sorted.map(p => parseFloat(fromUSD(p.profitUSD, 'IQD').toFixed(0))),
        backgroundColor: sorted.map(p => p.profitUSD >= 0 ? 'rgba(52,211,153,.75)' : 'rgba(248,113,113,.75)'),
        borderColor:     sorted.map(p => p.profitUSD >= 0 ? '#34d399' : '#f87171'),
        borderWidth: 1.5, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'x',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmtC(ctx.raw,'IQD')}` }, bodyFont: { family: 'Noto Sans Arabic' } }
      },
      scales: {
        x: { ticks: { color: '#8896b3', font: { family: 'Noto Sans Arabic', size: 11 } }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: { ticks: { color: '#8896b3', font: { family: 'Noto Sans Arabic', size: 10 }, callback: v => fmtShort(v) }, grid: { color: 'rgba(255,255,255,.06)' } }
      }
    }
  });
}

const MONTH_NAMES_KU = ['کانوونی دووەم','شوبات','ئازار','نیسان','ئایار','حوزەیران','تەممووز','ئاب','ئەیلوول','تشرینی یەکەم','تشرینی دووەم','کانوونی یەکەم'];

// ============================================================
// ===== ADD PRODUCT PAGE =====
// ============================================================
function renderAddProduct() {
  fillSupplierSelect();
  const apDate = el('apDate');
  if (apDate && !apDate.value) apDate.value = today();
  apCurrChange();
}

function apCurrChange() {
  const curr = v('apBuyCurrency');
  const box  = el('apDualBox');
  if (!box) return;
  if (curr === 'USD') {
    box.innerHTML = '';
  } else {
    const rate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
    box.innerHTML = `
      <div class="dual-cur-box" style="margin-top:8px;margin-bottom:8px">
        <div class="dual-side">
          <div class="dual-label">?? ??? ??? (${curr})</div>
          <div class="dr-amount bad" id="apLocalShow" style="font-size:13px;padding:6px 0;word-break:break-all">?</div>
        </div>
        <div class="dual-arrow">?</div>
        <div class="dual-side">
          <div class="dual-label">?? ???????? USD</div>
          <div class="fg" style="margin-top:4px">
            <input id="apUSD" type="number" step="0.01" placeholder="?????????" inputmode="decimal"
              onchange="apCalcFromUSD()"
              style="background:var(--bg3);border:1.5px solid var(--ok);color:var(--ok);font-weight:700">
          </div>
          <div class="fg" style="margin-top:4px">
            <label style="font-size:10px;color:var(--muted)">1$=? ${curr}</label>
            <input id="apRate" type="number" step="0.01" placeholder="${fmtN(rate,0)}" inputmode="decimal"
              oninput="apCalc()"
              style="background:var(--bg3);border:1.5px dashed var(--border2)">
          </div>
        </div>
      </div>`;
  }
  apCalc();
}

function apCalc() {
  const price  = fv('apBuyPrice');
  const curr   = v('apBuyCurrency') || 'USD';
  const raseed = fv('apRaseed'), omola = fv('apOmola');

  if (!price) { el('apPreview').innerHTML = ''; return; }

  let totalUSD, rate;
  if (curr === 'USD') {
    totalUSD = price; rate = 1;
  } else {
    const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
    const customRate = parseFloat(el('apRate')?.value) || 0;
    rate = customRate > 0 ? customRate : autoRate;
    totalUSD = price / rate;
    const show = el('apLocalShow');
    if (show) show.textContent = fmtC(price, curr);
    const usdInp = el('apUSD');
    if (usdInp) usdInp.value = parseFloat(totalUSD.toFixed(2));
  }

  const raseedUSD = curr === 'USD' ? raseed : raseed / rate;
  const omolaUSD = curr === 'USD' ? omola : omola / rate;
  const grandTotal = totalUSD + raseedUSD + omolaUSD;

  el('apPreview').innerHTML = `
    <div class="sum-box" style="padding:10px">
      <div class="sum-row"><span class="lbl">?? ??? USD</span><span class="val tok">${fmtC(totalUSD,'USD')}</span></div>
      ${raseed>0?`<div class="sum-row"><span class="lbl">?? ?????</span><span class="val tbad">${fmtC(raseedUSD,'USD')}</span></div>`:''}
      ${omola>0?`<div class="sum-row"><span class="lbl">?? ??????</span><span class="val tbad">${fmtC(omolaUSD,'USD')}</span></div>`:''}
      ${(raseed>0||omola>0)?`<div class="sum-total"><span>??? ?????</span><span class="tbad">${fmtC(grandTotal,'USD')}</span></div>`:''}
    </div>`;
}

function apCalcFromUSD() {
  const usdVal = parseFloat(el('apUSD')?.value) || 0;
  const curr   = v('apBuyCurrency');
  if (curr === 'USD' || !usdVal) return;
  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = parseFloat(el('apRate')?.value) || 0;
  const rate = customRate > 0 ? customRate : autoRate;
  const localAmt = usdVal * rate;
  const priceInp = el('apBuyPrice');
  if (priceInp) priceInp.value = parseFloat(localAmt.toFixed(2));
  apCalc();
}

function doAddProduct() {
  const name = v('apName').trim();
  if (!name) return showA('addProdAlert', 'bad', '?? ???? ???? ???? ???');
  const qty = fv('apQty');
  if (qty <= 0) return showA('addProdAlert', 'bad', '?? ??? ????? ???? ???');
  const totalPrice = fv('apBuyPrice');
  if (totalPrice < 0) return showA('addProdAlert', 'bad', '?? ??? ????????');
  const curr = v('apBuyCurrency') || 'IQD';
  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = curr === 'USD' ? 1 : (parseFloat(el('apRate')?.value) || 0);
  const rateSnapshot = customRate > 0 ? customRate : autoRate;
  const raseed = fv('apRaseed');
  const omola = fv('apOmola');
  const date = v('apDate') || today();
  const supplier = v('apSupplier');
  const note = v('apNote');

  const prod = addProduct({
    name, qty, unit: v('apUnit') || '????',
    buyPrice: totalPrice, buyCurrency: curr,
    supplier, buyDate: date, note,
  });

  if (totalPrice > 0) {
    addEvent({ productId: prod.id, type: 'load', qty,
      totalPrice, unitPrice: qty > 0 ? totalPrice / qty : 0,
      currency: curr, rateSnapshot, supplier, date, note });
  }
  if (raseed > 0) {
    addEvent({ productId: prod.id, type: 'raseed',
      amount: raseed, currency: curr, rateSnapshot, date,
      note: '????? ? ' + name });
  }
  if (omola > 0) {
    addEvent({ productId: prod.id, type: 'omola',
      amount: omola, currency: curr, rateSnapshot, date,
      note: '?????? ? ' + name });
  }

  ['apName','apQty','apBuyPrice','apRaseed','apOmola','apNote']
    .forEach(id => { const e = el(id); if (e) e.value = ''; });
  el('apPreview').innerHTML = '';
  el('apDualBox').innerHTML = '';
  showA('addProdAlert', 'ok', '? ???? ???????!');
  setTimeout(() => showPage('products'), 1000);
}
// ============================================================
// ===== PRODUCTS LIST =====
// ============================================================
let currentSearch = '';

function renderProducts() {
  const total = getProducts().length;
  const badge = el('sbProdBadge');
  if (badge) badge.textContent = total || '';

  const fs = el('filterSupplier');
  if (fs) {
    const cur  = fs.value;
    const supps = [...new Set(getProducts().map(p => p.supplier).filter(Boolean))];
    fs.innerHTML = `<option value="">🏪 هەموو فرۆشیار</option>` +
      supps.map(s => `<option value="${s}">${s}</option>`).join('');
    if (cur) fs.value = cur;
  }
  applyFilters();
}

function applyFilters() {
  let prods = getProducts();
  const term = currentSearch.toLowerCase().trim();
  const supp = (el('filterSupplier')?.value) || '';
  const sort = (el('filterSort')?.value) || 'date_desc';
  const debt = (el('filterDebt')?.value) || '';

  if (term) prods = prods.filter(p => p.name.toLowerCase().includes(term) || (p.supplier || '').toLowerCase().includes(term));
  if (supp) prods = prods.filter(p => p.supplier === supp);

  const needStats = (debt || sort === 'profit_desc' || sort === 'qty_asc');
  const statsMap = {};
  if (needStats) prods.forEach(p => { statsMap[p.id] = getProductStats(p.id); });

  if (debt === 'has_debt') prods = prods.filter(p => statsMap[p.id].debtRemainUSD > 0.001);
  if (debt === 'no_debt') prods = prods.filter(p => statsMap[p.id].debtRemainUSD <= 0.001);

  if (sort === 'name_asc') prods.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'profit_desc') prods.sort((a, b) => statsMap[b.id].profitUSD - statsMap[a.id].profitUSD);
  else if (sort === 'qty_asc') prods.sort((a, b) => statsMap[a.id].stockQty - statsMap[b.id].stockQty);
  else prods.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);

  const all = getProducts().length;
  const fc = el('filterCount');
  if (fc) fc.textContent = prods.length !== all ? `${prods.length} ?? ${all} ????` : `${all} ????`;

  renderProductsList(prods);
}

function searchProducts(q) {
  currentSearch = q;
  currentPage = 1;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => applyFilters(), 200);
}

function renderProductsList(prods) {
  if (!prods.length) {
    el('prodsList').innerHTML = `<div class="empty"><span class="ei">??</span>??? ??????? ???????????<br>
      <button class="btn btn-p mt8" onclick="showPage('addProduct')">? ????? ???</button></div>`;
    return;
  }
  const totalPages = Math.ceil(prods.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageProds = prods.slice(start, start + PAGE_SIZE);

  let paginationHTML = '';
  if (totalPages > 1) {
    paginationHTML = `<div class="pagination">
      <button class="pg-btn" onclick="goPage(${currentPage-1})" ${currentPage<=1?'disabled':''}>?</button>
      <span class="pg-info">${currentPage} ?? ${totalPages}</span>
      <button class="pg-btn" onclick="goPage(${currentPage+1})" ${currentPage>=totalPages?'disabled':''}>?</button>
    </div>`;
  }

  el('prodsList').innerHTML = pageProds.map(p => renderProdCard(p)).join('') + paginationHTML;
}

function goPage(n) {
  currentPage = n;
  applyFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderProdCard(p) {
  const s = getProductStats(p.id);
  const hasDebt = s.debtRemainUSD > 0.001;
  const stock = s.stockQty;
  const noStock = stock <= 0;
  const lowStock = stock > 0 && stock <= 5;

  const cardClass = ['prod-card', noStock ? 'pc-no-stock' : lowStock ? 'pc-low-stock' : '', hasDebt ? 'pc-has-debt' : ''].filter(Boolean).join(' ');

  const stockBadge = noStock
    ? `<span class="pcs-badge pcs-bad">? ??????</span>`
    : lowStock
    ? `<span class="pcs-badge pcs-warn">?? ${fmtN(stock,2)} ${p.unit}</span>`
    : `<span class="pcs-badge pcs-gray">${fmtN(stock,2)} ${p.unit}</span>`;

  const profitBadge = `<span class="pcs-badge ${s.profitUSD>=0?'pcs-ok':'pcs-bad'}">${s.profitUSD>=0?'??':'??'} ${fmtC(s.profitUSD,'USD')}</span>`;

  return `<div class="${cardClass}" id="pcard-${p.id}">
    <div class="pcs-row">
      <div class="pcs-left" onclick="toggleProd(${p.id})">
        <div class="pcs-name">${escHtml(p.name)}${hasDebt ? ` <span class="pcs-badge pcs-warn" style="font-size:8px;padding:1px 5px">??</span>` : ''}</div>
        <div class="pcs-sub">${escHtml(p.supplier) || '?? ???????'}</div>
        <div class="pcs-meta" style="font-size:10px;color:var(--faint);margin-top:2px">${p.buyDate || ''}</div>
      </div>
      <div class="pcs-right">
        ${stockBadge}
        ${profitBadge}
        <button class="pcs-btn pcs-sell" onclick="quickOpenTab(${p.id},'sell')" title="??????">??</button>
        <button class="pcs-btn pcs-load" onclick="quickOpenTab(${p.id},'load')" title="???????">??</button>
        <button class="pcs-btn" onclick="openEditProduct(${p.id})" title="????????" style="background:rgba(251,191,36,.15)">??</button>
        <button class="pcs-btn pcs-more" onclick="toggleProd(${p.id})" title="?????">?</button>
      </div>
    </div>
    <div class="pc-body" id="pc-body-${p.id}">
      <div class="pc-tabs">
        <div class="pc-tab active" data-tab="summary" onclick="switchProdTab(${p.id},'summary',this)">?????</div>
        <div class="pc-tab" data-tab="load" onclick="switchProdTab(${p.id},'load',this)">???</div>
        <div class="pc-tab" data-tab="costs" onclick="switchProdTab(${p.id},'costs',this)">?????</div>
        <div class="pc-tab" data-tab="sell" onclick="switchProdTab(${p.id},'sell',this)">??????</div>
        <div class="pc-tab" data-tab="debt" onclick="switchProdTab(${p.id},'debt',this)">????</div>
        <div class="pc-tab" data-tab="history" onclick="switchProdTab(${p.id},'history',this)">?????</div>
        <div class="pc-tab" data-tab="print" onclick="switchProdTab(${p.id},'print',this)">?????</div>
      </div>
      <div class="pc-content" id="pc-content-${p.id}">
        ${renderProdSummary(p.id, s)}
      </div>
    </div>
  </div>`;
}

function quickOpenTab(id, tab) {
  if (typeof event !== 'undefined') event.stopPropagation();
  const body = el('pc-body-' + id); if (!body) return;
  if (!body.classList.contains('open')) body.classList.add('open');
  switchProdTab(id, tab, body.querySelector(`.pc-tab[data-tab="${tab}"]`));
  setTimeout(() => {
    const card = el('pcard-' + id);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

function toggleProd(id) {
  const body = el('pc-body-' + id); if (!body) return;
  const activeTab = body.querySelector('.pc-tab.active');
  const activeTabName = activeTab?.getAttribute('data-tab') || 'summary';
  body.classList.toggle('open');

  if (body.classList.contains('open')) {
    const s = getProductStats(id);
    const p = getProduct(id);
    const content = el('pc-content-' + id);
    const map = { summary: renderProdSummary, load: renderProdLoad, costs: renderProdCosts, sell: renderProdSell, debt: renderProdDebt, history: renderProdHistory, print: renderProdPrint };
    content.innerHTML = (map[activeTabName] || renderProdSummary)(id, p, s);
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

// ============================================================
// ---- SUMMARY TAB ----
// ============================================================
function renderProdSummary(id, p, s) {
  if (!s) { s = p; p = null; }

  const pct = s.soldCostUSD > 0
    ? Math.min(100, Math.max(0, (s.totalRevenueUSD / s.soldCostUSD) * 100))
    : (s.totalCostUSD > 0 ? Math.min(100, Math.max(0, (s.totalRevenueUSD / s.totalCostUSD) * 100)) : 0);

  const f = (usd) => `<span class="val-usd">${fmtC(usd,'USD')}</span><span class="val-iqd">${fmtC(fromUSD(usd,'IQD'),'IQD')}</span>`;

  const debtRemainUSD = s.debtRemainUSD;
  return `
    <div class="grid-2">
      <div class="sum-box">
        <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:10px;letter-spacing:.5px">?? ?????? ???????</div>
        <div class="sum-row"><span class="lbl">?? ????? ????</span><span>${f(s.loadCostUSD)}</span></div>
        <div class="sum-row"><span class="lbl">?? ???? ???</span><span>${f(s.shippingUSD)}</span></div>
        <div class="sum-row"><span class="lbl">??? ???</span><span>${f(s.taxUSD)}</span></div>
        ${s.raseedUSD>0?`<div class="sum-row"><span class="lbl">?? ?????</span><span>${f(s.raseedUSD)}</span></div>`:''}
        ${s.omolaUSD>0?`<div class="sum-row"><span class="lbl">?? ??????</span><span>${f(s.omolaUSD)}</span></div>`:''}
        <div class="sum-row"><span class="lbl">??? ?????</span><span class="tbad">${f(s.totalCostUSD)}</span></div>
        ${s.unitCostUSD>0?`<div class="sum-row"><span class="lbl" style="font-size:10px;color:var(--faint)">???? ????? ${p?.unit||'????'}</span><span style="font-size:11px;color:var(--muted)">${fmtC(s.unitCostUSD,'USD')}</span></div>`:''}
        <div class="sum-row"><span class="lbl fw8">?? ?????? ???????</span><span class="tbad fw8">${f(s.soldCostUSD)}</span></div>
        <div class="divider"></div>
        <div class="sum-row"><span class="lbl">?? ????</span><span class="tok">${f(s.cashRevenueUSD)}</span></div>
        <div class="sum-row"><span class="lbl">?? ????</span><span class="twarn">${f(s.debtRevenueUSD)}</span></div>
        <div class="sum-row"><span class="lbl fw8">??? ?????</span><span class="tok fw8">${f(s.totalRevenueUSD)}</span></div>
        <div class="sum-total"><span>${s.profitUSD >= 0 ? '?? ??????' : '?? ?????'}</span>
          <span class="${s.profitUSD >= 0 ? 'tok' : 'tbad'} fw8">${f(s.profitUSD)}</span>
        </div>
      </div>
      <div>
        <div class="sum-box" style="margin-bottom:12px">
          <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:10px;letter-spacing:.5px">?? ??????? ????</div>
          <div class="sum-row"><span class="lbl">???????</span><span class="val">${fmtN(s.totalLoadedQty,2)}</span></div>
          <div class="sum-row"><span class="lbl">????????</span><span class="val">${fmtN(s.totalSoldQty,2)}</span></div>
          <div class="sum-row"><span class="lbl fw8">?????? (event)</span><span class="val fw8">${fmtN(s.stockQty,2)}</span></div>
          ${s.remainingStockValueUSD>0?`<div class="sum-row"><span class="lbl" style="font-size:10px;color:var(--faint)">?? ???? ????</span><span style="font-size:11px;color:var(--info)">${fmtC(s.remainingStockValueUSD,'USD')}</span></div>`:''}
        </div>
        ${debtRemainUSD > 0
          ? `<div class="sum-box" style="border-color:rgba(248,113,113,.3);background:var(--bad-bg)">
              <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:8px">?? ????</div>
              <div class="sum-row"><span class="lbl">??? ????</span><span class="tbad">${f(s.debtRevenueUSD)}</span></div>
              <div class="sum-row"><span class="lbl">??????????</span><span class="tok">${f(s.debtPaidUSD)}</span></div>
              <div class="sum-total"><span>??????</span><span class="tbad">${f(debtRemainUSD)}</span></div>
            </div>`
          : `<div class="sum-box" style="border-color:rgba(52,211,153,.3);background:var(--ok-bg)"><div style="text-align:center;color:var(--ok);font-weight:700;padding:8px">? ??? ?????? ????</div></div>`
        }
      </div>
    </div>
    <div style="margin-top:12px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:5px;font-weight:600">????? ???????????</div>
      <div class="profit-bar"><div class="profit-bar-fill" style="width:${pct}%;background:${s.profitUSD >= 0 ? 'var(--ok)' : 'var(--bad)'}"></div></div>
      <div style="font-size:10px;color:var(--muted);margin-top:3px">${fmtN(pct,1)}% ?? ?????? ???????</div>
    </div>`;
}

// ============================================================
// ---- LOAD TAB ----
// ============================================================
function renderProdLoad(id, p, s) {
  const loads = s.events.filter(e => e.type === 'load');
  const currOpts = getCurrencies().map(c => `<option value="${c.code}">${c.flag} ${c.code}</option>`).join('');
  return `
    <div class="ev-form">
      <div class="ev-form-title">?? ????????? ???</div>
      <div class="dual-cur-box">
        <div class="dual-side">
          <div class="dual-label">?? ????? ??? ???</div>
          <div class="fg2" style="margin-top:6px">
            <div class="fg"><label>??? ???</label><input id="ev-uprice-${id}" type="number" step="0.01" placeholder="0.00" inputmode="decimal" oninput="evCalcLoad(${id})"></div>
            <div class="fg"><label>????</label><select id="ev-curr-${id}" onchange="evCalcLoad(${id})">${currOpts}</select></div>
          </div>
        </div>
        <div class="dual-arrow">?</div>
        <div class="dual-side">
          <div class="dual-label">?? ???????? USD</div>
          <div class="fg2" style="margin-top:6px">
            <div class="fg"><label>???? ???????? <span style="font-size:10px;color:var(--muted)">(1$=?)</span></label>
              <input id="ev-rate-${id}" type="number" step="0.01" placeholder="?????????" inputmode="decimal" oninput="evCalcLoad(${id})" style="background:var(--bg3);border:1.5px dashed var(--border2)">
            </div>
            <div class="fg"><label>???????? USD</label>
              <input id="ev-usd-${id}" type="number" step="0.01" placeholder="?????????" inputmode="decimal" onchange="evCalcLoadFromUSD(${id})" style="background:var(--bg3);border:1.5px dashed var(--ok);color:var(--ok);font-weight:700">
            </div>
          </div>
        </div>
      </div>
      <div class="fg2" style="margin-top:8px">
        <div class="fg"><label>??</label><input id="ev-qty-${id}" type="number" step="0.001" placeholder="0" min="0" inputmode="decimal" oninput="evCalcLoad(${id})"></div>
        <div class="fg"><label>???????</label><input id="ev-supp-${id}" placeholder="???? ???????..." value="${escHtml(p.supplier||'')}"></div>
        <div class="fg"><label>??????</label><input id="ev-date-${id}" type="date" value="${today()}"></div>
        <div class="fg c2"><label>??????</label><input id="ev-note-${id}" placeholder="..."></div>
      </div>
      <div id="ev-preview-${id}" class="mt8"></div>
      <button class="btn btn-p btn-sm mt8" onclick="saveLoad(${id})">?? ??? ?????????</button>
    </div>

    <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">?????? ??????? (${loads.length})</div>
    <div class="ev-list">${loads.length ? loads.slice().reverse().map(ev => {
      const curr = ev.currency || 'USD';
      const rate = ev.rateSnapshot;
      const usd = ev.totalPrice / (rate || 1);
      return `<div class="ev-item">
        <div class="ev-icon">??</div>
        <div class="ev-info">
          <div class="ev-title">${fmtN(ev.qty,2)} ${p.unit}${ev.supplier?' ? '+ev.supplier:''}</div>
          <div class="ev-meta">
            <span class="hist-tag" style="background:rgba(248,113,113,.1);color:var(--bad)">?? ${fmtC(ev.totalPrice,curr)}</span>
            ${curr!=='USD'?`<span class="hist-tag" style="background:rgba(52,211,153,.1);color:var(--ok)">?? ${fmtC(usd,'USD')}</span>`:''}
            ${rate&&curr!=='USD'?`<span class="hist-tag">1$=${fmtN(rate,0)} ${curr}</span>`:''}
            ? ${ev.date}
          </div>
        </div>
        <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'load')">???</button>
      </div>`;
    }).join('') : '<div class="empty">??? ????? ????</div>'}</div>`;
}

function evCalcLoad(id) {
  const totalPrice = parseFloat(el('ev-uprice-'+id)?.value) || 0;
  const curr = el('ev-curr-'+id)?.value || 'IQD';
  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = parseFloat(el('ev-rate-'+id)?.value) || 0;
  const rate = customRate > 0 ? customRate : autoRate;

  const rateInp = el('ev-rate-'+id);
  if (rateInp && !rateInp.value) rateInp.placeholder = `${fmtN(autoRate,0)} (????)`;

  if (!totalPrice) { el('ev-preview-'+id).innerHTML = ''; const u = el('ev-usd-'+id); if (u) u.value = ''; return; }

  const usd = totalPrice / rate;
  const usdInp = el('ev-usd-'+id);
  if (usdInp) usdInp.value = parseFloat(usd.toFixed(2));
  _showLoadPreview(id, totalPrice, curr, usd, rate);
}

function evCalcLoadFromUSD(id) {
  const usdVal = parseFloat(el('ev-usd-'+id)?.value) || 0;
  const curr = el('ev-curr-'+id)?.value || 'IQD';
  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = parseFloat(el('ev-rate-'+id)?.value) || 0;
  const rate = customRate > 0 ? customRate : autoRate;
  if (!usdVal || !rate) return;
  const localAmt = usdVal * rate;
  const priceInp = el('ev-uprice-'+id);
  if (priceInp) priceInp.value = parseFloat(localAmt.toFixed(2));
  _showLoadPreview(id, localAmt, curr, usdVal, rate);
}

function _showLoadPreview(id, totalPrice, curr, usd, rate) {
  const qty = parseFloat(el('ev-qty-'+id)?.value) || 0;
  el('ev-preview-'+id).innerHTML = `
    <div class="dual-receipt">
      <div class="dr-row">
        <div class="dr-side">
          <div class="dr-label">?? ????? ??? ???</div>
          <div class="dr-amount bad">${fmtC(totalPrice, curr)}</div>
        </div>
        <div class="dr-rate">1$ = ${fmtN(rate,0)} ${curr}</div>
        <div class="dr-side">
          <div class="dr-label">?? ???????? USD</div>
          <div class="dr-amount ok">${fmtC(usd, 'USD')}</div>
        </div>
      </div>
      ${qty>0?`<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:6px">???? ????: ${fmtC(totalPrice/qty,curr)} = ${fmtC(usd/qty,'USD')}</div>`:''}
    </div>`;
}

function saveLoad(id) {
  const qty = parseFloat(el('ev-qty-'+id)?.value) || 0;
  const totalPrice = parseFloat(el('ev-uprice-'+id)?.value) || 0;
  const curr = el('ev-curr-'+id)?.value || 'IQD';
  if (qty <= 0) return alert('?? ??? ??? ???? ???');
  if (totalPrice <= 0) return alert('?? ??? ??? ???? ???');

  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = parseFloat(el('ev-rate-'+id)?.value) || 0;
  const rateSnapshot = customRate > 0 ? customRate : autoRate;
  const supplierUSD = parseFloat(el('ev-usd-'+id)?.value) || 0;

  addEvent({
    productId: id, type: 'load', qty,
    unitPrice: totalPrice / qty,
    totalPrice, currency: curr,
    rateSnapshot,
    supplierUSD: supplierUSD > 0 ? supplierUSD : totalPrice / rateSnapshot,
    supplier: el('ev-supp-'+id)?.value || '',
    date: el('ev-date-'+id)?.value || today(),
    note: el('ev-note-'+id)?.value || '',
  });
  updateProductQty(id, qty);
  refreshProdCard(id, 'load');
}

// ============================================================
// ---- COSTS TAB ----
// ============================================================// ============================================================
// ---- COSTS TAB ----
// ============================================================
function renderProdCosts(id, p, s) {
  const ships = s.events.filter(e => e.type === 'shipping');
  const taxes = s.events.filter(e => e.type === 'tax');
  return `
    <div class="grid-2">
      <div>
        <div class="ev-form">
          <div class="ev-form-title">?? ???? ???</div>
          ${dualAmountForm('ev-ship', id)}
          <div class="fg2" style="margin-top:8px">
            <div class="fg"><label>??????</label><input id="ev-shipdate-${id}" type="date" value="${today()}"></div>
            <div class="fg"><label>??????</label><input id="ev-shipnote-${id}" placeholder="..."></div>
          </div>
          <button class="btn btn-p btn-sm mt8" onclick="saveCost(${id},'shipping')">? ????????</button>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">?????? ??? (${ships.length})</div>
        <div class="ev-list">${ships.length ? ships.slice().reverse().map(ev => `
          <div class="ev-item">
            <div class="ev-icon">??</div>
            <div class="ev-info"><div class="ev-title">???? ???</div><div class="ev-meta">${ev.date}${ev.rateSnapshot&&ev.currency!=='USD'?' ? 1$='+fmtN(ev.rateSnapshot,0)+' '+ev.currency:''}${ev.note?' ? '+escHtml(ev.note):''}</div></div>
            <div style="text-align:left">
              <div class="tbad fw8" style="font-size:12px">${fmtC(ev.amount,ev.currency)}</div>
              ${ev.currency!=='USD'?`<div style="font-size:10px;color:var(--ok)">? ${fmtC(ev.amount/(ev.rateSnapshot||1),'USD')}</div>`:''}
            </div>
            <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'costs')">???</button>
          </div>`).join('') : '<div class="empty">??? ?????? ????</div>'}</div>
      </div>
      <div>
        <div class="ev-form">
          <div class="ev-form-title">??? ???</div>
          ${dualAmountForm('ev-tax', id)}
          <div class="fg2" style="margin-top:8px">
            <div class="fg"><label>??????</label><input id="ev-taxdate-${id}" type="date" value="${today()}"></div>
            <div class="fg"><label>???</label><input id="ev-taxnote-${id}" placeholder="???? ???..."></div>
          </div>
          <button class="btn btn-p btn-sm mt8" onclick="saveCost(${id},'tax')">? ????????</button>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">?????? ??? (${taxes.length})</div>
        <div class="ev-list">${taxes.length ? taxes.slice().reverse().map(ev => `
          <div class="ev-item">
            <div class="ev-icon">???</div>
            <div class="ev-info"><div class="ev-title">???${ev.note?' ? '+escHtml(ev.note):''}</div><div class="ev-meta">${ev.date}${ev.rateSnapshot&&ev.currency!=='USD'?' ? 1$='+fmtN(ev.rateSnapshot,0)+' '+ev.currency:''}</div></div>
            <div style="text-align:left">
              <div class="tbad fw8" style="font-size:12px">${fmtC(ev.amount,ev.currency)}</div>
              ${ev.currency!=='USD'?`<div style="font-size:10px;color:var(--ok)">? ${fmtC(ev.amount/(ev.rateSnapshot||1),'USD')}</div>`:''}
            </div>
            <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'costs')">???</button>
          </div>`).join('') : '<div class="empty">??? ????? ????</div>'}</div>
      </div>
    </div>
    ${renderExtraSection(id,'raseed','?????','??', s.events.filter(e=>e.type==='raseed'))}
    ${renderExtraSection(id,'omola','??????','??', s.events.filter(e=>e.type==='omola'))}`;
}

function saveCost(id, type) {
  const isShip = (type === 'shipping');
  const prefix = isShip ? 'ev-ship' : 'ev-tax';
  const { amt, curr, rate } = calcDualPreview(prefix, id);
  const date = el(`${prefix}date-${id}`)?.value || today();
  const note = el(`${prefix}note-${id}`)?.value || '';
  if (amt <= 0) return alert('?? ??? ???? ???? ???');
  addEvent({ productId: id, type, amount: amt, currency: curr, date, note, rateSnapshot: rate });
  refreshProdCard(id, 'costs');
}

function saveExtra(id, type) {
  const prefix = `ev-${type}`;
  const { amt, curr, rate } = calcDualPreview(prefix, id);
  const date = el(`${prefix}date-${id}`)?.value || today();
  const note = el(`${prefix}note-${id}`)?.value || '';
  if (amt <= 0) return alert('?? ??? ???? ???? ???');
  addEvent({ productId: id, type, amount: amt, currency: curr, date, note, rateSnapshot: rate });
  refreshProdCard(id, 'costs');
}

function dualAmountForm(prefix, id) {
  const currOpts = getCurrencies().map(c => `<option value="${c.code}"${c.code==='USD'?' selected':''}>${c.flag} ${c.code}</option>`).join('');
  return `
    <div class="fg2">
      <div class="fg"><label>??</label>
        <input id="${prefix}-${id}" type="number" step="0.01" placeholder="0.00" inputmode="decimal" oninput="onDualAmt('${prefix}',${id})">
      </div>
      <div class="fg"><label>????</label>
        <select id="${prefix}curr-${id}" onchange="onDualCurrChange('${prefix}',${id})">${currOpts}</select>
      </div>
    </div>
    <div id="${prefix}dual-${id}"></div>`;
}

function onDualCurrChange(prefix, id) {
  const curr = el(`${prefix}curr-${id}`)?.value || 'USD';
  const dualDiv = el(`${prefix}dual-${id}`);
  if (!dualDiv) return;
  if (curr === 'USD') {
    dualDiv.innerHTML = '';
  } else {
    const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
    dualDiv.innerHTML = `
      <div class="dual-cur-box" style="margin-top:8px">
        <div class="dual-side">
          <div class="dual-label">?? ??? ???? (${curr})</div>
          <div class="dr-amount bad" id="${prefix}localshow-${id}" style="font-size:13px;padding:6px 0;word-break:break-all">?</div>
        </div>
        <div class="dual-arrow">?</div>
        <div class="dual-side">
          <div class="dual-label">?? ???????? USD</div>
          <div class="fg" style="margin-top:4px">
            <input id="${prefix}usd-${id}" type="number" step="0.01" placeholder="?????????" inputmode="decimal"
              onchange="onDualUSD('${prefix}',${id})"
              style="background:var(--bg3);border:1.5px solid var(--ok);color:var(--ok);font-weight:700">
          </div>
          <div class="fg" style="margin-top:4px">
            <label style="font-size:10px;color:var(--muted)">1$=? ${curr}</label>
            <input id="${prefix}rate-${id}" type="number" step="0.01" placeholder="${fmtN(autoRate,0)}" inputmode="decimal"
              oninput="onDualAmt('${prefix}',${id})"
              style="background:var(--bg3);border:1.5px dashed var(--border2)">
          </div>
        </div>
      </div>`;
  }
  onDualAmt(prefix, id);
}

function onDualAmt(prefix, id) {
  const amt = parseFloat(el(`${prefix}-${id}`)?.value) || 0;
  const curr = el(`${prefix}curr-${id}`)?.value || 'USD';
  if (curr === 'USD') return;
  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = parseFloat(el(`${prefix}rate-${id}`)?.value) || 0;
  const rate = customRate > 0 ? customRate : autoRate;
  const usd = amt > 0 ? amt / rate : 0;
  const usdInp = el(`${prefix}usd-${id}`);
  if (usdInp) usdInp.value = usd > 0 ? parseFloat(usd.toFixed(2)) : '';
  const show = el(`${prefix}localshow-${id}`);
  if (show) show.textContent = amt > 0 ? fmtC(amt, curr) : '?';
}

function onDualUSD(prefix, id) {
  const usd = parseFloat(el(`${prefix}usd-${id}`)?.value) || 0;
  const curr = el(`${prefix}curr-${id}`)?.value || 'IQD';
  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = parseFloat(el(`${prefix}rate-${id}`)?.value) || 0;
  const rate = customRate > 0 ? customRate : autoRate;
  const localAmt = usd * rate;
  const amtInp = el(`${prefix}-${id}`);
  if (amtInp) amtInp.value = localAmt > 0 ? parseFloat(localAmt.toFixed(2)) : '';
  const show = el(`${prefix}localshow-${id}`);
  if (show) show.textContent = localAmt > 0 ? fmtC(localAmt, curr) : '?';
}

function calcDualPreview(prefix, id) {
  const amt = parseFloat(el(`${prefix}-${id}`)?.value) || 0;
  const curr = el(`${prefix}curr-${id}`)?.value || 'USD';
  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = parseFloat(el(`${prefix}rate-${id}`)?.value) || 0;
  const rate = customRate > 0 ? customRate : autoRate;
  return { amt, curr, rate, usd: curr === 'USD' ? amt : amt / rate };
}

function renderExtraSection(id, type, title, icon, events) {
  const prefix = `ev-${type}`;
  return `
    <div class="ev-form" style="margin-top:10px">
      <div class="ev-form-title">${icon} ${title}</div>
      ${dualAmountForm(prefix, id)}
      <div class="fg2" style="margin-top:8px">
        <div class="fg"><label>??????</label><input id="${prefix}date-${id}" type="date" value="${today()}"></div>
        <div class="fg"><label>??????</label><input id="${prefix}note-${id}" placeholder="..."></div>
      </div>
      <button class="btn btn-p btn-sm mt8" onclick="saveExtra(${id},'${type}')">? ????????</button>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);margin:8px 0 6px">????? (${events.length})</div>
    <div class="ev-list">${events.length ? events.slice().reverse().map(ev => `
      <div class="ev-item">
        <div class="ev-icon">${icon}</div>
        <div class="ev-info"><div class="ev-title">${title}${ev.note?' ? '+escHtml(ev.note):''}</div>
          <div class="ev-meta">${ev.date}${ev.rateSnapshot&&ev.currency!=='USD'?' ? 1$='+fmtN(ev.rateSnapshot,0)+' '+ev.currency:''}</div>
        </div>
        <div style="text-align:left">
          <div class="tbad fw8" style="font-size:12px">${fmtC(ev.amount,ev.currency)}</div>
          ${ev.currency!=='USD'?`<div style="font-size:10px;color:var(--ok)">? ${fmtC(ev.amount/(ev.rateSnapshot||1),'USD')}</div>`:''}
        </div>
        <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'costs')">???</button>
      </div>`).join('') : '<div class="empty">??? ???? ????</div>'}</div>`;
}

// ============================================================
// ---- SELL TAB ----
// ============================================================// ============================================================
// ---- SELL TAB ----
// ============================================================
function renderProdSell(id, p, s) {
  const sells = s.events.filter(e => e.type === 'sell_cash' || e.type === 'sell_debt');
  const currOpts = getCurrencies().map(c => `<option value="${c.code}">${c.flag} ${c.code}</option>`).join('');

  const costPerUnitUSD = s.unitCostUSD || 0;
  const suggestHint = costPerUnitUSD > 0
    ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <span style="font-size:11px;color:var(--muted);flex-shrink:0">?? ???:</span>
        ${[1.05,1.1,1.15,1.2].map(m => {
          const p2 = fromUSD(costPerUnitUSD * m, 'IQD');
          return `<button type="button" class="btn btn-xs btn-g" onclick="setSuggestedPrice(${id},${p2.toFixed(0)})">
            ${fmtC(p2,'IQD')} <span style="color:var(--ok);font-size:9px">+${Math.round((m-1)*100)}%</span>
          </button>`;
        }).join('')}
      </div>` : '';

  const prevCustomers = getCustomerStats().slice(0, 5);
  const customerHint = prevCustomers.length
    ? `<div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:5px">?? ?????? ?????:</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${prevCustomers.map(c => `<button type="button" class="btn btn-xs btn-g" data-cname="${escHtml(c.name)}" data-cphone="${escHtml(c.phone)}" onclick="fillSellCustomer(${id},this.dataset.cname,this.dataset.cphone)">
            ${escHtml(c.name)}${c.phone?' ? '+escHtml(c.phone):''}
          </button>`).join('')}
        </div>
      </div>` : '';

  return `
    <div class="ev-form">
      <div class="ev-form-title">?? ??????</div>
      ${suggestHint}
      <div class="fg2" style="margin-bottom:8px">
        <div class="fg"><label>?? *</label><input id="ev-sqty-${id}" type="number" step="0.001" placeholder="0" inputmode="decimal" oninput="evCalcSell(${id})"></div>
        <div class="fg"><label>???? ???????</label>
          <select id="ev-spay-${id}" onchange="toggleDueDateField(${id},this.value)">
            <option value="sell_cash">?? ????</option>
            <option value="sell_debt">?? ????</option>
          </select>
        </div>
      </div>
      <div class="dual-cur-box">
        <div class="dual-side">
          <div class="dual-label">?? ????? ????? ?????</div>
          <div class="fg2" style="margin-top:6px">
            <div class="fg"><label>???? ????</label><input id="ev-sprice-${id}" type="number" step="0.01" placeholder="0.00" inputmode="decimal" oninput="evCalcSell(${id})"></div>
            <div class="fg"><label>????</label><select id="ev-scurr-${id}" onchange="evCalcSell(${id})">${currOpts}</select></div>
          </div>
        </div>
        <div class="dual-arrow">?</div>
        <div class="dual-side">
          <div class="dual-label">?? ???????? USD</div>
          <div class="fg2" style="margin-top:6px">
            <div class="fg"><label>???? ???????? <span style="font-size:10px;color:var(--muted)">(1$=?)</span></label>
              <input id="ev-srate-${id}" type="number" step="0.01" placeholder="?????????" inputmode="decimal" oninput="evCalcSell(${id})" style="background:var(--bg3);border:1.5px dashed var(--border2)">
            </div>
            <div class="fg"><label>??? USD</label>
              <input id="ev-susd-${id}" readonly placeholder="?????????" style="background:var(--bg3);border:1.5px solid var(--ok);color:var(--ok);font-weight:700;cursor:default">
            </div>
          </div>
        </div>
      </div>
      ${customerHint}

      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:12px;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">??? ???????? (??????????????)</div>
        <div class="fg2">
          <div class="fg">
            <label>???? ????????</label>
            <select id="ev-sdtype-${id}" onchange="evCalcSell(${id})">
              <option value="">? ?? ???????? ?</option>
              <option value="percent">? ????</option>
              <option value="amount">?? ??? ????</option>
            </select>
          </div>
          <div class="fg">
            <label id="ev-sdlbl-${id}">??? ????????</label>
            <input id="ev-sdval-${id}" type="number" step="0.01" min="0" placeholder="0"
              inputmode="decimal" oninput="evCalcSell(${id})"
              style="background:var(--bg3);border:1.5px solid var(--warn);color:var(--warn);font-weight:700"
              disabled>
          </div>
        </div>
        <div id="ev-discount-preview-${id}" style="font-size:12px;color:var(--muted);margin-top:4px"></div>
      </div>

      <div class="fg2">
        <div class="fg"><label>???? ?????</label><input id="ev-sbuyer-${id}" placeholder="???? ?????..."></div>
        <div class="fg"><label>??????? *</label><input id="ev-sphone-${id}" placeholder="07XXXXXXXXX" type="tel" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9+]/g,'')"></div>
        <div class="fg"><label>??????</label><input id="ev-sdate-${id}" type="date" value="${today()}"></div>
        <div class="fg" id="ev-duedate-wrap-${id}" style="display:none">
          <label style="color:var(--warn)">? ??????? ?????? ????</label>
          <input id="ev-sduedate-${id}" type="date">
        </div>
        <div class="fg c2"><label>??????</label><input id="ev-snote-${id}" placeholder="..."></div>
      </div>
      <div id="ev-sellpreview-${id}" class="mt8"></div>
      <button class="btn btn-ok btn-sm mt8" style="width:100%;justify-content:center" onclick="saveSell(${id})">?? ?????? ?????????</button>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">?????? ?????? (${sells.length})</div>
    <div class="ev-list">${sells.length ? sells.slice().reverse().map(ev => {
      const rate = ev.rateSnapshot;
      const curr = ev.currency || 'USD';
      const rateInfo = (rate && curr !== 'USD') ? ` ? <span style="color:var(--muted)">1$=${fmtN(rate,0)} ${curr}</span>` : '';
      const hasDiscount = ev.discountAmount > 0;
      const discountTag = hasDiscount ? ` ? <span class="badge b-warn" style="font-size:9px">??? -${ev.discountType==='percent' ? fmtN(ev.discountValue,1)+'%' : fmtC(ev.discountAmount,curr)}</span>` : '';
      return `<div class="ev-item">
        <div class="ev-icon">${ev.type==='sell_cash'?'??':'??'}</div>
        <div class="ev-info">
          <div class="ev-title">
            <span style="color:var(--ok);font-weight:800">${fmtN(ev.qty,2)} ${p.unit}</span>
            <span style="color:var(--muted);font-weight:400;font-size:11px"> ? ${fmtC(ev.unitPrice,curr)}</span>
            ${ev.buyer?' ? '+escHtml(ev.buyer):''}${ev.phone?' ? ??'+escHtml(ev.phone):''}
          </div>
          <div class="ev-meta">
            ${ev.date}
            ? <span class="badge ${ev.type==='sell_cash'?'b-ok':'b-warn'}">${ev.type==='sell_cash'?'????':'????'}</span>
            ${rateInfo}${discountTag}
            ${ev.dueDate?' ? <span class="badge '+getDueBadgeClass(ev.dueDate)+'">? '+formatDueDate(ev.dueDate)+'</span>':''}
          </div>
        </div>
        <div style="text-align:left;flex-shrink:0">
          ${hasDiscount ? `<div style="font-size:10px;color:var(--faint);text-decoration:line-through">${fmtC(ev.rawTotal,curr)}</div>` : ''}
          <div class="ev-amount ${ev.type==='sell_cash'?'tok':'twarn'}">${fmtDual(ev.totalPrice,curr,rate)}</div>
        </div>
        <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'sell')">???</button>
      </div>`;
    }).join('') : '<div class="empty">??? ???????? ????</div>'}</div>`;
}

function toggleDueDateField(id, type) {
  const wrap = el('ev-duedate-wrap-' + id);
  if (wrap) wrap.style.display = type === 'sell_debt' ? '' : 'none';
}

function fillSellCustomer(id, name, phone) {
  const nb = el('ev-sbuyer-'+id); if (nb) nb.value = name;
  const pb = el('ev-sphone-'+id); if (pb) pb.value = phone;
}

function setSuggestedPrice(id, price) {
  const inp = el('ev-sprice-'+id);
  const curr = el('ev-scurr-'+id);
  if (inp) inp.value = price;
  if (curr) curr.value = 'IQD';
  evCalcSell(id);
}

function evCalcSell(id) {
  const qty = parseFloat(el('ev-sqty-'+id)?.value) || 0;
  const pr = parseFloat(el('ev-sprice-'+id)?.value) || 0;
  const curr = el('ev-scurr-'+id)?.value || 'IQD';

  const dtype = el('ev-sdtype-'+id)?.value || '';
  const dvalEl = el('ev-sdval-'+id);
  const dlblEl = el('ev-sdlbl-'+id);
  if (dvalEl) dvalEl.disabled = !dtype;
  if (dlblEl) dlblEl.textContent = dtype === 'percent' ? '???? (%)' : '??? ????????';
  const dval = parseFloat(dvalEl?.value) || 0;

  if (!qty || !pr) {
    el('ev-sellpreview-'+id).innerHTML = '';
    const dp = el('ev-discount-preview-'+id); if (dp) dp.innerHTML = '';
    const u = el('ev-susd-'+id); if (u) u.value = '';
    return;
  }

  const rawTotal = qty * pr;
  let discountAmount = 0;
  if (dtype === 'percent' && dval > 0) discountAmount = rawTotal * (dval / 100);
  else if (dtype === 'amount' && dval > 0) discountAmount = dval;
  const finalTotal = rawTotal - discountAmount;

  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = parseFloat(el('ev-srate-'+id)?.value) || 0;
  const rate = customRate > 0 ? customRate : autoRate;
  const finalUSD = finalTotal / rate;

  const usdInp = el('ev-susd-'+id);
  if (usdInp) usdInp.value = parseFloat(finalUSD.toFixed(4));

  const discPrev = el('ev-discount-preview-'+id);
  if (discPrev) {
    discPrev.innerHTML = discountAmount > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0">
        <span style="color:var(--muted)">??? ?????</span>
        <span style="text-decoration:line-through;opacity:.55">${fmtC(rawTotal,curr)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0">
        <span style="color:var(--warn)">??? ????????${dtype==='percent'?' ('+fmtN(dval,1)+'%)':''}</span>
        <span style="color:var(--warn);font-weight:700">- ${fmtC(discountAmount,curr)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-top:1px solid var(--border);margin-top:2px">
        <span style="color:var(--ok);font-weight:700">??? ???</span>
        <span style="color:var(--ok);font-weight:800">${fmtC(finalTotal,curr)}</span>
      </div>` : '';
  }

  const s = getProductStats(id);
  const costPerUnit = s.unitCostUSD || 0;
  const profitTotal = (finalUSD / qty - costPerUnit) * qty;

  el('ev-sellpreview-'+id).innerHTML = `
    <div class="dual-receipt">
      <div class="dr-row">
        <div class="dr-side">
          <div class="dr-label">?? ??? ??????</div>
          <div class="dr-amount" style="color:var(--warn)">${fmtC(finalTotal,curr)}</div>
        </div>
        <div class="dr-rate">1$ = ${fmtN(rate,0)} ${curr}</div>
        <div class="dr-side">
          <div class="dr-label">?? ????????</div>
          <div class="dr-amount ok">${fmtC(finalUSD,'USD')}</div>
        </div>
      </div>
      ${costPerUnit>0?`<div style="text-align:center;font-size:11px;margin-top:6px">
        <span class="hist-tag" style="background:${profitTotal>=0?'var(--ok-bg)':'var(--bad-bg)'};color:${profitTotal>=0?'var(--ok)':'var(--bad)'}">
          ??????: ${fmtC(profitTotal,'USD')}
        </span>
      </div>`:''}
    </div>`;
}

function saveSell(id) {
  const qty = parseFloat(el('ev-sqty-'+id)?.value) || 0;
  const pr = parseFloat(el('ev-sprice-'+id)?.value) || 0;
  const curr = el('ev-scurr-'+id)?.value || 'IQD';
  const type = el('ev-spay-'+id)?.value || 'sell_cash';

  if (qty <= 0) return alert('?? ??? ???? ???? ???');
  if (pr <= 0) return alert('?? ???? ???? ???? ???');
  const sCheck = getProductStats(id);
  if (sCheck.stockQty < qty) return alert('?? ???? ??? ????! ??????: ' + fmtN(sCheck.stockQty, 2) + ' ' + (getProduct(id)?.unit || ''));

  const dtype = el('ev-sdtype-'+id)?.value || '';
  const dval = parseFloat(el('ev-sdval-'+id)?.value) || 0;
  const rawTotal = qty * pr;
  let discountAmount = 0;
  if (dtype === 'percent') {
    if (dval < 0 || dval > 100) return alert('?? ????? ???????? ????? ?? ????? 0 ? 100 ???');
    discountAmount = rawTotal * (dval / 100);
  } else if (dtype === 'amount') {
    if (dval < 0) return alert('?? ??? ???????? ????? ???? ???');
    if (dval > rawTotal) return alert('?? ???????? ????? ?? ??? ??? ????? ???');
    discountAmount = dval;
  }
  const totalPrice = rawTotal - discountAmount;
  if (totalPrice < 0) return alert('?? ??? ???? ????????');

  const buyer = el('ev-sbuyer-'+id)?.value?.trim() || '';
  const phone = el('ev-sphone-'+id)?.value?.trim() || '';
  const normPhone = normalizePhone(phone);
  if (!normPhone) return alert('?? ????? ??????? ???? ???');
  if (type === 'sell_debt' && !el('ev-sduedate-'+id)?.value) return alert('?? ??????? ?????? ???? ???? ???');

  const autoRate = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
  const customRate = parseFloat(el('ev-srate-'+id)?.value) || 0;
  const rateSnapshot = customRate > 0 ? customRate : autoRate;

  addEvent({
    productId: id, type, qty,
    unitPrice: pr,
    rawTotal,
    discountType: dtype,
    discountValue: dval,
    discountAmount,
    totalPrice,
    currency: curr, rateSnapshot,
    buyer, phone: normPhone,
    customerToken: getOrCreateCustomerToken(buyer, normPhone),
    dueDate: type === 'sell_debt' ? (el('ev-sduedate-'+id)?.value || '') : '',
    date: el('ev-sdate-'+id)?.value || today(),
    note: el('ev-snote-'+id)?.value || '',
  });
  updateProductQty(id, -qty);
  refreshProdCard(id, 'sell');
}

function getDebtorLink(buyer, phone) {
  const token = getOrCreateCustomerToken(buyer, phone);
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]+\.html$/i, '');
  return base + 'customer.html?t=' + token;
}

function getRemainingDebt(productId, token) {
  if (!token) return 0;
  const sum = getCustomerDebtSummary(token);
  if (!sum) return 0;
  const pb = sum.productBreakdown.find(x => x.prodId == productId);
  return Math.max(0, roundMoney(pb ? pb.remainUSD : 0));
}

function getCustomerProductDebt(productId, buyerName, phone) {
  const events = getEvents(productId);
  const normPhone = normalizePhone(phone);
  let owed = 0;
  events.forEach(ev => {
    const evPhone = normalizePhone(ev.phone || '');
    if (!(evPhone && evPhone === normPhone)) return;
    if (ev.type === 'sell_debt') owed += toUSD(ev.totalPrice, ev.currency);
    if (ev.type === 'debt_pay') owed -= toUSD(ev.amount, ev.currency);
  });
  return Math.max(0, roundMoney(owed));
}

// ============================================================
// ---- DEBT TAB ----
// ============================================================// ============================================================
// ---- DEBT TAB ----
// ============================================================
function renderProdDebt(id, p, s) {
  const debtPays = s.events.filter(e => e.type === 'debt_pay');
  const currOpts = getCurrencies().map(c => `<option value="${c.code}">${c.flag} ${c.code}</option>`).join('');
  const debtIQD = fromUSD(s.debtRemainUSD, 'IQD');

  const debtorMap = {};
  s.events.forEach(ev => {
    const token = ev.customerToken || makeCustomerToken(ev.buyer || '', ev.phone || '');
    const reg = lookupCustomerByToken(token);
    if (ev.type === 'sell_debt') {
      if (!debtorMap[token]) debtorMap[token] = { name: reg?.name || ev.buyer || '????????', phone: reg?.phone || normalizePhone(ev.phone || ''), token, owed: 0 };
      debtorMap[token].owed += toUSD(ev.totalPrice, ev.currency);
    }
  });
  s.events.forEach(ev => {
    const token = ev.customerToken || makeCustomerToken(ev.buyer || '', ev.phone || '');
    if (ev.type === 'debt_pay' && debtorMap[token]) debtorMap[token].owed -= toUSD(ev.amount, ev.currency);
  });
  Object.values(debtorMap).forEach(d => { d.owed = Math.max(0, roundMoney(d.owed)); });
  const debtors = Object.values(debtorMap).filter(d => d.owed > 0.001);

  const debtorCards = debtors.length ? debtors.map(d => {
    const link = getDebtorLink(d.name, d.phone);
    const safeLink = link.replace(/'/g, "\\'");
    const waMsg = encodeURIComponent(`???? ${d.name} ??\n????????: ${fmtC(d.owed,'USD')}\n?????? ????? ??????????:\n${link}`);
    const waLink = d.phone ? `https://wa.me/${d.phone.replace(/\D/g,'')}?text=${waMsg}` : '';
    return `<div style="background:var(--bg);border:1px solid rgba(248,113,113,.25);border-radius:var(--rs);padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:700">${escHtml(d.name)}</div>
          ${d.phone?`<div style="font-size:11px;color:var(--muted)">?? ${escHtml(d.phone)}</div>`:''}
        </div>
        <span class="tbad fw8">${fmtC(d.owed,'USD')}</span>
      </div>
      <div style="background:var(--bg2);border:1px dashed var(--border2);border-radius:6px;padding:7px 10px;font-size:10px;color:var(--muted);word-break:break-all;margin-bottom:8px;font-family:monospace;direction:ltr;text-align:left;cursor:pointer;user-select:all" onclick="copyLink('${safeLink}',this.nextElementSibling.querySelector('button'))" title="???? ??? ?? ????????">${link}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-p btn-sm" style="flex:1;font-size:12px;padding:8px 10px" onclick="copyLink('${safeLink}',this)">?? ????????? ????</button>
        ${waLink?`<a href="${waLink}" target="_blank" class="btn btn-sm" style="flex:1;background:#25d366;color:#fff;text-decoration:none;justify-content:center;display:flex;align-items:center;gap:5px;padding:8px 10px;border-radius:var(--rs);font-size:12px;font-weight:700;font-family:inherit">??????</a>`:''}
      </div>
    </div>`;
  }).join('') : '';

  return `
    <div class="sum-box" style="margin-bottom:14px">
      <div class="sum-row"><span class="lbl">??? ????</span><span class="val tbad">${fmtC(s.debtRevenueUSD,'USD')}</span></div>
      <div class="sum-row"><span class="lbl">??????????</span><span class="val tok">${fmtC(s.debtPaidUSD,'USD')}</span></div>
      <div class="sum-total"><span>??????</span><span class="${debtIQD>0?'tbad':'tok'}">${fmtC(s.debtRemainUSD,'USD')}</span></div>
    </div>

    ${debtorCards ? `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">?? ??????????</div>
      ${debtorCards}
    </div>` : ''}

    ${s.debtRemainUSD>0?`<div class="ev-form">
      <div class="ev-form-title">?? ?????????? ??????????</div>
      ${debtors.length ? `<div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600">?? ?????? ????????:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${debtors.map(d => `<button type="button" class="btn btn-g btn-sm" data-dname="${escHtml(d.name)}" data-dphone="${escHtml(d.phone)}" data-dowed="${d.owed.toFixed(6)}" onclick="fillDebtPay(${id},this.dataset.dname,this.dataset.dphone,this.dataset.dowed)">
            ${escHtml(d.name)}${d.phone?' ? '+escHtml(d.phone):''} <span class="tbad">(${fmtC(d.owed,'USD')})</span>
          </button>`).join('')}
        </div>
      </div>` : ''}
      <div id="ev-dpremain-${id}" style="display:none;background:var(--bad-bg);border:1px solid rgba(248,113,113,.3);border-radius:var(--rs);padding:10px 14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:var(--muted);font-weight:600">????? ????</span>
          <span id="ev-dpremain-val-${id}" class="tbad fw8" style="font-size:14px"></span>
        </div>
      </div>
      <div class="fg2">
        <div class="fg"><label>?? *</label><input id="ev-dp-${id}" type="number" step="0.01" min="0" placeholder="0.00" inputmode="decimal"></div>
        <div class="fg"><label>????</label><select id="ev-dpcurr-${id}">${currOpts}</select></div>
        <div class="fg"><label>???? ?????? *</label><input id="ev-dpbuyer-${id}" placeholder="???? ?????..."></div>
        <div class="fg"><label>????? ??????? *</label><input id="ev-dpphone-${id}" placeholder="07XX..." type="tel" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9+]/g,'')"></div>
        <div class="fg"><label>??????</label><input id="ev-dpdate-${id}" type="date" value="${today()}"></div>
        <div class="fg"><label>??????</label><input id="ev-dpnote-${id}" placeholder="?????? ?? ??????????..."></div>
      </div>
      <div id="ev-dpalert-${id}"></div>
      <button class="btn btn-ok btn-sm" style="width:100%;justify-content:center" onclick="saveDebtPay(${id})">? ?????????? ?????????</button>
    </div>`:''}
    <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">?????? ?????????? (${debtPays.length})</div>
    <div class="ev-list">${debtPays.length ? debtPays.slice().reverse().map(ev => `
      <div class="ev-item">
        <div class="ev-icon">?</div>
        <div class="ev-info">
          <div class="ev-title">${escHtml(ev.buyer)||'?'}</div>
          <div class="ev-meta">${ev.date}${ev.phone?' ? ?? <a href="tel:'+escHtml(ev.phone)+'" style="color:var(--primary);text-decoration:none">'+escHtml(ev.phone)+'</a>':''}${ev.note?' ? '+escHtml(ev.note):''}</div>
        </div>
        <div class="ev-amount tok">${fmtC(ev.amount,ev.currency)}</div>
        <button class="btn btn-bad btn-xs" onclick="delEvAndRefresh(${ev.id},${id},'debt')">???</button>
      </div>`).join('') : '<div class="empty">??? ????????????? ????</div>'}</div>`;
}

function fillDebtPay(id, buyer, phone, owedUSD) {
  const b = el('ev-dpbuyer-'+id); if (b) b.value = buyer;
  const p = el('ev-dpphone-'+id); if (p) p.value = phone;
  const owedNum = Math.max(0, roundMoney(parseFloat(owedUSD) || 0));
  const remainBox = el('ev-dpremain-'+id);
  const remainVal = el('ev-dpremain-val-'+id);
  if (remainBox && remainVal && owedNum > 0.001) {
    remainVal.innerHTML = fmtC(owedNum,'USD') + ` <span style="font-size:11px;color:var(--faint);font-weight:400">(${fmtC(fromUSD(owedNum,'IQD'),'IQD')})</span>`;
    remainBox.style.display = '';
  } else if (remainBox) { remainBox.style.display = 'none'; }
  if (owedNum > 0.001) {
    const amtInp = el('ev-dp-'+id);
    const curr = el('ev-dpcurr-'+id)?.value || 'IQD';
    if (amtInp) amtInp.value = parseFloat(fromUSD(owedNum, curr).toFixed(curr==='IQD'?0:2));
  }
}

function saveDebtPay(id) {
  const amt = parseFloat(el('ev-dp-'+id)?.value) || 0;
  const date = el('ev-dpdate-'+id)?.value || '';
  const buyer = el('ev-dpbuyer-'+id)?.value?.trim() || '';
  const phone = normalizePhone(el('ev-dpphone-'+id)?.value?.trim() || '');
  const curr = el('ev-dpcurr-'+id)?.value || 'IQD';
  const note = el('ev-dpnote-'+id)?.value || '';
  const alertId = 'ev-dpalert-'+id;

  if (amt <= 0) return showA(alertId,'bad','?? ??? ???? ???? ???');
  if (!date) return showA(alertId,'bad','?? ?????? ???? ???');
  if (!buyer) return showA(alertId,'bad','?? ???? ????? ???? ???');
  if (!phone) return showA(alertId,'bad','?? ????? ???????? ????? ???? ???');

  const token = getOrCreateCustomerToken(buyer, phone);
  if (!token) return showA(alertId,'bad','?? token ????? ?????');

  const amtUSD = roundMoney(toUSD(amt, curr));
  const customerOwedUSD = getCustomerProductDebt(id, buyer, phone);
  if (customerOwedUSD > 0.001 && amtUSD > customerOwedUSD + 0.01) {
    return showA(alertId,'bad', `?? ?????????? (${fmtC(amtUSD,'USD')}) ?????? ?? ????? "${escHtml(buyer)}" (${fmtC(customerOwedUSD,'USD')})`);
  }
  const s = getProductStats(id);
  if (amtUSD > s.debtRemainUSD + 0.01) {
    return showA(alertId,'bad', `?? ?????????? (${fmtC(amtUSD,'USD')}) ?????? ?? ??? ????? ???? (${fmtC(s.debtRemainUSD,'USD')})`);
  }

  addEvent({
    productId: id, type: 'debt_pay', amount: roundMoney(amt),
    currency: curr, date, buyer, phone, note,
    customerToken: token,
  });
  refreshProdCard(id, 'debt');
}

// ============================================================
// ---- HISTORY TAB ----
// ============================================================// ============================================================
// ---- HISTORY TAB ----
// ============================================================
function renderProdHistory(id, p, s) {
  const sorted = [...s.events].sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);

  function buildItem(ev) {
    const curr = ev.currency || 'USD';
    const rate = ev.rateSnapshot;
    const rateTag = (rate && curr !== 'USD') ? `<span class="hist-tag" style="background:rgba(79,142,247,.1);color:var(--primary)">1$=${fmtN(rate,0)} ${curr}</span>` : '';

    if (ev.type === 'load') {
      const usd = ev.totalPrice / (rate || 1);
      return `
        <div class="hist-item">
          <div class="hist-head">
            <span class="hist-icon">??</span>
            <span class="hist-type" style="color:var(--primary)">???</span>
            <span class="hist-date">${ev.date||''}</span>
          </div>
          <div class="hist-body">
            <div class="hist-row"><span class="hist-lbl">??</span><span class="hist-val ok">${fmtN(ev.qty,2)} ${p.unit}</span></div>
            <div class="hist-row"><span class="hist-lbl">???? ????</span><span class="hist-val">${fmtC(ev.unitPrice,curr)}</span></div>
            <div class="hist-row"><span class="hist-lbl">??? ???</span><span class="hist-val bad">${fmtC(ev.totalPrice,curr)}${curr!=='USD'?` <small>(? ${fmtC(usd,'USD')})</small>`:''}</span></div>
            ${ev.supplier?`<div class="hist-row"><span class="hist-lbl">???????</span><span class="hist-val">${escHtml(ev.supplier)}</span></div>`:''}
            ${rateTag}${ev.note?`<span class="hist-tag">${escHtml(ev.note)}</span>`:''}
          </div>
          <button class="btn btn-bad btn-xs hist-del" onclick="delEvAndRefresh(${ev.id},${id},'history')">???</button>
        </div>`;
    }

    if (ev.type === 'sell_cash' || ev.type === 'sell_debt') {
      const usd = ev.totalPrice / (rate || 1);
      const typeClr = ev.type === 'sell_cash' ? 'var(--ok)' : 'var(--warn)';
      const hasDisc = ev.discountAmount > 0;
      const discRow = hasDisc ? `
        <div class="hist-row"><span class="hist-lbl">??? ?????</span><span class="hist-val" style="text-decoration:line-through;opacity:.55">${fmtC(ev.rawTotal,curr)}</span></div>
        <div class="hist-row"><span class="hist-lbl" style="color:var(--warn)">??? ????????${ev.discountType==='percent'?' ('+fmtN(ev.discountValue,1)+'%)':''}</span><span class="hist-val" style="color:var(--warn)">- ${fmtC(ev.discountAmount,curr)}</span></div>` : '';
      return `
        <div class="hist-item">
          <div class="hist-head">
            <span class="hist-icon">${ev.type==='sell_cash'?'??':'??'}</span>
            <span class="hist-type" style="color:${typeClr}">${ev.type==='sell_cash'?'????':'????'}</span>
            <span class="hist-date">${ev.date||''}</span>
          </div>
          <div class="hist-body">
            <div class="hist-row"><span class="hist-lbl">??</span><span class="hist-val ok">${fmtN(ev.qty,2)} ${p.unit}</span></div>
            <div class="hist-row"><span class="hist-lbl">???? ????</span><span class="hist-val">${fmtC(ev.unitPrice,curr)}</span></div>
            ${discRow}
            <div class="hist-row"><span class="hist-lbl">${hasDisc?'??? ??????':'??? ????'}</span><span class="hist-val" style="color:${typeClr}">${fmtC(ev.totalPrice,curr)}${curr!=='USD'?` <small>(? ${fmtC(usd,'USD')})</small>`:''}</span></div>
            ${ev.buyer?`<div class="hist-row"><span class="hist-lbl">?????</span><span class="hist-val">${escHtml(ev.buyer)}${ev.phone?' ? ??'+escHtml(ev.phone):''}</span></div>`:''}
            ${ev.dueDate?`<div class="hist-row"><span class="hist-lbl">?????? ????</span><span class="hist-val warn">${ev.dueDate}</span></div>`:''}
            ${rateTag}${ev.note?`<span class="hist-tag">${escHtml(ev.note)}</span>`:''}
          </div>
          <button class="btn btn-bad btn-xs hist-del" onclick="delEvAndRefresh(${ev.id},${id},'history')">???</button>
        </div>`;
    }

    const extraMap = {
      shipping: { lbl:'???? ???', icon:'??', clr:'var(--bad)' },
      tax: { lbl:'???', icon:'???', clr:'var(--bad)' },
      raseed: { lbl:'?????', icon:'??', clr:'var(--bad)' },
      omola: { lbl:'??????', icon:'??', clr:'var(--bad)' },
    };
    if (extraMap[ev.type]) {
      const m = extraMap[ev.type];
      const usd = ev.amount / (rate || 1);
      return `
        <div class="hist-item">
          <div class="hist-head">
            <span class="hist-icon">${m.icon}</span>
            <span class="hist-type" style="color:${m.clr}">${m.lbl}</span>
            <span class="hist-date">${ev.date||''}</span>
          </div>
          <div class="hist-body">
            <div class="hist-row"><span class="hist-lbl">??? ????</span><span class="hist-val bad">${fmtC(ev.amount,curr)}${curr!=='USD'?` <small>(? ${fmtC(usd,'USD')})</small>`:''}</span></div>
            ${rateTag}${ev.note?`<span class="hist-tag">${escHtml(ev.note)}</span>`:''}
          </div>
          <button class="btn btn-bad btn-xs hist-del" onclick="delEvAndRefresh(${ev.id},${id},'history')">???</button>
        </div>`;
    }

    if (ev.type === 'debt_pay') {
      return `
        <div class="hist-item">
          <div class="hist-head">
            <span class="hist-icon">?</span>
            <span class="hist-type" style="color:var(--ok)">??????????</span>
            <span class="hist-date">${ev.date||''}</span>
          </div>
          <div class="hist-body">
            <div class="hist-row"><span class="hist-lbl">??</span><span class="hist-val ok">${fmtDual(ev.amount,curr,rate)}</span></div>
            ${ev.buyer?`<div class="hist-row"><span class="hist-lbl">??????</span><span class="hist-val">${escHtml(ev.buyer)}${ev.phone?' ? ??'+escHtml(ev.phone):''}</span></div>`:''}
          </div>
          <button class="btn btn-bad btn-xs hist-del" onclick="delEvAndRefresh(${ev.id},${id},'history')">???</button>
        </div>`;
    }

    const rawAmt = ev.totalPrice ?? ev.amount;
    return `<div class="hist-item">
      <div class="hist-head"><span class="hist-icon">??</span><span class="hist-type">${ev.type}</span><span class="hist-date">${ev.date||''}</span></div>
      <div class="hist-body"><div class="hist-row"><span class="hist-lbl">??</span><span class="hist-val">${rawAmt!=null?fmtDual(rawAmt,curr,rate):''}</span></div></div>
      <button class="btn btn-bad btn-xs hist-del" onclick="delEvAndRefresh(${ev.id},${id},'history')">???</button>
    </div>`;
  }

  return sorted.length
    ? `<div class="hist-list">${sorted.map(buildItem).join('')}</div>`
    : `<div class="empty">??? ???????? ????</div>`;
}

function renderProdPrint(id, p, s) {
  return `<div style="text-align:center;padding:20px">
    <p style="color:var(--muted);margin-bottom:14px;font-size:13px">?? ?????????? ??????? ?????? ??????? ??????</p>
    <button class="btn btn-p" onclick="printProduct(${id})">??? ??????? ??? ??????</button>
    &nbsp;
    <button class="btn btn-ol" onclick="printAllProducts()">??? ??????? ????? ???????</button>
  </div>`;
}
function printProduct(id) {
  const p   = getProduct(id);
  const s   = getProductStats(id);
  const win = window.open('', '_blank');
  win.document.write(buildPrintHTML([{ p, s }], `ڕاپۆرتی کاڵا: ${escHtml(p.name)}`));
  win.document.close();
  win.print();
}

function printAllProducts() {
  const items = getProducts().map(p => ({ p, s: getProductStats(p.id) }));
  const win = window.open('', '_blank');
  win.document.write(buildPrintHTML(items, '??????? ???? ???????'));
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
    <h1>?? ${title}</h1>
    <div class="meta">??????: ${now} ? ??? ???????: ${items.length}</div>`;

  if (items.length > 1) {
    body += `<div class="sum">
      <div class="sum-row"><span>??? ?????</span><span class="bad">${fmtC(g.totalCostUSD,'USD')}</span></div>
      <div class="sum-row"><span>?????? ???????</span><span class="bad">${fmtC(g.soldCostUSD,'USD')}</span></div>
      <div class="sum-row"><span>??? ??????</span><span class="ok">${fmtC(g.totalRevenueUSD,'USD')}</span></div>
      <div class="sum-row"><span>????? ????</span><span class="bad">${fmtC(g.debtRemainUSD,'USD')}</span></div>
      <div class="total"><span>??? ??????</span><span class="${g.profitUSD>=0?'ok':'bad'}">${fmtC(g.profitUSD,'USD')}</span></div>
    </div>`;
  }

  items.forEach(({ p, s }) => {
    body += `<h2>?? ${escHtml(p.name)}</h2>
    <div class="sum">
      <div class="sum-row"><span>????? ???</span><span class="bad">${fmtC(s.loadCostUSD,'USD')}</span></div>
      <div class="sum-row"><span>???? ???</span><span class="bad">${fmtC(s.shippingUSD,'USD')}</span></div>
      <div class="sum-row"><span>???</span><span class="bad">${fmtC(s.taxUSD,'USD')}</span></div>
      ${s.raseedUSD>0?`<div class="sum-row"><span>?????</span><span class="bad">${fmtC(s.raseedUSD,'USD')}</span></div>`:''}
      ${s.omolaUSD>0?`<div class="sum-row"><span>??????</span><span class="bad">${fmtC(s.omolaUSD,'USD')}</span></div>`:''}
      <div class="sum-row"><span>??? ??????</span><span class="ok">${fmtC(s.totalRevenueUSD,'USD')}</span></div>
      <div class="sum-row"><span>????? ????</span><span class="bad">${fmtC(s.debtRemainUSD,'USD')}</span></div>
      <div class="sum-row"><span>????? ????</span><span>${fmtN(s.stockQty,2)} ${p.unit}</span></div>
      <div class="total"><span>${s.profitUSD>=0?'??????':'?????'}</span>
        <span class="${s.profitUSD>=0?'ok':'bad'}">${fmtC(s.profitUSD,'USD')}</span>
      </div>
    </div>
    <table>
      <thead><tr><th>???</th><th>??????</th><th>??</th><th>??? ????</th><th>??????</th></tr></thead>
      <tbody>${s.events.sort((a,b)=>(a.date||'')>(b.date||'')?1:-1).map(ev=>`
        <tr>
          <td>${{load:'?? ???',shipping:'?? ???',tax:'??? ???',raseed:'?? ?????',omola:'?? ??????',sell_cash:'?? ????',sell_debt:'?? ????',debt_pay:'? ??????????'}[ev.type]||ev.type}</td>
          <td>${ev.date||''}</td>
          <td>${ev.qty!=null?fmtN(ev.qty,2)+' '+escHtml(p.unit):'-'}</td>
          <td>${ev.totalPrice!=null?fmtC(ev.totalPrice,ev.currency):ev.amount!=null?fmtC(ev.amount,ev.currency):'-'}</td>
          <td>${escHtml(ev.note||ev.buyer||ev.supplier||'')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  });

  body += `</body></html>`;
  return body;
}

function refreshProdCard(id, tab) {
  const p = getProduct(id);
  const s = getProductStats(id);
  const card = el('pcard-' + id); if (!card) return;
  const meta = card.querySelector('.pc-meta');
  if (meta) meta.textContent = `${p.qty} ${p.unit} ? ${p.buyDate} ? ${p.supplier||'?? ???????'}`;
  const statVals = card.querySelectorAll('.pc-stat .v');
  if (statVals[0]) statVals[0].textContent = `${fmtN(s.stockQty,2)} ${p.unit}`;
  if (statVals[1]) { statVals[1].textContent = fmtC(s.profitUSD,'USD'); statVals[1].className = 'v ' + (s.profitUSD>=0?'tok':'tbad'); }
  const content = el('pc-content-' + id);
  const map = { load: renderProdLoad, costs: renderProdCosts, sell: renderProdSell, debt: renderProdDebt, history: renderProdHistory };
  if (map[tab]) content.innerHTML = map[tab](id, p, s);
  else content.innerHTML = renderProdSummary(id, s);
}

function delEvAndRefresh(evId, prodId, tab) {
  if (!confirm('????????')) return;
  const ev = delEvent(evId);
  if (ev && ev.type === 'load') updateProductQty(prodId, -(parseFloat(ev.qty)||0));
  if (ev && (ev.type === 'sell_cash' || ev.type === 'sell_debt')) updateProductQty(prodId, parseFloat(ev.qty)||0);
  refreshProdCard(prodId, tab);
}

function delProd(id) {
  if (!confirm('???????? ????? ????? ? ???????? ?????????!')) return;
  saveProducts(getProducts().filter(p => p.id != id));
  DB.set('events', getAllEvents().filter(e => e.productId != id));
  renderProducts();
}

function setRange(type, btn) {
  currentRange = type;
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  el('customRangeRow').style.display = type === 'custom' ? 'grid' : 'none';
  el('customRangeApply').style.display = type === 'custom' ? 'block' : 'none';
  if (type !== 'custom') renderProfits();
}

function getDateRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (currentRange === 'today') return { from: today(), to: today() };
  if (currentRange === 'week') return { from: new Date(y,m,d-6).toISOString().split('T')[0], to: today() };
  if (currentRange === 'month') return { from: new Date(y,m,1).toISOString().split('T')[0], to: today() };
  if (currentRange === 'year') return { from: `${y}-01-01`, to: today() };
  if (currentRange === 'custom') return { from: v('rangeFrom'), to: v('rangeTo') };
  return { from: '2000-01-01', to: '2099-12-31' };
}

function renderProfits() {
  const { from, to } = getDateRange();
  if (currentRange === 'custom' && (!from || !to)) return;
  const g = getProfitByRange(from, to);
  const prods = getProducts();
  const gAll = getGlobalStats();
  const profitIQD = fromUSD(g.profitUSD, 'IQD');

  const prodStats = prods.map(p => ({ ...p, ...getProductStats(p.id) }));
  const bestProfit = [...prodStats].sort((a,b) => b.profitUSD - a.profitUSD).slice(0,5);
  const worstProfit = [...prodStats].filter(p => p.profitUSD < 0).sort((a,b) => a.profitUSD - b.profitUSD).slice(0,5);
  const highDebt = [...prodStats].filter(p => p.debtRemainUSD > 0.001).sort((a,b) => b.debtRemainUSD - a.debtRemainUSD).slice(0,5);
  const lowStock = [...prodStats].filter(p => p.stockQty >= 0 && p.stockQty <= 5 && p.totalLoadedQty > 0).sort((a,b) => a.stockQty - b.stockQty).slice(0,5);
  const mostSold = [...prodStats].filter(p => p.totalSoldQty > 0).sort((a,b) => b.totalSoldQty - a.totalSoldQty).slice(0,5);

  const overdueAlerts = getDebtDueAlerts();
  const overdues = overdueAlerts.filter(a => a.status === 'overdue');
  const soonDues = overdueAlerts.filter(a => a.status === 'soon');
  const marginBadge = g.profitMarginPct >= 15 ? 'b-ok' : g.profitMarginPct >= 0 ? 'b-warn' : 'b-bad';

  function top5(title, icon, items, valFn, clsFn) {
    if (!items.length) return '';
    return `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;letter-spacing:.5px">${icon} ${title}</div>
      ${items.map((p,i) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border2)">
        <span style="width:20px;height:20px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0;color:var(--muted)">${i+1}</span>
        <div style="flex:1;font-size:12px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.name)}</div>
        <span class="${clsFn(p)} fw8" style="font-size:12px;flex-shrink:0">${valFn(p)}</span>
      </div>`).join('')}
    </div>`;
  }

  function debtAlertList(title, icon, alerts) {
    if (!alerts.length) return '';
    return `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;letter-spacing:.5px">${icon} ${title} (${alerts.length})</div>
      ${alerts.slice(0,8).map(a => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border2)">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600">${escHtml(a.name)}</div>
          <div style="font-size:10px;color:var(--muted)">${a.dueDate} ? ${a.diffDays<0?Math.abs(a.diffDays)+' ??? ????????':a.diffDays===0?'?????!':a.diffDays+' ??? ????'}</div>
        </div>
        <span class="tbad fw8" style="font-size:12px;flex-shrink:0">${fmtC(a.owedUSD,'USD')}</span>
      </div>`).join('')}
    </div>`;
  }

  el('profitsContent').innerHTML = `
    <div class="card">
      <div class="ctitle">?? ?????? ???? ? ${from} ?? ${to}
        <div class="ca"><button class="btn btn-ol btn-sm" onclick="printAllProducts()">??? ?????</button></div>
      </div>
      <div class="sgrid">
        <div class="scard ok"><div class="si">??</div><div class="sv tok">${fmtC(g.revenueUSD,'USD')}</div><div class="sl">??? ??????</div></div>
        <div class="scard bad"><div class="si">??</div><div class="sv tbad">${fmtC(g.soldCostUSD,'USD')}</div><div class="sl">?????? ???????</div></div>
        <div class="scard ${g.profitUSD>=0?'ok':'bad'}"><div class="si">${g.profitUSD>=0?'??':'??'}</div><div class="sv ${g.profitUSD>=0?'tok':'tbad'}">${fmtC(g.profitUSD,'USD')}</div><div class="sl">${g.profitUSD>=0?'??????':'?????'}</div></div>
      </div>
      <div class="sum-box">
        <div class="sum-row"><span class="lbl">?????? ?? ?????</span><span class="val ${g.profitUSD>=0?'tok':'tbad'}">${fmtC(g.profitUSD,'USD')}</span></div>
        <div class="sum-row"><span class="lbl">?????? ?? ?????</span><span class="val ${g.profitUSD>=0?'tok':'tbad'}">${fmtC(profitIQD,'IQD')}</span></div>
        <div class="sum-row"><span class="lbl">????? ??????</span><span class="val"><span class="badge ${marginBadge}">${fmtN(g.profitMarginPct,1)}%</span></span></div>
        <div class="sum-row"><span class="lbl">????? ????????? ?????</span><span class="val">${fmtN(g.costRecoveryPct,1)}%</span></div>
        <div class="sum-row"><span class="lbl">??? ??????</span><span class="val">${fmtN(g.soldQty,2)} ???? (${g.saleCount} ??????)</span></div>
        <div class="sum-row"><span class="lbl">??????? ??????</span><span class="val">${fmtC(g.avgSaleUSD,'USD')}</span></div>
        ${g.totalDiscountUSD>0?`<div class="sum-row"><span class="lbl">??? ??? ????????</span><span class="val twarn">${fmtC(g.totalDiscountUSD,'USD')}</span></div>`:''}
      </div>
    </div>
    <div class="card">
      <div class="ctitle">?? ???? ? ??????????</div>
      <div class="sgrid" style="margin-bottom:10px">
        <div class="scard bad"><div class="si">??</div><div class="sv tbad">${fmtC(g.debtCreatedUSD,'USD')}</div><div class="sl">????? ?????????</div></div>
        <div class="scard ok"><div class="si">?</div><div class="sv tok">${fmtC(g.debtPaidUSD,'USD')}</div><div class="sl">??????????</div></div>
        <div class="scard ${gAll.debtRemainUSD>0?'bad':'ok'}"><div class="si">??</div><div class="sv ${gAll.debtRemainUSD>0?'tbad':'tok'}">${fmtC(gAll.debtRemainUSD,'USD')}</div><div class="sl">??? ??????</div></div>
        <div class="scard info"><div class="si">??</div><div class="sv" style="color:var(--info)">${fmtC(gAll.remainingStockValueUSD,'USD')}</div><div class="sl">???? ????</div></div>
      </div>
      ${(overdues.length||soonDues.length)?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>${debtAlertList('????????','?',overdues)}</div>
        <div>${debtAlertList('?????? ??????','??',soonDues)}</div>
      </div>`:'<div style="text-align:center;padding:10px;color:var(--ok);font-size:12px">? ??? ??????? ???????? ????</div>'}
    </div>
    <div class="card">
      <div class="ctitle">?? ?????? ??? ???????</div>
      <div class="tw"><table>
        <thead><tr><th>????</th><th>??????</th><th>?????? ???????</th><th>??????</th><th>??????</th></tr></thead>
        <tbody>${prods.map(p => {
          const ps = getProductStats(p.id);
          const margin = ps.totalRevenueUSD > 0 ? roundMoney((ps.profitUSD / ps.totalRevenueUSD) * 100) : 0;
          return `<tr>
            <td><strong>${escHtml(p.name)}</strong><div style="font-size:10px;color:var(--faint)">${fmtN(ps.stockQty,2)} ${escHtml(p.unit)} ??????</div></td>
            <td class="tok">${fmtC(ps.totalRevenueUSD,'USD')}</td>
            <td class="tbad">${fmtC(ps.soldCostUSD,'USD')}</td>
            <td><span class="badge ${ps.profitUSD>=0?'b-ok':'b-bad'}">${fmtC(ps.profitUSD,'USD')}</span></td>
            <td><span class="badge ${margin>=15?'b-ok':margin>=0?'b-warn':'b-bad'}">${fmtN(margin,1)}%</span></td>
          </tr>`;
        }).join('') || '<tr><td colspan="5" class="empty">??? ??????? ????</td></tr>'}
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="ctitle">?? ??????? ? ????????? ???????</div>
      <div class="grid-2">
        <div>
          ${top5('??????? ??????','??',bestProfit,p=>fmtC(p.profitUSD,'USD'),p=>p.profitUSD>=0?'tok':'tbad')}
          ${top5('??????? ??????','??',mostSold,p=>fmtN(p.totalSoldQty,2)+' '+escHtml(p.unit),()=>'tok')}
        </div>
        <div>
          ${worstProfit.length?top5('??????? ?????','??',worstProfit,p=>fmtC(p.profitUSD,'USD'),()=>'tbad'):''}
          ${highDebt.length?top5('??????? ????','??',highDebt,p=>fmtC(p.debtRemainUSD,'USD'),()=>'tbad'):''}
          ${lowStock.length?top5('??????? ????','??',lowStock,p=>fmtN(p.stockQty,2)+' '+escHtml(p.unit),()=>'twarn'):''}
        </div>
      </div>
    </div>`;
}

// ============================================================
// ===== CURRENCIES =====
// ============================================================// ============================================================
// ===== CURRENCIES =====
// ============================================================
function renderCurrencies() {
  const list = getCurrencies();
  const lu   = DB.get('rateLastUpdate');
  if (lu && el('rateLastUpdate')) el('rateLastUpdate').textContent = 'دوایین: ' + lu;
  el('currCards').innerHTML = `<div class="grid-3">${list.map(c => `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:12px;display:flex;align-items:center;gap:8px">
      <span style="font-size:24px">${c.flag}</span>
      <div style="flex:1"><div style="font-weight:700">${c.code}</div><div style="font-size:10px;color:var(--muted)">${c.name}</div></div>
      <div style="text-align:left"><div style="font-weight:700;font-size:12px">${fmtN(c.rateToUSD,c.code==='IQD'||c.code==='IRR'?0:4)}</div><div style="font-size:9px;color:var(--faint)">???????? $1</div></div>
    </div>`).join('')}</div>`;
  el('currTable').innerHTML = list.map(c => `<tr>
    <td>${c.flag}</td><td><strong>${c.code}</strong></td><td>${c.name}</td>
    <td><input type="number" step="any" value="${c.rateToUSD}"
      style="width:110px;padding:5px 8px;background:var(--bg3);border:1.5px solid var(--border);border-radius:6px;color:var(--text);font-family:inherit;font-size:12px"
      onchange="updateRate('${c.code}',this.value)"></td>
    <td><button class="btn btn-bad btn-xs" onclick="delCurr('${c.code}')">???</button></td>
  </tr>`).join('');
}

function updateRate(code, val) {
  const list = getCurrencies();
  const c    = list.find(x => x.code === code);
  if (c) c.rateToUSD = parseFloat(val) || 1;
  saveCurrencies(list);
  renderCurrencies();
}

function delCurr(code) {
  if (code === 'IQD' || code === 'USD') return alert('IQD ? USD ????????? ??????????');
  saveCurrencies(getCurrencies().filter(c => c.code !== code));
  renderCurrencies(); fillCurrencySelects();
}

function addCurrency() {
  const code = v('nCCode').trim().toUpperCase(), name = v('nCName').trim();
  if (!code || !name) return showA('currAlert','bad','??? ? ??? ???? ???');
  const list = getCurrencies();
  if (list.find(c => c.code === code)) return showA('currAlert','bad','??? ????? ????? ????');
  list.push({ code, name, flag: v('nCFlag')||'???', rateToUSD: parseFloat(v('nCRate'))||1, symbol: v('nCSym')||code });
  saveCurrencies(list);
  ['nCCode','nCName','nCFlag','nCRate','nCSym'].forEach(id => { const e = el(id); if(e) e.value = ''; });
  showA('currAlert','ok','✅ دراو زیادکرا'); fillCurrencySelects(); renderCurrencies();
}

async function fetchLiveRates() {
  const btn     = el('btnFetchRates');
  const alertEl = el('fetchRateAlert');
  if (btn) { btn.disabled = true; btn.textContent = '? ??????...'; }
  if (alertEl) alertEl.innerHTML = '';
  try {
    let data = null;
    try {
      const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
      if (r.ok) data = await r.json();
    } catch(_) {}
    if (!data) {
      try {
        const r2 = await fetch('https://latest.currency-api.pages.dev/v1/currencies/usd.json');
        if (r2.ok) { const d2 = await r2.json(); if (d2?.usd) data = d2; }
      } catch(_) {}
    }
    if (!data?.usd) throw new Error('نرخەکان نەگەیشتن — ئینتەرنێتەکەت پشکنە');
    const rates = data.usd; let updated = 0;
    const list  = getCurrencies();
    list.forEach(c => {
      if (c.code === 'USD') return;
      const k = c.code.toLowerCase();
      if (rates[k]) { c.rateToUSD = parseFloat(rates[k].toFixed(4)); updated++; }
    });
    saveCurrencies(list);
    DB.set('rateLastUpdate', new Date().toLocaleString('en-GB'));
    if (alertEl) alertEl.innerHTML = `<div class="alert al-ok">? ${updated} ???? ??? ???????</div>`;
    fillCurrencySelects(); renderCurrencies();
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert al-bad">? ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '?? ???? ????????'; }
  }
}

// ============================================================
// ===== SUPPLIERS =====
// ============================================================
function renderSuppliers() {
  const list = getSuppliers();
  el('suppList').innerHTML = list.length
    ? `<div class="ev-list">${list.map(s => `
        <div class="ev-item">
          <div class="ev-icon">??</div>
          <div class="ev-info">
            <div class="ev-title">${escHtml(s.name)}</div>
            ${s.phone?`<div class="ev-meta">?? <a href="tel:${escHtml(s.phone)}" style="color:var(--primary);text-decoration:none">${escHtml(s.phone)}</a></div>`:''}
          </div>
          ${s.phone?`<a href="tel:${escHtml(s.phone)}" class="btn btn-ol btn-xs">??</a>`:''}
          <button class="btn btn-bad btn-xs" onclick="delSupplier(${s.id})">???</button>
        </div>`).join('')}</div>`
    : `<div class="empty">هیچ فرۆشیارێک نییە</div>`;
}
function doAddSupplier() {
  const n = v('suppName').trim(); if (!n) return showA('suppAlert','bad','??? ???? ???');
  const phone = v('suppPhone').trim();
  addSupplier(n, phone);
  el('suppName').value = ''; el('suppPhone').value = '';
  showA('suppAlert','ok','✅ زیادکرا'); renderSuppliers(); fillSupplierSelect();
}
function delSupplier(id) {
  DB.set('suppliers', getSuppliers().filter(s => s.id != id));
  renderSuppliers(); fillSupplierSelect();
}

// ============================================================
// ===== COPY LINK =====
// ============================================================
function copyLink(url, btnEl) {
  const btn = btnEl || (typeof event !== 'undefined' ? event.target : null);
  const doFeedback = (b) => {
    if (!b) return;
    const old = b.innerHTML;
    b.innerHTML = '✅ کۆپیکرا!';
    b.style.background = 'var(--ok)'; b.style.color = '#fff';
    setTimeout(() => { b.innerHTML = old; b.style.background = ''; b.style.color = ''; }, 2500);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => doFeedback(btn)).catch(() => fallbackCopy(url, btn));
  } else {
    fallbackCopy(url, btn);
  }
}
function fallbackCopy(url, btn) {
  const ta = document.createElement('textarea');
  ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try {
    document.execCommand('copy');
    if (btn) { const old = btn.innerHTML; btn.innerHTML = '✓ کۆپی کرا'; setTimeout(() => { btn.innerHTML = old; }, 2500); }
  } catch { prompt('لینکەکە کۆپی بکە:', url); }
  document.body.removeChild(ta);
}

// ============================================================
// ===== SETTINGS PAGE =====
// ============================================================
function renderSettings() { /* renders inline in HTML */ }

// ============================================================
// ===== کڕیارەکان =====
// ============================================================
function getCustomerStats() {
  const evs   = getAllEvents();
  const prods = getProducts();
  const map   = {};

  evs.forEach(ev => {
    if (!ev.phone && !ev.customerToken) return;
    const normPhone = normalizePhone(ev.phone || '');
    // Step 5.1: token-first key
    const key = ev.customerToken || normPhone;
    if (!key) return;
    if (!map[key]) {
      const reg = ev.customerToken ? lookupCustomerByToken(ev.customerToken) : null;
      map[key] = {
        token:    ev.customerToken || '',
        name:     reg?.name  || ev.buyer || 'کڕیار',
        phone:    reg?.phone || normPhone || '',
        totalUSD: 0, debtUSD: 0, paidUSD: 0, txCount: 0,
        products: new Set(),
      };
    }
    const c = map[key];
    if (ev.buyer && ev.buyer !== c.name) c.name = ev.buyer;
    if (normPhone && !c.phone)           c.phone = normPhone;

    if (ev.type === 'sell_cash' || ev.type === 'sell_debt') {
      c.totalUSD += toUSD(ev.totalPrice, ev.currency);
      c.txCount++;
      if (ev.type === 'sell_debt') c.debtUSD += toUSD(ev.totalPrice, ev.currency);
      const prod = prods.find(p => p.id == ev.productId);
      if (prod) c.products.add(prod.name);
    }
    if (ev.type === 'debt_pay') c.paidUSD += toUSD(ev.amount, ev.currency);
  });

  return Object.values(map)
    .map(c => ({
      ...c,
      remainUSD: Math.max(0, c.debtUSD - c.paidUSD),
      products:  [...c.products],
    }))
    // Step 5: ڕیزکردن بەپێی قەرز
    .sort((a, b) => b.remainUSD - a.remainUSD || b.totalUSD - a.totalUSD);
}

function renderCustomers() {
  const cont = el('customersList'); if (!cont) return;
  const allCustomers = getCustomerStats();

  if (!allCustomers.length) {
    cont.innerHTML = '<div class="empty"><span class="ei">👥</span>هێشتا هیچ کڕیارێک نییە<br><span style="font-size:11px">کاتێک فرۆشتن تۆمار بکەیت ژمارە تەلەفون داخڵ بکە</span></div>';
    return;
  }

  const totalBought = allCustomers.reduce((s, c) => s + c.totalUSD, 0);
  const totalDebt   = allCustomers.reduce((s, c) => s + c.remainUSD, 0);
  const debtors     = allCustomers.filter(c => c.remainUSD > 0.001);

  // فلتەر و گەڕان لە state ی UI ـەوە
  const filterVal  = el('custFilterDebt')?.value  || 'all';
  const searchVal  = (el('custSearch')?.value || '').toLowerCase().trim();
  let customers = filterVal === 'debt' ? debtors : allCustomers;
  if (searchVal) customers = customers.filter(c =>
    c.name.toLowerCase().includes(searchVal) || c.phone.includes(searchVal)
  );

  const rows = customers.map((c, i) => {
    const debt     = c.remainUSD > 0.001;
    const link     = getDebtorLink(c.name, c.phone);
    const remainIQD = fromUSD(c.remainUSD, 'IQD');
    const totalIQD  = fromUSD(c.totalUSD,  'IQD');
    const paidIQD   = fromUSD(c.debtUSD - c.remainUSD, 'IQD');
    const waMsg     = encodeURIComponent('سڵاو ' + c.name + '\nکۆی کڕین: ' + fmtC(c.totalUSD,'USD') + (debt ? '\nقەرزی ماوە: ' + fmtC(c.remainUSD,'USD') : '\nقەرز نییە'));
    const waLink    = c.phone ? 'https://wa.me/' + c.phone.replace(/\D/g,'') + '?text=' + waMsg : '';
    const safeToken = (c.token || '').replace(/'/g, "\\'");

    return `<div class="card" style="margin-bottom:10px;padding:0;overflow:hidden" id="cust-card-${i}">
      <!-- سەری کارت -->
      <div style="padding:14px;display:flex;justify-content:space-between;align-items:flex-start;cursor:pointer" onclick="toggleCustomerDetail('${safeToken}','cust-detail-${i}')">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:${debt?'rgba(248,113,113,.2)':'var(--ok-bg)'};display:flex;align-items:center;justify-content:center;font-weight:800;color:${debt?'var(--bad)':'var(--ok)'};font-size:14px;flex-shrink:0">${i+1}</div>
          <div>
            <div style="font-weight:700;font-size:14px">${escHtml(c.name)}</div>
            <div style="font-size:11px;color:var(--muted)">📞 <a href="tel:${escHtml(c.phone)}" style="color:var(--primary);text-decoration:none" onclick="event.stopPropagation()">${escHtml(c.phone)}</a> • ${c.txCount} مامەڵە</div>
            <div style="font-size:10px;color:var(--faint);margin-top:2px">${c.products.slice(0,3).map(n=>escHtml(n)).join(' • ')}${c.products.length>3?' ...':''}</div>
          </div>
        </div>
        <div style="text-align:left">
          <div style="font-weight:800;font-size:13px;color:var(--ok)">${fmtC(c.totalUSD,'USD')}</div>
          <div style="font-size:10px;color:var(--faint)">${fmtC(totalIQD,'IQD')}</div>
          ${debt
            ? `<div style="font-size:11px;font-weight:700;color:var(--bad);margin-top:3px">💳 ${fmtC(c.remainUSD,'USD')}</div>
               <div style="font-size:10px;color:var(--faint)">${fmtC(remainIQD,'IQD')}</div>`
            : `<div style="font-size:10px;color:var(--ok);margin-top:3px">✓ قەرز نییە</div>`}
        </div>
      </div>
      <!-- دوگمەکان -->
      <div style="padding:0 14px 12px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-xs btn-g" onclick="event.stopPropagation();copyLink('${link}')">🔗 لینک</button>
        ${waLink?`<a href="${waLink}" target="_blank" class="btn btn-xs" style="background:#25d366;color:#fff;text-decoration:none" onclick="event.stopPropagation()">واتساپ</a>`:''}
        <button class="btn btn-xs btn-g" onclick="event.stopPropagation();printCustomerReport('${safeToken}')">🖨️ پرینت</button>
        <button class="btn btn-xs btn-g" style="margin-right:auto" onclick="toggleCustomerDetail('${safeToken}','cust-detail-${i}')">👁️ زیاتر</button>
      </div>
      <!-- ناوەڕۆکی وردەکاری -->
      <div id="cust-detail-${i}" style="display:none;border-top:1px solid var(--border)"></div>
    </div>`;
  }).join('');

  cont.innerHTML = `
    <div class="sgrid" style="margin-bottom:12px">
      <div class="scard info"><div class="si">👥</div><div class="sv" style="color:var(--info)">${allCustomers.length}</div><div class="sl">کۆی کڕیارەکان</div></div>
      <div class="scard ok"><div class="si">🛒</div><div class="sv tok">${fmtC(totalBought,'USD')}</div><div class="sl">کۆی کڕین</div></div>
      <div class="scard ${totalDebt>0?'bad':'ok'}"><div class="si">💳</div><div class="sv ${totalDebt>0?'tbad':'tok'}">${fmtC(totalDebt,'USD')}</div><div class="sl">کۆی قەرز</div></div>
      <div class="scard bad"><div class="si">⚠️</div><div class="sv tbad">${debtors.length}</div><div class="sl">قەرزداران</div></div>
    </div>
    <!-- گەڕان و فلتەر -->
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:160px;position:relative">
        <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px">🔎</span>
        <input id="custSearch" type="search" placeholder="گەڕانی کڕیار..." style="width:100%;padding:8px 32px 8px 10px;background:var(--bg3);border:1.5px solid var(--border);border-radius:var(--rs);color:var(--text);font-family:inherit;font-size:13px"
          oninput="renderCustomers()">
      </div>
      <select id="custFilterDebt" style="padding:8px 12px;background:var(--bg3);border:1.5px solid var(--border);border-radius:var(--rs);color:var(--text);font-family:inherit;font-size:13px" onchange="renderCustomers()">
        <option value="all">هەموو (${allCustomers.length})</option>
        <option value="debt">قەرزدار (${debtors.length})</option>
      </select>
    </div>
    ${customers.length ? rows : '<div class="empty">هیچ کڕیارێک نەدۆزرایەوە</div>'}`;
}

// ===== داخستن/کردنەوەی وردەکاریی کڕیار =====
function toggleCustomerDetail(token, detailId) {
  const box = el(detailId); if (!box) return;
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }

  const sum = getCustomerDebtSummary(token);
  if (!sum) { box.style.display = 'none'; return; }

  const hasDebt = sum.debtRemainUSD > 0.001;

  // ===== پوختەی سەرەکی =====
  const summaryBox = `
    <div style="padding:12px;border-bottom:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
        <div style="background:var(--bg3);border-radius:var(--rs);padding:10px;text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">کۆی کڕین</div>
          <div style="font-weight:800;font-size:13px;color:var(--ok)">${fmtC(sum.totalBoughtUSD,'USD')}</div>
        </div>
        <div style="background:${hasDebt?'var(--bad-bg)':'var(--ok-bg)'};border-radius:var(--rs);padding:10px;text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">قەرزی ماوە</div>
          <div style="font-weight:800;font-size:13px;color:${hasDebt?'var(--bad)':'var(--ok)'}">${fmtC(sum.debtRemainUSD,'USD')}</div>
        </div>
        <div style="background:var(--bg3);border-radius:var(--rs);padding:10px;text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">پارەدانەوە</div>
          <div style="font-weight:800;font-size:13px;color:var(--ok)">${fmtC(sum.totalPaidUSD,'USD')}</div>
        </div>
      </div>
      ${hasDebt && sum.totalDebtUSD > 0 ? `
        <div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${fmtN(sum.paidPct,0)}%;background:${sum.paidPct>=100?'var(--ok)':sum.paidPct>50?'var(--warn)':'var(--bad)'};border-radius:3px"></div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:3px">${fmtN(sum.paidPct,1)}% پارەدانراوە</div>` : ''}
    </div>`;

  // ===== قەرز بەپێی کاڵا =====
  const prodBreakdown = sum.productBreakdown.length ? `
    <div style="padding:12px;border-bottom:1px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">📦 قەرز بەپێی کاڵا</div>
      ${sum.productBreakdown.map(pb => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border2)">
          <div>
            <div style="font-size:12px;font-weight:600">${escHtml(pb.name)}</div>
             ${pb.dueDate?`<div style="font-size:10px;color:var(--warn)">⏰ ${pb.dueDate}</div>`:''}
          </div>
          <div style="text-align:left">
            <div style="font-size:11px;font-weight:700;color:${pb.remainUSD>0?'var(--bad)':'var(--ok)'}">
               ${pb.remainUSD > 0.001 ? fmtC(pb.remainUSD,'USD') : 'تەواو'}
            </div>
            ${pb.remainUSD>0.001?`<div style="font-size:10px;color:var(--faint)">${fmtC(fromUSD(pb.remainUSD,'IQD'),'IQD')}</div>`:''}
          </div>
        </div>`).join('')}
    </div>` : '';

  // ===== دوایین مامەڵەکان (10ی دواوە) =====
  const txIcons  = { sell_cash:'💵', sell_debt:'🧾', debt_pay:'↩️' };
  const txLabels = { sell_cash:'فرۆشتنی نەقد', sell_debt:'فرۆشتنی قەرز', debt_pay:'پارەدانەوە' };
  const histHTML = `
    <div style="padding:12px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">🧾 دوایین مامەڵەکان</div>
      <div class="ev-list">
        ${sum.txHistory.slice(0,10).map(tx => `
          <div class="ev-item" style="padding:8px 10px">
            <div class="ev-icon" style="font-size:15px">${txIcons[tx.type]||'🧾'}</div>
            <div class="ev-info">
              <div class="ev-title" style="font-size:11px">${txLabels[tx.type]||tx.type}${tx.prod&&tx.prod!=='-'?' • '+escHtml(tx.prod):''}</div>
              <div class="ev-meta" style="font-size:10px">${tx.date}${tx.dueDate?' • ⏰ '+tx.dueDate:''}</div>
            </div>
            <div style="font-size:12px;font-weight:700;color:${tx.type==='debt_pay'?'var(--ok)':tx.type==='sell_debt'?'var(--warn)':'var(--text)'};flex-shrink:0">${fmtC(tx.amount,tx.currency)}</div>
          </div>`).join('')}
        ${sum.txHistory.length > 10 ? `<div style="text-align:center;font-size:11px;color:var(--muted);padding:6px">${sum.txHistory.length - 10} مامەڵەی تر هەیە</div>` : ''}
      </div>
    </div>`;

  box.innerHTML = summaryBox + prodBreakdown + histHTML;
  box.style.display = '';
}

// ===== پرینتی ڕاپۆرتی کڕیار =====
function printCustomerReport(token) {
  const sum = getCustomerDebtSummary(token);
  if (!sum) return alert('⚠️ کڕیار نەدۆزرایەوە');
  const hasDebt   = sum.debtRemainUSD > 0.001;
  const now       = new Date().toLocaleDateString('ar-IQ', { year:'numeric', month:'long', day:'numeric' });
  const txIcons   = { sell_cash:'💵', sell_debt:'🧾', debt_pay:'↩️' };
  const txLabels  = { sell_cash:'فرۆشتنی نەقد', sell_debt:'فرۆشتنی قەرز', debt_pay:'پارەدانەوە' };

  const prodRows = sum.productBreakdown.map(pb =>
    `<tr><td>${escHtml(pb.name)}</td><td>${fmtC(pb.debtUSD,'USD')}</td><td>${fmtC(pb.paidUSD,'USD')}</td>
     <td style="color:${pb.remainUSD>0?'#dc2626':'#16a34a'};font-weight:700">${pb.remainUSD>0.001?fmtC(pb.remainUSD,'USD'):'تەواو'}</td></tr>`
  ).join('');

  const txRows = sum.txHistory.map(tx =>
    `<tr><td>${txIcons[tx.type]||''} ${txLabels[tx.type]||tx.type}</td><td>${tx.date}</td>
     <td>${tx.prod&&tx.prod!=='-'?escHtml(tx.prod):''}</td>
     <td style="font-weight:700">${fmtC(tx.amount,tx.currency)}</td></tr>`
  ).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
<title>ڕاپۆرتی کڕیار - ${escHtml(sum.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans Arabic',Arial,sans-serif;color:#111;background:#fff;font-size:12px;direction:rtl;padding:14mm}
.header{background:#0f2040;color:#fff;border-radius:10px;padding:16px 20px;margin-bottom:18px;-webkit-print-color-adjust:exact}
.cname{font-size:18px;font-weight:800;margin-bottom:3px}
.cmeta{font-size:11px;opacity:.7;margin-bottom:10px}
.pill{display:inline-block;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700}
.pill.d{background:rgba(248,113,113,.25);color:#f87171;border:1px solid rgba(248,113,113,.4)}
.pill.ok{background:rgba(52,211,153,.25);color:#34d399;border:1px solid rgba(52,211,153,.4)}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.sc{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center}
.sc.ok{background:#ecfdf5;border-color:#6ee7b7}.sc.bad{background:#fef2f2;border-color:#fca5a5}.sc.info{background:#eff6ff;border-color:#93c5fd}
.sv{font-size:14px;font-weight:800;margin:3px 0}.sl{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.4px;font-weight:700}
.pbar{height:7px;background:#e5e7eb;border-radius:4px;overflow:hidden;margin-top:6px}
.pfill{height:100%;border-radius:4px;-webkit-print-color-adjust:exact}
h3{font-size:12px;font-weight:700;color:#666;margin:14px 0 7px;text-transform:uppercase;letter-spacing:.5px}
table{width:100%;border-collapse:collapse}
th{background:#1a3a5c;color:#fff;padding:7px 10px;text-align:right;font-size:11px;-webkit-print-color-adjust:exact}
td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px}
.footer{text-align:center;margin-top:16px;padding-top:10px;border-top:1px solid #eee;font-size:10px;color:#999}
@page{margin:12mm;size:A4}@media print{body{padding:0}}
</style></head><body>
<div class="header">
  <div class="cname">👤 ${escHtml(sum.name)}</div>
  <div class="cmeta">${sum.phone?'📞 '+escHtml(sum.phone)+' • ':''}بەروار: ${now}</div>
  <span class="pill ${hasDebt?'d':'ok'}">${hasDebt?'💳 قەرزی ماوە: '+fmtC(sum.debtRemainUSD,'USD'):'✓ قەرز نییە'}</span>
</div>
<div class="grid3">
  <div class="sc info"><div class="si">🛒</div><div class="sv" style="color:#2563eb">${fmtC(sum.totalBoughtUSD,'USD')}</div><div class="sl">کۆی کڕین</div></div>
  <div class="sc ${hasDebt?'bad':'ok'}"><div class="si">${hasDebt?'💳':'✓'}</div><div class="sv" style="color:${hasDebt?'#dc2626':'#059669'}">${fmtC(sum.debtRemainUSD,'USD')}</div><div class="sl">قەرزی ماوە</div></div>
  <div class="sc ok"><div class="si">↩️</div><div class="sv" style="color:#059669">${fmtC(sum.totalPaidUSD,'USD')}</div><div class="sl">پارەدانەوە</div></div>
</div>
 ${hasDebt&&sum.totalDebtUSD>0?`<div class="pbar"><div class="pfill" style="width:${fmtN(sum.paidPct,0)}%;background:${sum.paidPct>50?'#059669':'#dc2626'}"></div></div><div style="font-size:10px;color:#666;margin-top:3px">${fmtN(sum.paidPct,1)}% پارەدانراوە</div>`:''}
 ${prodRows?`<h3>📦 قەرز بەپێی کاڵا</h3>
 <table><thead><tr><th>کاڵا</th><th>کۆی قەرز</th><th>پارەدانەوە</th><th>ماوە</th></tr></thead><tbody>${prodRows}</tbody></table>`:''}
 <h3>🧾 دوایین مامەڵەکان</h3>
 <table><thead><tr><th>جۆر</th><th>بەروار</th><th>کاڵا</th><th>بڕی پارە</th></tr></thead><tbody>
 ${txRows||'<tr><td colspan="4" style="text-align:center;color:#999;padding:14px">هیچ مامەڵەیەک نییە</td></tr>'}
</tbody></table>
 <div class="footer">ڕاپۆرتی کڕیار • v2.4 • ${now}</div>
</body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}
function openEditProduct(id) {
  if (typeof event !== 'undefined') event.stopPropagation();
  const p = getProduct(id); if (!p) return;
  const suppOpts = getSuppliers().map(s =>
    `<option value="${escHtml(s.name)}"${s.name===p.supplier?' selected':''}>${escHtml(s.name)}</option>`
  ).join('');
  const unitOpts = ['دانە','kg','g','متر','لیتر','بستە','کارتۆن'].map(u =>
    `<option value="${u}"${u===p.unit?' selected':''}>${u}</option>`
  ).join('');

  let overlay = el('editProdOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'editProdOverlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }
  overlay.classList.add('open');
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-head">
        <h3>✏️ دەستکاریکردن: ${escHtml(p.name)}</h3>
        <button class="modal-close" onclick="closeEditProduct()">×</button>
      </div>
      <div id="editProdAlert"></div>
      <div class="fg2">
        <div class="fg c2"><label>ناوی کاڵا *</label><input id="epName" value="${escHtml(p.name)}"></div>
        <div class="fg"><label>بڕ</label><input id="epQty" type="number" step="0.001" value="${p.qty}" inputmode="decimal"></div>
        <div class="fg"><label>یەکە</label><select id="epUnit">${unitOpts}</select></div>
        <div class="fg"><label>فرۆشیار</label>
          <select id="epSupplier">
            <option value="">- هیچ فرۆشیار -</option>
            ${suppOpts}
          </select>
        </div>
        <div class="fg c2"><label>تێبینی</label><input id="epNote" value="${escHtml(p.note||'')}"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
         <button class="btn btn-p" onclick="saveEditProduct(${id})">✓ پاشەکەوتکردن</button>
        <button class="btn btn-g" onclick="closeEditProduct()">داخستن</button>
         <button class="btn btn-bad" style="margin-right:auto" onclick="closeEditProduct();delProd(${id})">🗑️ سڕینەوە</button>
      </div>
    </div>`;

  overlay.addEventListener('click', function handler(e) {
    if (e.target === overlay) { closeEditProduct(); overlay.removeEventListener('click', handler); }
  });
}

function saveEditProduct(id) {
  const name = (el('epName')?.value || '').trim();
  if (!name) return showA('editProdAlert', 'bad', 'ناوی کاڵا داخڵ بکە');
  const qty = parseFloat(el('epQty')?.value) || 0;
  updateProduct(id, {
    name, qty,
    unit: el('epUnit')?.value || 'دانە',
    supplier: el('epSupplier')?.value || '',
    note:     el('epNote')?.value     || '',
  });
  closeEditProduct();
  if (el('pg-products')?.classList.contains('active')) renderProducts();
  else showPage('products');
}

function closeEditProduct() {
  const overlay = el('editProdOverlay');
  if (overlay) overlay.classList.remove('open');
}

// ============================================================
// ===== SETTINGS ACTIONS =====
// ============================================================
function doExport() {
  exportData();
  showA('settingsAlert','ok','✅ داتا ئامادەی داگرتنە!');
}

function doImport(input) {
  const file = input.files[0]; if (!file) return;
  importData(file).then(result => {
    showA('settingsAlert','ok',`✅ داتا هاوردەکرا! ${data.products.length} کاڵا`);
    input.value = '';
    renderDash();
    renderLowStockBanner();
    renderDebtDueBanner();
  }).catch(err => {
    if (err?.code === 'IMPORT_CANCELLED') {
      showA('settingsAlert','ok','هاوردەکردن هەڵوەشایەوە.');
    } else {
    showA('settingsAlert','bad','❌ هەڵە: ' + err.message);
    }
    input.value = '';
  });
}

function doReset() {
  const typed = prompt('بۆ ڕیسێتی تەواو، تکایە RESET بنووسە:');
  if (typed === null) return;
  if (typed !== 'RESET') {
  showA('settingsAlert','ok','RESET بە دروستی بنووسە');
    return;
  }
  DB.clear();
  window.location.reload();
}
