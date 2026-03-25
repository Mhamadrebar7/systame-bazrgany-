// ============================================================
// data.js — سیستەمی داتا و localStorage
// ============================================================

const DB = {
  get: k => { try { return JSON.parse(localStorage.getItem('pm_' + k) || 'null'); } catch { return null; } },
  set: (k, v) => localStorage.setItem('pm_' + k, JSON.stringify(v)),
  clear: () => { Object.keys(localStorage).filter(k => k.startsWith('pm_')).forEach(k => localStorage.removeItem(k)); }
};

// ===== CURRENCIES =====
const DEFAULT_CURRENCIES = [
  { code:'IQD', name:'دینار عیراقی',    flag:'🇮🇶', rateToUSD:1480,   symbol:'IQD' },
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

function updateProductQty(id, delta) {
  const prods = getProducts();
  const p = prods.find(x => x.id == id);
  if (p) { p.qty = (parseFloat(p.qty) || 0) + delta; saveProducts(prods); }
}

// ===== ئیڤێنتەکان =====
function getEvents(productId) { return (DB.get('events') || []).filter(e => e.productId == productId); }
function getAllEvents()        { return DB.get('events') || []; }

function addEvent(data) {
  const events = DB.get('events') || [];
  const ev = { id: nextId(), ...data, createdAt: new Date().toISOString() };
  events.push(ev);
  DB.set('events', events);
  return ev;
}

function delEvent(id) {
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

// ===== ئامارەکانی کاڵا =====
function getProductStats(productId) {
  const events = getEvents(productId);
  let loadCostUSD = 0, shippingUSD = 0, taxUSD = 0, totalLoadedQty = 0;
  let cashRevenueUSD = 0, debtRevenueUSD = 0, debtPaidUSD = 0, totalSoldQty = 0;

  events.forEach(ev => {
    switch(ev.type) {
      case 'load':      loadCostUSD += toUSD(ev.totalPrice, ev.currency); totalLoadedQty += parseFloat(ev.qty) || 0; break;
      case 'shipping':  shippingUSD += toUSD(ev.amount, ev.currency); break;
      case 'tax':       taxUSD += toUSD(ev.amount, ev.currency); break;
      case 'sell_cash': cashRevenueUSD += toUSD(ev.totalPrice, ev.currency); totalSoldQty += parseFloat(ev.qty) || 0; break;
      case 'sell_debt': debtRevenueUSD += toUSD(ev.totalPrice, ev.currency); totalSoldQty += parseFloat(ev.qty) || 0; break;
      case 'debt_pay':  debtPaidUSD += toUSD(ev.amount, ev.currency); break;
    }
  });

  const totalCostUSD    = loadCostUSD + shippingUSD + taxUSD;
  const totalRevenueUSD = cashRevenueUSD + debtRevenueUSD;
  const debtRemainUSD   = debtRevenueUSD - debtPaidUSD;
  const profitUSD       = totalRevenueUSD - totalCostUSD;
  const prod            = getProduct(productId);
  const stockQty        = prod ? parseFloat(prod.qty) || 0 : 0;

  return {
    loadCostUSD, shippingUSD, taxUSD, totalCostUSD,
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
    if (ev.type === 'load')     costUSD += toUSD(ev.totalPrice, ev.currency);
    if (ev.type === 'shipping') costUSD += toUSD(ev.amount, ev.currency);
    if (ev.type === 'tax')      costUSD += toUSD(ev.amount, ev.currency);
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
        if (!data.products || !data.events) throw new Error('فایلەکە دروست نییە');
        if (data.currencies) saveCurrencies(data.currencies);
        if (data.products)   DB.set('products', data.products);
        if (data.events)     DB.set('events', data.events);
        if (data.suppliers)  DB.set('suppliers', data.suppliers);
        resolve(data);
      } catch(err) { reject(err); }
    };
    reader.readAsText(file);
  });
}

// ===== ستۆکی کەم =====
function getLowStockProducts(threshold = 5) {
  return getProducts().filter(p => parseFloat(p.qty) <= threshold && parseFloat(p.qty) >= 0);
}
