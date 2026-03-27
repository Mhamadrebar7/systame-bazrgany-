// ============================================================
// data.js — سیستەمی داتا و localStorage
// ============================================================

// ===== XSS Protection =====
function escHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

const DB = {
  get: k => { try { return JSON.parse(localStorage.getItem('pm_' + k) || 'null'); } catch { return null; } },
  set: (k, v) => {
    try {
      localStorage.setItem('pm_' + k, JSON.stringify(v));
    } catch (e) {
      // QuotaExceededError — بیرەکەی براوزەر پڕە
      console.error('localStorage quota exceeded:', e);
      alert('⚠️ بیرەکەی براوزەر پڕە! داتاکە پاشەکەوت نەکرا.\nتکایە داتای کۆنەکان Export بکە، پاشان ڕیسێت بکە.');
      throw e;
    }
  },
  clear: () => { Object.keys(localStorage).filter(k => k.startsWith('pm_')).forEach(k => localStorage.removeItem(k)); }
};

// ===== CURRENCIES =====
const DEFAULT_CURRENCIES = [
  { code:'IQD', name:'دینار عیراقی',    flag:'🇮🇶', rateToUSD:1310,   symbol:'IQD' },
  { code:'USD', name:'دۆلاری ئەمریکی', flag:'🇺🇸', rateToUSD:1,      symbol:'$'   },
  { code:'TRY', name:'لیرەی تورک',      flag:'🇹🇷', rateToUSD:32.5,   symbol:'₺'   },
  { code:'EUR', name:'یوڕۆ',            flag:'🇪🇺', rateToUSD:0.92,   symbol:'€'   },
  { code:'IRR', name:'ریالی ئێران',     flag:'🇮🇷', rateToUSD:42000,  symbol:'﷼'   },
  { code:'SAR', name:'ریال سعودی',      flag:'🇸🇦', rateToUSD:3.75,   symbol:'SR'  },
  { code:'CNY', name:'یوانی چین',       flag:'🇨🇳', rateToUSD:7.24,   symbol:'¥'   },
];

function getCurrencies() { return DB.get('currencies') || DEFAULT_CURRENCIES; }
function saveCurrencies(list) { DB.set('currencies', list); }

function toUSD(amount, fromCode) {
  if (!amount) return 0;
  const list = getCurrencies();
  const from = list.find(c => c.code === fromCode);
  if (!from) return parseFloat(amount) || 0;
  return (parseFloat(amount) || 0) / from.rateToUSD;
}

function fromUSD(usdAmount, toCode) {
  const list = getCurrencies();
  const to = list.find(c => c.code === toCode);
  if (!to) return parseFloat(usdAmount) || 0;
  return (parseFloat(usdAmount) || 0) * to.rateToUSD;
}

