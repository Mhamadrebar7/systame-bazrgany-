const DEFAULT_CURRENCIES = [
  { code: 'IQD', name: 'دینار عێراقی', flag: '🇮🇶', rateToUSD: 1310, symbol: 'IQD' },
  { code: 'USD', name: 'دۆلاری ئەمەریکی', flag: '🇺🇸', rateToUSD: 1, symbol: '$' },
  { code: 'TRY', name: 'لیرەی تورک', flag: '🇹🇷', rateToUSD: 32.5, symbol: '₺' },
  { code: 'EUR', name: 'یۆرۆ', flag: '🇪🇺', rateToUSD: 0.92, symbol: '€' },
  { code: 'IRR', name: 'ڕیالی ئێران', flag: '🇮🇷', rateToUSD: 42000, symbol: '﷼' },
  { code: 'SAR', name: 'ڕیال سعودی', flag: '🇸🇦', rateToUSD: 3.75, symbol: 'SR' },
  { code: 'CNY', name: 'یوانی چین', flag: '🇨🇳', rateToUSD: 7.24, symbol: '¥' }
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function roundMoney(value) {
  return Math.round((parseFloat(value) || 0) * 100) / 100;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[\s\-\(\)]/g, '');
}

function legacyHashToken(buyer, phone) {
  const raw = `${buyer || ''}|${phone || ''}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
  }
  return Math.abs(hash).toString(36) + String(buyer || 'x').slice(0, 3).replace(/\s/g, '');
}

function validateToken(token) {
  return !!token && typeof token === 'string' && token.length >= 6 && /^[a-zA-Z0-9\-_]+$/.test(token);
}

function getCurrencies(snapshot) {
  return Array.isArray(snapshot?.currencies) && snapshot.currencies.length
    ? snapshot.currencies
    : DEFAULT_CURRENCIES;
}

function toUSD(amount, fromCode, snapshot) {
  if (!amount) return 0;
  const from = getCurrencies(snapshot).find(currency => currency.code === fromCode);
  if (!from) return parseFloat(amount) || 0;
  return (parseFloat(amount) || 0) / (from.rateToUSD || 1);
}

function sanitizeSnapshot(input) {
  if (!isPlainObject(input)) {
    throw new Error('Snapshot payload is invalid.');
  }

  if (!Array.isArray(input.products) || !Array.isArray(input.events)) {
    throw new Error('Snapshot must contain products and events arrays.');
  }

  const products = clone(input.products).filter(product => product && typeof product === 'object' && product.id != null);
  const productIds = new Set(products.map(product => String(product.id)));

  const events = clone(input.events).filter(event => {
    if (!event || typeof event !== 'object' || event.id == null || typeof event.type !== 'string') return false;
    if (event.type === 'expense') {
      return event.productId == null || event.productId === '' || productIds.has(String(event.productId));
    }
    return event.productId != null && event.productId !== '' && productIds.has(String(event.productId));
  });

  return {
    version: typeof input.version === 'string' ? input.version : '',
    appVersion: typeof input.appVersion === 'string' ? input.appVersion : '',
    exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : new Date().toISOString(),
    currencies: Array.isArray(input.currencies) && input.currencies.length ? clone(input.currencies) : clone(DEFAULT_CURRENCIES),
    products,
    events,
    suppliers: Array.isArray(input.suppliers) ? clone(input.suppliers) : [],
    customerTokens: isPlainObject(input.customerTokens) ? clone(input.customerTokens) : {},
    eventIndex: isPlainObject(input.eventIndex) ? clone(input.eventIndex) : {},
    customerCache: isPlainObject(input.customerCache) ? clone(input.customerCache) : {},
    metadata: isPlainObject(input.metadata) ? clone(input.metadata) : {},
  };
}

function isCustomerTokenActive(entry, nowMs = Date.now()) {
  if (!entry || typeof entry !== 'object' || !validateToken(entry.token)) return false;
  if (entry.revokedAt) return false;
  if (entry.expiresAt) {
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (!Number.isNaN(expiresAtMs) && expiresAtMs < nowMs) return false;
  }
  return true;
}

function getCustomerTokenEntry(snapshot, token) {
  if (!validateToken(token)) return null;
  const registry = isPlainObject(snapshot?.customerTokens) ? snapshot.customerTokens : {};
  const entry = Object.values(registry).find(item => item && item.token === token);
  if (!entry) return null;
  return {
    ...entry,
    name: entry.name || '',
    phone: normalizePhone(entry.phone || ''),
    token: entry.token || token,
    isActive: isCustomerTokenActive(entry),
  };
}

function getCustomerTokenAccessState(snapshot, token) {
  if (!validateToken(token)) return { ok: false, code: 'invalid', entry: null };
  const entry = getCustomerTokenEntry(snapshot, token);
  if (!entry) return { ok: false, code: 'missing', entry: null };
  if (entry.revokedAt) return { ok: false, code: 'revoked', entry };
  if (entry.expiresAt) {
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (!Number.isNaN(expiresAtMs) && expiresAtMs < Date.now()) {
      return { ok: false, code: 'expired', entry };
    }
  }
  return { ok: true, code: 'active', entry };
}

function resolveEventToken(snapshot, event) {
  if (!event || typeof event !== 'object') return '';
  if (validateToken(event.customerToken || '')) return event.customerToken;

  const buyer = String(event.buyer || '').trim();
  const normPhone = normalizePhone(event.phone || '');
  if (!buyer && !normPhone) return '';

  const registry = isPlainObject(snapshot?.customerTokens) ? snapshot.customerTokens : {};
  if (normPhone && registry[normPhone] && validateToken(registry[normPhone].token)) return registry[normPhone].token;
  if (buyer && registry[buyer] && validateToken(registry[buyer].token)) return registry[buyer].token;

  const legacyNorm = legacyHashToken(buyer, normPhone);
  if (validateToken(legacyNorm)) return legacyNorm;

  const legacyRaw = legacyHashToken(buyer, event.phone || '');
  if (validateToken(legacyRaw)) return legacyRaw;

  return '';
}

function eventBelongsToToken(snapshot, event, token, regEntry) {
  if (!event || !['sell_cash', 'sell_debt', 'debt_pay'].includes(event.type)) return false;
  if (event.customerToken === token) return true;

  const regPhone = normalizePhone(regEntry?.phone || '');
  if (regPhone && event.phone && normalizePhone(event.phone) === regPhone) return true;

  if (!event.customerToken && (event.buyer || event.phone)) {
    const resolved = resolveEventToken(snapshot, event);
    if (resolved === token) return true;
  }

  return false;
}

function getCustomerPortalData(snapshot, token) {
  const access = getCustomerTokenAccessState(snapshot, token);
  if (!access.ok) return null;

  const regEntry = access.entry;
  const allEvents = Array.isArray(snapshot?.events) ? snapshot.events : [];
  const products = Array.isArray(snapshot?.products) ? snapshot.products : [];
  const customerEvents = allEvents.filter(event => eventBelongsToToken(snapshot, event, token, regEntry));
  if (!customerEvents.length) return null;

  const first = customerEvents.find(event => event.buyer) || customerEvents[0];
  const name = regEntry?.name || first.buyer || 'کڕیار';
  const phone = normalizePhone(regEntry?.phone || first.phone || '');

  let totalBoughtUSD = 0;
  let totalDebtUSD = 0;
  let totalPaidUSD = 0;
  const txs = [];
  const productBreakdownMap = {};

  customerEvents.forEach(event => {
    const product = products.find(item => item.id == event.productId);
    const productName = product ? product.name : '—';
    const productUnit = product ? product.unit : '';
    const productId = event.productId;

    if (event.type === 'sell_cash') {
      totalBoughtUSD += toUSD(event.totalPrice, event.currency, snapshot);
      txs.push({
        type: 'sell_cash',
        date: event.date || '',
        prod: productName,
        unit: productUnit,
        qty: event.qty,
        amount: event.totalPrice,
        currency: event.currency,
        note: event.note || '',
        discountAmount: event.discountAmount || 0,
      });
    }

    if (event.type === 'sell_debt') {
      const totalPriceUSD = toUSD(event.totalPrice, event.currency, snapshot);
      totalBoughtUSD += totalPriceUSD;
      totalDebtUSD += totalPriceUSD;
      txs.push({
        type: 'sell_debt',
        date: event.date || '',
        prod: productName,
        unit: productUnit,
        qty: event.qty,
        amount: event.totalPrice,
        currency: event.currency,
        dueDate: event.dueDate || '',
        note: event.note || '',
        discountAmount: event.discountAmount || 0,
      });
      if (!productBreakdownMap[productId]) {
        productBreakdownMap[productId] = {
          prodId: productId,
          name: productName,
          debtUSD: 0,
          paidUSD: 0,
          dueDate: '',
        };
      }
      productBreakdownMap[productId].debtUSD += totalPriceUSD;
      if (event.dueDate && (!productBreakdownMap[productId].dueDate || event.dueDate > productBreakdownMap[productId].dueDate)) {
        productBreakdownMap[productId].dueDate = event.dueDate;
      }
    }

    if (event.type === 'debt_pay') {
      const payUSD = toUSD(event.amount, event.currency, snapshot);
      totalPaidUSD += payUSD;
      const paidProduct = products.find(item => item.id == event.productId);
      txs.push({
        type: 'debt_pay',
        date: event.date || '',
        prod: paidProduct ? paidProduct.name : '',
        unit: '',
        qty: null,
        amount: event.amount,
        currency: event.currency,
        note: event.note || '',
      });
    }
  });

  const totalProductDebt = Object.values(productBreakdownMap).reduce((sum, item) => sum + item.debtUSD, 0);
  if (totalProductDebt > 0) {
    customerEvents.filter(event => event.type === 'debt_pay').forEach(event => {
      const payUSD = toUSD(event.amount, event.currency, snapshot);
      Object.values(productBreakdownMap).forEach(item => {
        if (item.debtUSD > 0) {
          item.paidUSD += payUSD * (item.debtUSD / totalProductDebt);
        }
      });
    });
  }

  txs.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const debtRemainUSD = Math.max(0, roundMoney(totalDebtUSD - totalPaidUSD));
  const paidPct = totalDebtUSD > 0 ? Math.min(100, roundMoney((totalPaidUSD / totalDebtUSD) * 100)) : 100;
  const productBreakdown = Object.values(productBreakdownMap)
    .map(item => ({
      ...item,
      debtUSD: roundMoney(item.debtUSD),
      paidUSD: roundMoney(item.paidUSD),
      remainUSD: Math.max(0, roundMoney(item.debtUSD - item.paidUSD)),
    }))
    .filter(item => item.debtUSD > 0)
    .sort((a, b) => b.remainUSD - a.remainUSD);

  return {
    name,
    phone,
    token,
    totalBoughtUSD: roundMoney(totalBoughtUSD),
    totalDebtUSD: roundMoney(totalDebtUSD),
    totalPaidUSD: roundMoney(totalPaidUSD),
    debtRemainUSD,
    paidPct,
    txs,
    productBreakdown,
  };
}

module.exports = {
  DEFAULT_CURRENCIES,
  getCustomerPortalData,
  getCustomerTokenAccessState,
  getCustomerTokenEntry,
  isCustomerTokenActive,
  legacyHashToken,
  normalizePhone,
  roundMoney,
  sanitizeSnapshot,
  toUSD,
  validateToken,
};