function fmtN(n, decimals) {
  const num = parseFloat(n || 0);
  if (decimals === undefined) decimals = num >= 100 ? 0 : 2;
  return num.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtC(amount, code) {
  const list = getCurrencies();
  const c = list.find(x => x.code === code) || { symbol: code, code };
  const dec = (code === 'IQD' || code === 'IRR') ? 0 : 2;
  return c.symbol + ' ' + fmtN(amount, dec);
}

// ===== نیشاندانی دوو دراو =====
// کاتێک دراوەکە USD نەبوو، هەر دووی نیشان دەدات: نرخی ئەصلی + USD
function fmtDual(amount, currency, rateSnapshot) {
  if (!amount) return fmtC(0, currency);
  const primary = fmtC(amount, currency);
  if (currency === 'USD') return primary;
  const rate = rateSnapshot || (getCurrencies().find(c=>c.code===currency)?.rateToUSD || 1);
  const inUSD = (parseFloat(amount) || 0) / rate;
  return `${primary} <span style="color:var(--muted);font-size:10px;font-weight:400">(≈ ${fmtC(inUSD,'USD')} · ${fmtN(rate,0)} ${currency}/$)</span>`;
}

function nextId() {
  let n = DB.get('nextId') || 1000;
  DB.set('nextId', n + 1);
  return n;
}

// ===== INIT =====
function initData() {
  if (!DB.get('currencies'))  saveCurrencies(DEFAULT_CURRENCIES);
  if (!DB.get('products'))    DB.set('products', []);
  if (!DB.get('events'))      DB.set('events', []);
  if (!DB.get('suppliers'))   DB.set('suppliers', []);
}

// ===== کاڵا =====
function getProducts()      { return DB.get('products') || []; }
function saveProducts(list) { DB.set('products', list); }

function addProduct(data) {
  const prods = getProducts();
  const prod = {
    id: nextId(),
    name: data.name,
    unit: data.unit || 'دانە',
    qty: parseFloat(data.qty) || 0,
    buyPrice: parseFloat(data.buyPrice) || 0,
    buyCurrency: data.buyCurrency || 'IQD',
    supplier: data.supplier || '',
    buyDate: data.buyDate || today(),
    note: data.note || '',
    createdAt: new Date().toISOString(),
  };
  prods.push(prod);
  saveProducts(prods);
  return prod;
}

function getProduct(id) { return getProducts().find(p => p.id == id); }

// ===== دەستکاریکردنی کاڵا =====
function updateProduct(id, data) {
  const prods = getProducts();
  const p = prods.find(x => x.id == id);
  if (!p) return null;
  if (data.name !== undefined)    p.name = data.name;
  if (data.unit !== undefined)    p.unit = data.unit;
  if (data.qty !== undefined)     p.qty = parseFloat(data.qty) || 0;
  if (data.supplier !== undefined) p.supplier = data.supplier;
  if (data.note !== undefined)    p.note = data.note;
  saveProducts(prods);
  invalidateStatsCache();
  return p;
}

function updateProductQty(id, delta) {
  invalidateStatsCache();
  const prods = getProducts();
  const p = prods.find(x => x.id == id);
  if (p) { p.qty = (parseFloat(p.qty) || 0) + delta; saveProducts(prods); }
}

// ===== ئیڤێنتەکان =====
function getEvents(productId) { return (DB.get('events') || []).filter(e => e.productId == productId); }
function getAllEvents()        { return DB.get('events') || []; }

function addEvent(data) {
  invalidateStatsCache();
  const events = DB.get('events') || [];
  // نرخی گۆڕینەوەی ئێستا پاشەکەوت بکە
  const currency = data.currency || 'USD';
  const currs = getCurrencies();
  const currObj = currs.find(c => c.code === currency);
  const rateSnapshot = currObj ? currObj.rateToUSD : 1;
  const amountUSD = data.totalPrice != null
    ? toUSD(data.totalPrice, currency)
    : data.amount != null
    ? toUSD(data.amount, currency)
    : 0;

  const ev = {
    id: nextId(),
    ...data,
    rateSnapshot,          // نرخی گۆڕینەوەی کاتی تۆمارکردن
    amountUSD,             // بڕی USD لەو کاتەدا
    createdAt: new Date().toISOString()
  };
  events.push(ev);
  DB.set('events', events);
  return ev;
}

function delEvent(id) {
  invalidateStatsCache();
  const events = DB.get('events') || [];
  const ev = events.find(e => e.id == id);
  DB.set('events', events.filter(e => e.id != id));
  return ev;
}

// ===== فرۆشیار =====
function getSuppliers()    { return DB.get('suppliers') || []; }
function addSupplier(name, phone) { const s = [...getSuppliers(), { id: nextId(), name, phone: phone||'' }]; DB.set('suppliers', s); return s; }

// ===== بەروار =====
function today() { return new Date().toISOString().split('T')[0]; }

// ===== کاچی ئامارەکان =====
let _statsCache = {};
let _statsCacheVersion = 0;

function invalidateStatsCache() { _statsCache = {}; _statsCacheVersion++; }

// ===== ئامارەکانی کاڵا =====
function getProductStats(productId) {
  if (_statsCache[productId]) return _statsCache[productId];

  const events = getEvents(productId);
  let loadCostUSD = 0, shippingUSD = 0, taxUSD = 0, raseedUSD = 0, omolaUSD = 0, totalLoadedQty = 0;
  let cashRevenueUSD = 0, debtRevenueUSD = 0, debtPaidUSD = 0, totalSoldQty = 0;

  events.forEach(ev => {
    try {
      if (!ev || !ev.type) return; // ئیڤێنتی خراپ نادیار بکە
      switch(ev.type) {
        case 'load':
          if (ev.totalPrice == null || !ev.currency) break;
          loadCostUSD  += toUSD(ev.totalPrice, ev.currency);
          totalLoadedQty += parseFloat(ev.qty) || 0;
          break;
        case 'shipping':  if (ev.amount != null && ev.currency) shippingUSD  += toUSD(ev.amount, ev.currency); break;
        case 'tax':       if (ev.amount != null && ev.currency) taxUSD       += toUSD(ev.amount, ev.currency); break;
        case 'raseed':    if (ev.amount != null && ev.currency) raseedUSD    += toUSD(ev.amount, ev.currency); break;
        case 'omola':     if (ev.amount != null && ev.currency) omolaUSD     += toUSD(ev.amount, ev.currency); break;
        case 'sell_cash':
          if (ev.totalPrice == null || !ev.currency) break;
          cashRevenueUSD += toUSD(ev.totalPrice, ev.currency);
          totalSoldQty += parseFloat(ev.qty) || 0;
          break;
        case 'sell_debt':
          if (ev.totalPrice == null || !ev.currency) break;
          debtRevenueUSD += toUSD(ev.totalPrice, ev.currency);
          totalSoldQty += parseFloat(ev.qty) || 0;
          break;
        case 'debt_pay':  if (ev.amount != null && ev.currency) debtPaidUSD  += toUSD(ev.amount, ev.currency); break;
      }
    } catch(e) {
      console.warn('ئیڤێنتی خراپ تێپەڕاندرا — id:', ev?.id, e);
    }
  });

  const totalCostUSD    = loadCostUSD + shippingUSD + taxUSD + raseedUSD + omolaUSD;
  const totalRevenueUSD = cashRevenueUSD + debtRevenueUSD;
  const debtRemainUSD   = debtRevenueUSD - debtPaidUSD;
  const profitUSD       = totalRevenueUSD - totalCostUSD;
  const prod            = getProduct(productId);
  const stockQty        = prod ? parseFloat(prod.qty) || 0 : 0;

  return _statsCache[productId] = {
    loadCostUSD, shippingUSD, taxUSD, raseedUSD, omolaUSD, totalCostUSD,
    cashRevenueUSD, debtRevenueUSD, debtPaidUSD,
    totalRevenueUSD, debtRemainUSD, profitUSD,
    totalLoadedQty, totalSoldQty, stockQty, events,
  };
}

// ===== ئامارەکانی گشتی =====
function getGlobalStats() {
  const prods = getProducts();
  let g = { totalCostUSD:0, totalRevenueUSD:0, debtRemainUSD:0, profitUSD:0 };
  prods.forEach(p => {
    const s = getProductStats(p.id);
    g.totalCostUSD    += s.totalCostUSD;
    g.totalRevenueUSD += s.totalRevenueUSD;
    g.debtRemainUSD   += s.debtRemainUSD;
    g.profitUSD       += s.profitUSD;
  });
  return g;
}

// ===== قازانجی ماوەی دیاریکراو =====
function getProfitByRange(from, to) {
  const events = getAllEvents();
  let revenueUSD = 0, costUSD = 0;
  events.forEach(ev => {
    const d = ev.date || ev.createdAt?.split('T')[0];
    if (d < from || d > to) return;
    if (ev.type === 'sell_cash' || ev.type === 'sell_debt') revenueUSD += toUSD(ev.totalPrice, ev.currency);
    if (['load','shipping','tax','raseed','omola'].includes(ev.type)) {
      costUSD += toUSD(ev.totalPrice ?? ev.amount, ev.currency);
    }
  });
  return { revenueUSD, costUSD, profitUSD: revenueUSD - costUSD };
}

// ===== EXPORT داتا =====
function exportData() {
  const data = {
    version: '2.1',
    exportDate: new Date().toISOString(),
    currencies: getCurrencies(),
    products: getProducts(),
    events: getAllEvents(),
    suppliers: getSuppliers(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== IMPORT داتا =====
function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.products) || !Array.isArray(data.events)) throw new Error('فایلەکە دروست نییە');
        // پشکنینی کاڵاکان — هەر ئەوانەی id و ناوی هەیە پاشەکەوت بکە
        const validProds = data.products.filter(p => p.id != null && typeof p.name === 'string' && p.qty != null);
        const validEvs   = data.events.filter(e => e.id != null && e.type && e.productId != null);
        const skippedP   = data.products.length - validProds.length;
        const skippedE   = data.events.length - validEvs.length;
        if (skippedP > 0) console.warn(`${skippedP} کاڵای خراپ لابرا`);
        if (skippedE > 0) console.warn(`${skippedE} ئیڤێنتی خراپ لابرا`);
        if (data.currencies) saveCurrencies(data.currencies);
        DB.set('products', validProds);
        DB.set('events', validEvs);
        if (data.suppliers)  DB.set('suppliers', data.suppliers);
        resolve(data);
      } catch(err) { reject(err); }
    };
    reader.readAsText(file);
  });
}

// ===== EXPORT بۆ CSV =====
function exportToCSV() {
  const prods = getProducts();
  const BOM = '\uFEFF';
  let csv = BOM + 'ناو,یەکە,بڕی مانەوە,کۆی خەرجی (USD),کۆی فرۆشتن (USD),قازانج (USD),قەرزی مانەوە (USD),فرۆشیار,تێبینی\n';
  prods.forEach(p => {
    const s = getProductStats(p.id);
    csv += [
      '"'+p.name.replace(/"/g,'""')+'"',
      '"'+p.unit+'"',
      fmtN(p.qty,2),
      s.totalCostUSD.toFixed(2),
      s.totalRevenueUSD.toFixed(2),
      s.profitUSD.toFixed(2),
      s.debtRemainUSD.toFixed(2),
      '"'+(p.supplier||'').replace(/"/g,'""')+'"',
      '"'+(p.note||'').replace(/"/g,'""')+'"',
    ].join(',') + '\n';
  });
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `products-${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ===== EXPORT مامەڵەکان بۆ CSV =====
function exportEventsToCSV() {
  const events = getAllEvents();
  const prods = getProducts();
  const BOM = '\uFEFF';
  const types = {load:'بارکردن',shipping:'کرێی بار',tax:'باج',raseed:'ڕەسید',omola:'عومولە',sell_cash:'فرۆشتنی نەقد',sell_debt:'فرۆشتنی قەرز',debt_pay:'پارەدانەوە'};
  let csv = BOM + 'جۆر,کاڵا,بەروار,بڕ,نرخی یەکە,کۆی نرخ,دراو,نرخی دۆلار,کڕیار,تەلەفون,تێبینی\n';
  events.forEach(ev => {
    const prod = prods.find(p => p.id == ev.productId);
    csv += [
      '"'+(types[ev.type]||ev.type)+'"',
      '"'+(prod?.name||'').replace(/"/g,'""')+'"',
      ev.date||'',
      ev.qty!=null ? fmtN(ev.qty,2) : '',
      ev.unitPrice!=null ? ev.unitPrice.toFixed(2) : '',
      ev.totalPrice!=null ? ev.totalPrice.toFixed(2) : (ev.amount!=null ? ev.amount.toFixed(2) : ''),
      ev.currency||'',
      ev.amountUSD ? ev.amountUSD.toFixed(2) : '',
      '"'+(ev.buyer||'').replace(/"/g,'""')+'"',
      ev.phone||'',
      '"'+(ev.note||'').replace(/"/g,'""')+'"',
    ].join(',') + '\n';
  });
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `events-${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ===== EXPORT بۆ PDF (HTML → Print) =====
function exportToPDF() {
  const prods = getProducts();
  const g = getGlobalStats();
  const now = new Date().toLocaleDateString('ar-IQ');
  let rows = '';
  prods.forEach((p, i) => {
    const s = getProductStats(p.id);
    rows += `<tr>
      <td>${i+1}</td>
      <td>${escHtml(p.name)}</td>
      <td>${fmtN(p.qty,2)} ${escHtml(p.unit)}</td>
      <td style="color:#dc2626">${fmtC(s.totalCostUSD,'USD')}</td>
      <td style="color:#16a34a">${fmtC(s.totalRevenueUSD,'USD')}</td>
      <td style="font-weight:800;color:${s.profitUSD>=0?'#16a34a':'#dc2626'}">${fmtC(s.profitUSD,'USD')}</td>
      <td style="color:${s.debtRemainUSD>0?'#dc2626':'#16a34a'}">${s.debtRemainUSD>0.001?fmtC(s.debtRemainUSD,'USD'):'✅'}</td>
    </tr>`;
  });
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
<title>ڕاپۆرتی کاڵاکان</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans Arabic',Arial,sans-serif;color:#111;background:#fff;font-size:12px;direction:rtl;padding:14mm}
h1{font-size:18px;margin-bottom:4px}
.meta{color:#666;font-size:11px;margin-bottom:16px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.st{border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center}
.st.ok{background:#ecfdf5;border-color:#6ee7b7}.st.bad{background:#fef2f2;border-color:#fca5a5}
.sv{font-size:14px;font-weight:800;margin:3px 0}.sl{font-size:9px;color:#666;text-transform:uppercase}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#1a3a5c;color:#fff;padding:8px 10px;text-align:right;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px}
tr:nth-child(even) td{background:#f9fafb}
.footer{text-align:center;margin-top:18px;padding-top:10px;border-top:1px solid #eee;font-size:10px;color:#999}
@page{margin:12mm;size:A4}@media print{body{padding:0}}
</style></head><body>
<h1>📦 ڕاپۆرتی گشتی کاڵاکان</h1>
<div class="meta">بەروار: ${now} · ${prods.length} کاڵا</div>
<div class="stats">
  <div class="st"><div class="sv">${prods.length}</div><div class="sl">📦 کاڵاکان</div></div>
  <div class="st ok"><div class="sv" style="color:#16a34a">${fmtC(g.totalRevenueUSD,'USD')}</div><div class="sl">💰 فرۆشتن</div></div>
  <div class="st bad"><div class="sv" style="color:#dc2626">${fmtC(g.totalCostUSD,'USD')}</div><div class="sl">🛒 خەرجی</div></div>
  <div class="st ${g.profitUSD>=0?'ok':'bad'}"><div class="sv" style="color:${g.profitUSD>=0?'#16a34a':'#dc2626'}">${fmtC(g.profitUSD,'USD')}</div><div class="sl">${g.profitUSD>=0?'📈 قازانج':'📉 زەرەر'}</div></div>
</div>
<table>
<thead><tr><th>#</th><th>کاڵا</th><th>ستۆک</th><th>خەرجی</th><th>فرۆشتن</th><th>قازانج</th><th>قەرز</th></tr></thead>
<tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:20px;color:#999">هیچ کاڵایەک نییە</td></tr>'}</tbody>
</table>
<div class="footer">سیستەمی بەڕێوەبردنی کاڵا · v2.2 · ${now}</div>
</body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ===== ستۆکی کەم =====
function getLowStockProducts(threshold = 5) {
  return getProducts().filter(p => parseFloat(p.qty) <= threshold && parseFloat(p.qty) >= 0);
}

// ===== ئاگادارکردنەوەی بەرواری قەرز =====
// دەگەڕێنێتەوە لیستی قەرزارانی کە بەرواریان تێپەڕیوە یان ناو ٧ ڕۆژ دەتێپەڕێ
function getDebtDueAlerts() {
  const events  = getAllEvents();
  const todayStr = today();
  const debtMap  = {};

  events.forEach(ev => {
    try {
      if (!ev || !ev.type) return;
      const token = ev.customerToken || ((ev.buyer||'') + '_' + (ev.phone||''));

      if (ev.type === 'sell_debt') {
        if (!debtMap[token]) {
          debtMap[token] = {
            name:     ev.buyer || 'نەناسراو',
            phone:    ev.phone || '',
            owedUSD:  0,
            dueDate:  ev.dueDate || '',
          };
        }
        debtMap[token].owedUSD += toUSD(ev.totalPrice, ev.currency);
        // نوێترین بەروار بەکاربهێنە
        if (ev.dueDate && (!debtMap[token].dueDate || ev.dueDate > debtMap[token].dueDate)) {
          debtMap[token].dueDate = ev.dueDate;
        }
      }

      if (ev.type === 'debt_pay') {
        if (debtMap[token]) {
          debtMap[token].owedUSD -= toUSD(ev.amount, ev.currency);
        }
      }
    } catch(e) {
      console.warn('getDebtDueAlerts: ئیڤێنتی خراپ تێپەڕاندرا', ev?.id, e);
    }
  });

  const alerts = [];
  Object.values(debtMap).forEach(d => {
    if (d.owedUSD <= 0.001) return;  // قەرز تەواو دراوەتەوە
    if (!d.dueDate) return;           // بەروار نییە، پشاندانی ناکرێت

    const diffDays = Math.round((new Date(d.dueDate) - new Date(todayStr)) / 86400000);
    if (diffDays < 0) {
      alerts.push({ ...d, status: 'overdue', diffDays });
    } else if (diffDays <= 7) {
      alerts.push({ ...d, status: 'soon', diffDays });
    }
  });

  return alerts;
}
