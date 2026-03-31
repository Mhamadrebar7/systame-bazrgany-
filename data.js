// -*- coding: utf-8 -*-
// ============================================================
// data.js — سیستەمی داتا، پاشەکەوت و IndexedDB/localStorage hybrid  v2.4
// پشتیگیری بۆ utils.js و app.js و customer.html
// ============================================================
//
// Step 3 و دواتر:
//   • stockQty  — event-based: totalLoadedQty - totalSoldQty
//   • profitUSD — soldCostUSD-based: revenue - (unitCost × soldQty)
//   • getProfitByRange — sold-cost approach
//   • getLowStockProducts — event-based stock
//   • addEvent — پشتیوانی لە فیلدی داشکاندن
//   • lookupCustomerByToken — لە utils.js
//   • backward compat: product.qty هێشتا هەیە
//
// helpers — utils.js:
//   escHtml, today, endOfMonth, fmtN, fmtC, fmtDual, fmtShort
//   toUSD, fromUSD, normalizePhone, legacyHashToken, lookupCustomerByToken

// ============================================================
// ===== DB =====
// ============================================================
const DB = {
  ready: () => PMStorage.ready(),
  mode: () => PMStorage.mode(),
  get: k => PMStorage.getSync(k),
  set: (k, v) => {
    try {
      const result = PMStorage.setSync(k, v);
      if (window.AuthCloud && typeof window.AuthCloud.noteLocalMutation === 'function') {
        window.AuthCloud.noteLocalMutation(k);
      }
      return result;
    } catch (e) {
      console.error('Storage write failed:', e);
      alert('⚠️ بیرەکەی براوزەر یان storage engine هەڵەی هەیە! داتاکە پاشەکەوت نەکرا.\nتکایە داتای کۆنەکان Export بکە، پاشان ڕیسێت بکە.');
      throw e;
    }
  },
  clear: () => {
    const result = PMStorage.clearSync();
    if (window.AuthCloud && typeof window.AuthCloud.noteLocalMutation === 'function') {
      window.AuthCloud.noteLocalMutation('*');
    }
    return result;
  }
};

function ensureCloudWriteAccess(actionLabel = 'ئەم گۆڕانکارییە') {
  if (!window.AuthCloud || typeof window.AuthCloud.ensureCanWrite !== 'function') return true;
  return window.AuthCloud.ensureCanWrite(actionLabel);
}

function ensureCloudAdminAccess(actionLabel = 'ئەم گۆڕانکارییە') {
  if (!window.AuthCloud || typeof window.AuthCloud.ensureCanAdmin !== 'function') return true;
  return window.AuthCloud.ensureCanAdmin(actionLabel);
}

// ============================================================
// ===== CURRENCIES =====
// ============================================================
const DEFAULT_CURRENCIES = [
  { code: 'IQD', name: 'دیناری عێراقی',  flag: '🇮🇶', rateToUSD: 1310,  symbol: 'IQD' },
  { code: 'USD', name: 'دۆلاری ئەمریکی', flag: '🇺🇸', rateToUSD: 1,     symbol: '$'   },
  { code: 'TRY', name: 'لیرەی تورکی',    flag: '🇹🇷', rateToUSD: 32.5,  symbol: '₺'   },
  { code: 'EUR', name: 'یۆرۆ',           flag: '🇪🇺', rateToUSD: 0.92,  symbol: '€'   },
  { code: 'IRR', name: 'ڕیالی ئێرانی',   flag: '🇮🇷', rateToUSD: 42000, symbol: '﷼'   },
  { code: 'SAR', name: 'ڕیالی سعودی',    flag: '🇸🇦', rateToUSD: 3.75,  symbol: 'SR'  },
  { code: 'CNY', name: 'یووانی چینی',    flag: '🇨🇳', rateToUSD: 7.24,  symbol: '¥'   },
];

const DEFAULT_CURRENCY_BY_CODE = DEFAULT_CURRENCIES.reduce((map, item) => {
  map[item.code] = item;
  return map;
}, {});

function _normalizeCurrencyList(list) {
  const source = Array.isArray(list) ? list : [];
  const seen = new Set();
  const normalized = [];
  let changed = !Array.isArray(list);

  source.forEach(item => {
    if (!item || typeof item !== 'object') {
      changed = true;
      return;
    }

    const code = String(item.code || '').trim().toUpperCase();
    if (!code || seen.has(code)) {
      changed = true;
      return;
    }
    seen.add(code);

    const base = DEFAULT_CURRENCY_BY_CODE[code] || null;
    const next = {
      ...item,
      code,
      name: typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : (base ? base.name : code),
      flag: typeof item.flag === 'string' && item.flag.trim()
        ? item.flag.trim()
        : (base ? base.flag : '🏳️'),
      symbol: typeof item.symbol === 'string' && item.symbol.trim()
        ? item.symbol.trim()
        : (base ? base.symbol : code),
      rateToUSD: Number.isFinite(parseFloat(item.rateToUSD)) && parseFloat(item.rateToUSD) > 0
        ? parseFloat(item.rateToUSD)
        : (base ? base.rateToUSD : 1),
    };

    if (base) {
      if (next.name !== base.name) {
        next.name = base.name;
        changed = true;
      }
      if (next.flag !== base.flag) {
        next.flag = base.flag;
        changed = true;
      }
      if (next.symbol !== base.symbol) {
        next.symbol = base.symbol;
        changed = true;
      }
    }

    if (
      next.code !== item.code
      || next.name !== item.name
      || next.flag !== item.flag
      || next.symbol !== item.symbol
      || next.rateToUSD !== item.rateToUSD
    ) {
      changed = true;
    }

    normalized.push(next);
  });

  DEFAULT_CURRENCIES.forEach(base => {
    if (!seen.has(base.code)) {
      normalized.push({ ...base });
      changed = true;
    }
  });

  return { list: normalized, changed };
}

function repairStoredCurrencies() {
  const raw = DB.get('currencies');
  const normalized = _normalizeCurrencyList(raw);
  if (normalized.changed) {
    console.warn('[currencies] repaired stored currencies');
    DB.set('currencies', normalized.list);
  }
  return normalized.list;
}

function getCurrencies() {
  return repairStoredCurrencies();
}

function saveCurrencies(list) {
  if (!ensureCloudWriteAccess('گۆڕینی دراوەکان')) return;
  const normalized = _normalizeCurrencyList(list);
  DB.set('currencies', normalized.list);
}

// ============================================================
// ===== ID Generator =====
// ============================================================
function nextId() {
  let n = DB.get('nextId');
  n = (typeof n === 'number' && isFinite(n)) ? n : 1000;
  DB.set('nextId', n + 1);
  return n;
}


const CUSTOMER_EVENT_TYPES = new Set(['sell_cash', 'sell_debt', 'debt_pay']);
const APP_VERSION = '2.4';

function isCustomerEventType(type) {
  return CUSTOMER_EVENT_TYPES.has(type);
}

// ============================================================
// ===== INIT =====
// ============================================================
async function initData() {
  await DB.ready();
  repairStoredCurrencies();
  if (DB.get('products') == null) DB.set('products', []);
  if (DB.get('events') == null) DB.set('events', []);
  if (DB.get('suppliers') == null) DB.set('suppliers', []);
  if (DB.get('customerTokens') == null) DB.set('customerTokens', {});
  if (DB.get('eventIndex') == null) DB.set('eventIndex', {});
  if (DB.get('customerCache') == null) DB.set('customerCache', {});
  if (DB.get('lastSyncAt') == null) DB.set('lastSyncAt', '');

  getDeviceId();
  checkStorageIntegrity();
  reconcileLegacyProductStock();

  repairCustomerRegistry();
  _migrateOrphanedTokens();
  buildCustomerEventIndex();
}

// ===== Step 5.1.6: Token migration =====
function _migrateOrphanedTokens() {
  try {
    const events = DB.get('events') || [];
    let changed = false;
    const touchedTokens = new Set();

    events.forEach(ev => {
      if (!ev || typeof ev !== 'object') return;
      if (ev.customerToken && validateToken(ev.customerToken)) return;
      if (!isCustomerEventType(ev.type)) return;
      if (!ev.buyer && !ev.phone) return;

      const normPhone = normalizePhone(ev.phone || '');
      const buyer = (ev.buyer || '').trim();
      if (!normPhone && !buyer) return;

      const token = getOrCreateCustomerToken(buyer, normPhone);
      if (!token || !validateToken(token)) return;

      if (ev.customerToken !== token) {
        ev.customerToken = token;
        changed = true;
      }
      touchedTokens.add(token);
    });

    if (changed) {
      DB.set('events', events);
      console.debug('[TokenMigration] گواستنەوەی token تەواو بوو ✅');
    }

    if (touchedTokens.size) {
      touchedTokens.forEach(token => invalidateCustomerCache(token));
    }

    buildCustomerEventIndex();
    return [...touchedTokens];
  } catch (e) {
    console.warn('[TokenMigration] هەڵە:', e.message);
    invalidateAllCustomerCache();
    buildCustomerEventIndex();
    return [];
  }
}

// ============================================================
// ===== CUSTOMER TOKEN REGISTRY =====
// ============================================================
function getOrCreateCustomerToken(buyer, phone) {
  const normalPhone = normalizePhone(phone || '');
  const key         = normalPhone || (buyer || '').trim();
  if (!key) return '';

  const registry = DB.get('customerTokens') || {};
  if (!registry[key]) {
    registry[key] = {
      token: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Math.random().toString(36).slice(2) + Date.now().toString(36)),
      name:      buyer       || '',
      phone:     normalPhone || '',
      createdAt: new Date().toISOString(),
      expiresAt: '',
      revokedAt: '',
      updatedAt: new Date().toISOString(),
    };
    DB.set('customerTokens', registry);
  }
  if (buyer && registry[key].name !== buyer) {
    registry[key].name = buyer;
    registry[key].updatedAt = new Date().toISOString();
    DB.set('customerTokens', registry);
  }
  return registry[key].token;
}

// alias ?? backward compat
function makeCustomerToken(buyer, phone) {
  return getOrCreateCustomerToken(buyer, phone);
}

function getCustomerTokenRecord(token) {
  if (!validateToken(token)) return null;
  const registry = DB.get('customerTokens') || {};
  const entry = Object.values(registry).find(item => item && item.token === token);
  if (!entry) return null;
  return {
    ...entry,
    name: entry.name || '',
    phone: normalizePhone(entry.phone || ''),
    token: entry.token || token,
  };
}

function isCustomerTokenActive(entry, nowMs = Date.now()) {
  if (!entry || typeof entry !== 'object' || !validateToken(entry.token || '')) return false;
  if (entry.revokedAt) return false;
  if (entry.expiresAt) {
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (!Number.isNaN(expiresAtMs) && expiresAtMs < nowMs) return false;
  }
  return true;
}

function getCustomerTokenAccessState(token) {
  if (!validateToken(token)) return { ok: false, code: 'invalid', entry: null };
  const entry = getCustomerTokenRecord(token);
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

function updateCustomerTokenAccess(token, updater) {
  if (!ensureCloudWriteAccess('گۆڕینی لینکەکانی کڕیار')) return null;
  if (!validateToken(token) || typeof updater !== 'function') return null;
  const registry = DB.get('customerTokens') || {};
  const key = Object.keys(registry).find(candidate => registry[candidate]?.token === token);
  if (!key) return null;
  const current = registry[key];
  const next = updater({ ...current });
  if (!next || typeof next !== 'object') return null;
  next.phone = normalizePhone(next.phone || '');
  next.updatedAt = new Date().toISOString();
  registry[key] = next;
  DB.set('customerTokens', registry);
  invalidateCustomerCache(token);
  buildCustomerEventIndex();
  return registry[key];
}

function revokeCustomerToken(token) {
  return updateCustomerTokenAccess(token, entry => ({ ...entry, revokedAt: new Date().toISOString() }));
}

function restoreCustomerToken(token) {
  return updateCustomerTokenAccess(token, entry => ({ ...entry, revokedAt: '' }));
}

function setCustomerTokenExpiryDays(token, days) {
  const parsedDays = parseInt(days, 10);
  if (!(parsedDays > 0)) return null;
  const expiresAt = new Date(Date.now() + parsedDays * 86400000).toISOString();
  return updateCustomerTokenAccess(token, entry => ({ ...entry, expiresAt, revokedAt: '' }));
}

function clearCustomerTokenExpiry(token) {
  return updateCustomerTokenAccess(token, entry => ({ ...entry, expiresAt: '' }));
}
function _safeReadObjectStore(key, label) {
  try {
    const parsed = DB.get(key);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`[${label}] invalid shape, resetting`);
      DB.set(key, {});
      return {};
    }
    return parsed;
  } catch (e) {
    console.warn(`[${label}] corrupted store, resetting`, e);
    DB.set(key, {});
    return {};
  }
}

function _safeWriteObjectStore(key, value, label) {
  try {
    DB.set(key, value || {});
  } catch (e) {
    console.warn(`[${label}] failed to write`, e);
  }
}

function _resolveEventCustomerToken(ev, opts = {}) {
  if (!ev || typeof ev !== 'object') return '';

  if (ev.customerToken && validateToken(ev.customerToken)) {
    return ev.customerToken;
  }

  const buyer = (ev.buyer || '').trim();
  const normPhone = normalizePhone(ev.phone || '');
  if (!buyer && !normPhone) return '';

  if (opts.createIfMissing) {
    const created = getOrCreateCustomerToken(buyer, normPhone);
    return validateToken(created) ? created : '';
  }

  const registry = DB.get('customerTokens') || {};

  if (normPhone && registry[normPhone] && validateToken(registry[normPhone].token)) {
    return registry[normPhone].token;
  }

  if (buyer && registry[buyer] && validateToken(registry[buyer].token)) {
    return registry[buyer].token;
  }

  const legacyNorm = legacyHashToken(buyer, normPhone);
  if (legacyNorm && validateToken(legacyNorm)) return legacyNorm;

  const legacyRaw = legacyHashToken(buyer, ev.phone || '');
  if (legacyRaw && validateToken(legacyRaw)) return legacyRaw;

  return '';
}

function _eventBelongsToToken(ev, token, regEntry) {
  if (!ev || !isCustomerEventType(ev.type)) return false;
  if (ev.customerToken === token) return true;

  const regPhone = normalizePhone(regEntry?.phone || '');
  if (regPhone && ev.phone && normalizePhone(ev.phone) === regPhone) return true;

  if (!ev.customerToken && (ev.buyer || ev.phone)) {
    const resolved = _resolveEventCustomerToken(ev, { createIfMissing: false });
    if (resolved && resolved === token) return true;
  }

  return false;
}

function _invalidateCustomerCacheFromEvent(ev) {
  if (!ev || !isCustomerEventType(ev.type)) return;
  const token = _resolveEventCustomerToken(ev, { createIfMissing: false });
  if (token) invalidateCustomerCache(token);
  else invalidateAllCustomerCache();
}

function buildCustomerEventIndex() {
  const events = getAllEvents();
  const index = {};
  let eventsChanged = false;

  events.forEach(ev => {
    try {
      if (!ev || !isCustomerEventType(ev.type)) return;
      if (ev.id == null) return;

      const token = _resolveEventCustomerToken(ev, { createIfMissing: true });
      if (!token || !validateToken(token)) return;

      if (ev.customerToken !== token) {
        ev.customerToken = token;
        eventsChanged = true;
      }

      if (!index[token]) index[token] = [];
      index[token].push(ev.id);
    } catch (e) {
      console.warn('[buildCustomerEventIndex] skip broken event', ev?.id, e);
    }
  });

  if (eventsChanged) {
    DB.set('events', events);
  }

  _safeWriteObjectStore('eventIndex', index, 'pm_eventIndex');
  return index;
}

function getCustomerEventIds(token) {
  if (!token || !validateToken(token)) return [];
  if (!getCustomerTokenAccessState(token).ok) return [];

  let index = _safeReadObjectStore('eventIndex', 'pm_eventIndex');
  const hasIndex = index && typeof index === 'object' && !Array.isArray(index);

  if (!hasIndex) {
    index = buildCustomerEventIndex();
  } else if (!Object.keys(index).length && getAllEvents().length) {
    index = buildCustomerEventIndex();
  }

  let ids = index[token];
  if (ids != null && !Array.isArray(ids)) {
    index = buildCustomerEventIndex();
    ids = index[token];
  }

  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter(id => id != null))];
}

function _safeGetCustomerCacheStore() {
  return _safeReadObjectStore('customerCache', 'pm_customerCache');
}

function _safeSetCustomerCacheStore(cache) {
  _safeWriteObjectStore('customerCache', cache || {}, 'pm_customerCache');
}

function invalidateCustomerCache(token) {
  if (!token || !validateToken(token)) return;
  const cache = _safeGetCustomerCacheStore();
  if (!cache[token]) return;
  delete cache[token];
  _safeSetCustomerCacheStore(cache);
}

function invalidateAllCustomerCache() {
  _safeSetCustomerCacheStore({});
}

function _isFullCustomerSummary(summary) {
  return !!summary
    && typeof summary === 'object'
    && validateToken(summary.token || '')
    && Array.isArray(summary.productBreakdown)
    && Array.isArray(summary.txHistory);
}

function getCustomerDebtSummaryCached(token) {
  if (!token || !validateToken(token)) return null;
  if (!getCustomerTokenAccessState(token).ok) return null;

  const cache = _safeGetCustomerCacheStore();
  const entry = cache[token];
  if (entry && entry.data && _isFullCustomerSummary(entry.data)) {
    return entry.data;
  }

  const summary = getCustomerDebtSummary(token);
  if (_isFullCustomerSummary(summary)) {
    cache[token] = {
      savedAt: new Date().toISOString(),
      data: summary,
    };
    _safeSetCustomerCacheStore(cache);
  }

  return summary;
}

function _isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function _countRegistryCustomers(registry) {
  if (!_isPlainObject(registry)) return 0;
  return new Set(
    Object.values(registry)
      .map(entry => entry?.token)
      .filter(token => validateToken(token))
  ).size;
}

function getDeviceId() {
  const current = DB.get('deviceId');
  if (typeof current === 'string' && current.trim()) return current;

  const created = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `device-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  DB.set('deviceId', created);
  return created;
}

function getLastSyncAt() {
  const value = DB.get('lastSyncAt');
  return typeof value === 'string' ? value : '';
}

function setLastSyncAt(value) {
  DB.set('lastSyncAt', typeof value === 'string' ? value : '');
}

function _pad2(num) {
  return String(num).padStart(2, '0');
}

function makeBackupFilename(date = new Date()) {
  return `backup-${date.getFullYear()}-${_pad2(date.getMonth() + 1)}-${_pad2(date.getDate())}-${_pad2(date.getHours())}${_pad2(date.getMinutes())}.json`;
}

function createBackupSnapshot(exportedAt = new Date().toISOString()) {
  const products = getProducts();
  const events = getAllEvents();
  const suppliers = getSuppliers();
  const customerTokens = DB.get('customerTokens') || {};
  const eventIndex = buildCustomerEventIndex();
  const customerCache = _safeGetCustomerCacheStore();
  const metadata = {
    productCount: products.length,
    eventCount: events.length,
    supplierCount: suppliers.length,
    customerCount: _countRegistryCustomers(customerTokens),
    deviceId: getDeviceId(),
    lastSyncAt: getLastSyncAt() || null,
  };

  return {
    version: APP_VERSION,
    exportedAt,
    exportDate: exportedAt,
    savedAt: exportedAt,
    appVersion: APP_VERSION,
    currencies: getCurrencies(),
    products,
    events,
    suppliers,
    customerTokens,
    eventIndex,
    customerCache,
    metadata,
  };
}

function _writeStorageKey(key, value) {
  DB.set(key, value);
}

function _readIntegrityStore(key, fallback, validator) {
  const current = DB.get(key);
  if (current == null) {
    _writeStorageKey(key, fallback);
    return { value: fallback, repaired: true };
  }

  try {
    const parsed = current;
    if (!validator(parsed)) {
      console.warn(`[checkStorageIntegrity] reset pm_${key}: invalid shape`);
      _writeStorageKey(key, fallback);
      return { value: fallback, repaired: true };
    }
    return { value: parsed, repaired: false };
  } catch (e) {
    console.warn(`[checkStorageIntegrity] reset pm_${key}: corrupted JSON`, e);
    _writeStorageKey(key, fallback);
    return { value: fallback, repaired: true };
  }
}

function checkStorageIntegrity() {
  let shouldRebuildIndex = false;
  let shouldClearCustomerCache = false;

  try {
    const productsState = _readIntegrityStore('products', [], Array.isArray);
    let products = productsState.value;
    if (productsState.repaired) {
      shouldRebuildIndex = true;
      shouldClearCustomerCache = true;
    }

    const cleanProducts = products.filter(p => p && typeof p === 'object' && p.id != null);
    if (cleanProducts.length !== products.length) {
      console.warn('[checkStorageIntegrity] filtered broken products');
      _writeStorageKey('products', cleanProducts);
      products = cleanProducts;
      shouldRebuildIndex = true;
      shouldClearCustomerCache = true;
    }

    const productIds = new Set(products.map(p => String(p.id)));

    const eventsState = _readIntegrityStore('events', [], Array.isArray);
    let events = eventsState.value;
    if (eventsState.repaired) {
      shouldRebuildIndex = true;
      shouldClearCustomerCache = true;
    }

    const cleanEvents = events.filter(ev => {
      if (!ev || typeof ev !== 'object') return false;
      if (ev.id == null || typeof ev.type !== 'string') return false;

      const hasProduct = ev.productId != null && ev.productId !== '' && productIds.has(String(ev.productId));
      if (ev.type === 'expense') {
        return ev.productId == null || ev.productId === '' || hasProduct;
      }

      return hasProduct;
    });
    if (cleanEvents.length !== events.length) {
      console.warn('[checkStorageIntegrity] filtered broken events');
      _writeStorageKey('events', cleanEvents);
      events = cleanEvents;
      shouldRebuildIndex = true;
      shouldClearCustomerCache = true;
    }

    const tokensState = _readIntegrityStore('customerTokens', {}, _isPlainObject);
    if (tokensState.repaired) {
      shouldRebuildIndex = true;
      shouldClearCustomerCache = true;
    }

    const indexState = _readIntegrityStore('eventIndex', {}, _isPlainObject);
    if (indexState.repaired) {
      shouldRebuildIndex = true;
    } else {
      const cleanedIndex = {};
      let changed = false;
      Object.entries(indexState.value).forEach(([token, ids]) => {
        if (!validateToken(token) || !Array.isArray(ids)) {
          changed = true;
          return;
        }
        cleanedIndex[token] = [...new Set(ids.filter(id => id != null))];
      });
      if (changed) {
        console.debug('[checkStorageIntegrity] repaired pm_eventIndex entries');
        _writeStorageKey('eventIndex', cleanedIndex);
        shouldRebuildIndex = true;
      }
    }

    const cacheState = _readIntegrityStore('customerCache', {}, _isPlainObject);
    if (cacheState.repaired) {
      shouldClearCustomerCache = true;
    } else {
      const cleanedCache = {};
      let changed = false;
      Object.entries(cacheState.value).forEach(([token, entry]) => {
        if (
          !validateToken(token)
          || !_isPlainObject(entry)
          || !_isFullCustomerSummary(entry.data)
        ) {
          changed = true;
          return;
        }
        cleanedCache[token] = {
          savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : '',
          data: entry.data,
        };
      });
      if (changed) {
        console.debug('[checkStorageIntegrity] repaired pm_customerCache entries');
        _writeStorageKey('customerCache', cleanedCache);
        shouldClearCustomerCache = true;
      }
    }
  } catch (e) {
    console.warn('[checkStorageIntegrity] unexpected error', e);
    shouldRebuildIndex = true;
    shouldClearCustomerCache = true;
  }

  if (shouldRebuildIndex) {
    try {
      buildCustomerEventIndex();
    } catch (e) {
      console.warn('[checkStorageIntegrity] failed to rebuild event index', e);
      _writeStorageKey('eventIndex', {});
    }
  }

  if (shouldClearCustomerCache) {
    invalidateAllCustomerCache();
  }
}

function validateBackupPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('پێکهاتەی backup دروست نییە.');
  }

  if (!Array.isArray(data.products)) {
    throw new Error('لە backup ـدا products پێویستە array بێت.');
  }

  const hasBrokenProduct = data.products.some(p => !p || typeof p !== 'object' || p.id == null);
  if (hasBrokenProduct) {
    throw new Error('هەموو product ـەکانی backup پێویستە id یان هەبێت.');
  }

  if (!Array.isArray(data.events)) {
    throw new Error('لە backup ـدا events پێویستە array بێت.');
  }

  if (!_isPlainObject(data.customerTokens)) {
    throw new Error('customerTokens پێویستە object بێت.');
  }

  if (data.currencies != null && !Array.isArray(data.currencies)) {
    throw new Error('currencies پێویستە array بێت.');
  }

  if (data.suppliers != null && !Array.isArray(data.suppliers)) {
    throw new Error('suppliers پێویستە array بێت.');
  }

  const productIds = new Set(data.products.map(p => String(p.id)));
  let skippedEvents = 0;
  const events = data.events.filter(ev => {
    if (!ev || typeof ev !== 'object' || ev.id == null || typeof ev.type !== 'string') {
      skippedEvents++;
      return false;
    }

    const hasProduct = ev.productId != null && ev.productId !== '' && productIds.has(String(ev.productId));
    const valid = ev.type === 'expense'
      ? (ev.productId == null || ev.productId === '' || hasProduct)
      : hasProduct;

    if (!valid) skippedEvents++;
    return valid;
  });

  if (skippedEvents) {
    console.warn(`[importData] skipped ${skippedEvents} broken events`);
  }

  const eventIndex = _isPlainObject(data.eventIndex) ? data.eventIndex : {};
  const customerCache = _isPlainObject(data.customerCache) ? data.customerCache : {};
  const metadata = _isPlainObject(data.metadata) ? data.metadata : {};
  const exportedAt = typeof data.exportedAt === 'string'
    ? data.exportedAt
    : (typeof data.exportDate === 'string'
      ? data.exportDate
      : (typeof data.savedAt === 'string' ? data.savedAt : ''));

  const sanitized = {
    version: typeof data.version === 'string' ? data.version : '',
    exportedAt,
    appVersion: typeof data.appVersion === 'string' ? data.appVersion : '',
    currencies: Array.isArray(data.currencies) ? data.currencies : DEFAULT_CURRENCIES,
    products: data.products,
    events,
    suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
    customerTokens: data.customerTokens,
    eventIndex,
    customerCache,
    metadata,
    skippedEvents,
  };

  return {
    sanitized,
    preview: {
      productCount: sanitized.products.length,
      eventCount: sanitized.events.length,
      supplierCount: sanitized.suppliers.length,
      customerCount: _countRegistryCustomers(sanitized.customerTokens),
      backupVersion: sanitized.version || sanitized.appVersion || 'Unknown',
      backupDate: sanitized.exportedAt || 'Unknown',
      deviceId: typeof metadata.deviceId === 'string' ? metadata.deviceId : '',
      lastSyncAt: typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : '',
      skippedEvents,
    },
  };
}

function _buildImportPreviewMessage(preview) {
  const lines = [
    'پوختەی backup:',
    `وەشانی backup: ${preview.backupVersion}`,
    `بەرواری backup: ${preview.backupDate}`,
    `ژمارەی کاڵاکان: ${preview.productCount}`,
    `ژمارەی مامەڵەکان: ${preview.eventCount}`,
    `ژمارەی فرۆشیارەکان: ${preview.supplierCount}`,
    `ژمارەی کڕیارەکان: ${preview.customerCount}`,
  ];

  if (preview.skippedEvents) {
    lines.push(`مامەڵە تێکشکاوەکان جیاکرانەوە: ${preview.skippedEvents}`);
  }

  lines.push('', 'دڵنیایت کە restore بکرێت؟');
  return lines.join('\n');
}
function _getCustomerEventsForToken(token, allEvents, regEntry, preferIndex = true) {
  if (!token || !validateToken(token)) return [];

  if (preferIndex) {
    const ids = getCustomerEventIds(token);
    if (ids.length) {
      const map = new Map();
      allEvents.forEach(ev => {
        if (ev && ev.id != null) map.set(String(ev.id), ev);
      });

      const fromIndex = ids
        .map(id => map.get(String(id)))
        .filter(ev => ev && isCustomerEventType(ev.type));

      if (fromIndex.length) return fromIndex;
    }
  }

  return allEvents.filter(ev => _eventBelongsToToken(ev, token, regEntry));
}

// ============================================================
// ===== Auto-Backup =====
// ============================================================
function silentAutoBackup() {
  try {
    const snap = createBackupSnapshot();
    const current = DB.get('autobackup');
    if (current) {
      DB.set('autobackup_prev', current);
    }
    DB.set('autobackup', snap);
    DB.set('autobackup_date', new Date().toLocaleString('en-GB'));
    console.debug(`[AutoBackup] v${APP_VERSION} ✅`, snap.savedAt.slice(0, 16));
  } catch (e) {
    console.warn('[AutoBackup] هەڵە:', e.message);
  }
}
setInterval(silentAutoBackup, 600_000);

// ============================================================
// ===== کاڵاکان =====
// ============================================================
function getProducts()      { return DB.get('products') || []; }
function saveProducts(list) { DB.set('products', list); }

function addProduct(data) {
  if (!ensureCloudWriteAccess('زیادکردنی کاڵا')) return null;
  const prods = getProducts();
  const prod  = {
    id:          nextId(),
    name:        data.name,
    unit:        data.unit           || 'دانە',
    qty:         parseFloat(data.qty)      || 0,  // پشتیوانی بۆ داتای کۆن
    buyPrice:    parseFloat(data.buyPrice) || 0,
    buyCurrency: data.buyCurrency    || 'IQD',
    supplier:    data.supplier       || '',
    buyDate:     data.buyDate        || today(),
    note:        data.note           || '',
    stockMode:   data.stockMode === 'manual' ? 'manual' : 'events',
    createdAt:   new Date().toISOString(),
  };
  prods.push(prod);
  saveProducts(prods);
  return prod;
}

function getProduct(id) {
  return getProducts().find(p => p.id == id);
}

function updateProduct(id, data) {
  if (!ensureCloudWriteAccess('دەستکاریکردنی کاڵا')) return null;
  const prods = getProducts();
  const p     = prods.find(x => x.id == id);
  if (!p) return null;
  if (data.name     !== undefined) p.name     = data.name;
  if (data.unit     !== undefined) p.unit     = data.unit;
  if (data.qty      !== undefined) p.qty      = parseFloat(data.qty) || 0;
  if (data.supplier !== undefined) p.supplier = data.supplier;
  if (data.note     !== undefined) p.note     = data.note;
  if (data.stockMode !== undefined) p.stockMode = data.stockMode === 'manual' ? 'manual' : 'events';
  saveProducts(prods);
  invalidateStatsCache();
  return p;
}

// product.qty تەنها بۆ پشتیوانیی داتای کۆنە
function updateProductQty(id, delta) {
  if (!ensureCloudWriteAccess('گۆڕینی بڕی کاڵا')) return null;
  invalidateStatsCache();
  const prods = getProducts();
  const p     = prods.find(x => x.id == id);
  if (p) { p.qty = (parseFloat(p.qty) || 0) + delta; saveProducts(prods); }
}

function reconcileLegacyProductStock() {
  const prods = getProducts();
  const events = DB.get('events') || [];
  let changed = false;

  prods.forEach(prod => {
    if (!prod || prod.id == null || prod.stockMode === 'manual') return;

    const legacyQty = parseFloat(prod.qty);
    if (!(legacyQty > 0)) return;

    let loadedQty = 0;
    let soldQty = 0;
    events.forEach(ev => {
      if (!ev || ev.productId != prod.id) return;
      if (ev.type === 'load') loadedQty += parseFloat(ev.qty) || 0;
      if (ev.type === 'sell_cash' || ev.type === 'sell_debt') soldQty += parseFloat(ev.qty) || 0;
    });

    const missingQty = roundMoney(legacyQty - (loadedQty - soldQty));
    if (missingQty <= 0.0001) return;

    const curr = prod.buyCurrency || 'USD';
    const rateSnapshot = getCurrencies().find(c => c.code === curr)?.rateToUSD || 1;
    events.push({
      id: nextId(),
      productId: prod.id,
      type: 'load',
      qty: missingQty,
      unitPrice: 0,
      totalPrice: 0,
      currency: curr,
      rateSnapshot,
      supplier: prod.supplier || '',
      date: prod.buyDate || today(),
      note: '[auto-repair] sync legacy qty',
      createdAt: new Date().toISOString(),
    });
    changed = true;
  });

  if (changed) {
    DB.set('events', events);
    invalidateStatsCache();
    console.warn('[stock] repaired legacy product quantities');
  }

  return changed;
}

// ============================================================
// ===== مامەڵەکان =====
// ============================================================
function getEvents(productId) { return (DB.get('events') || []).filter(e => e.productId == productId); }
function getAllEvents()        { return DB.get('events') || []; }

function _eventDateKey(ev) {
  return ev?.date || (typeof ev?.createdAt === 'string' ? ev.createdAt.split('T')[0] : '');
}

function _isDateInRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return false;

  if (from) {
    const f = new Date(from + 'T00:00:00');
    if (!Number.isNaN(f.getTime()) && d < f) return false;
  }
  if (to) {
    const t = new Date(to + 'T23:59:59');
    if (!Number.isNaN(t.getTime()) && d > t) return false;
  }
  return true;
}

function getExpenseEvents(opts = {}) {
  const from = opts.from || '';
  const to = opts.to || '';
  const includeProductCharges = !!opts.includeProductCharges;
  const expenseTypes = includeProductCharges
    ? ['expense', 'shipping', 'tax', 'raseed', 'omola']
    : ['expense'];

  let list = getAllEvents().filter(ev => ev && expenseTypes.includes(ev.type));
  if (from || to) {
    list = list.filter(ev => _isDateInRange(_eventDateKey(ev), from, to));
  }

  return list.sort((a, b) => {
    const ad = _eventDateKey(a) || '';
    const bd = _eventDateKey(b) || '';
    if (ad === bd) return (parseFloat(b.id) || 0) - (parseFloat(a.id) || 0);
    return ad < bd ? 1 : -1;
  });
}

function getExpenseStatsByRange(from, to, opts = {}) {
  const list = getExpenseEvents({ from, to, includeProductCharges: !!opts.includeProductCharges });
  let totalExpensesUSD = 0;
  let productExpensesUSD = 0;
  let generalExpensesUSD = 0;

  list.forEach(ev => {
    const amount = ev.amount != null ? ev.amount : (ev.totalPrice != null ? ev.totalPrice : 0);
    const usd = Number.isFinite(parseFloat(ev.amountUSD))
      ? parseFloat(ev.amountUSD)
      : toUSD(amount, ev.currency || 'USD');

    totalExpensesUSD += usd;
    if (ev.productId != null && ev.productId !== '') productExpensesUSD += usd;
    else generalExpensesUSD += usd;
  });

  return {
    count: list.length,
    totalExpensesUSD: roundMoney(totalExpensesUSD),
    productExpensesUSD: roundMoney(productExpensesUSD),
    generalExpensesUSD: roundMoney(generalExpensesUSD),
  };
}

function getExpenseSummary(opts = {}) {
  const todayKey = today();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const includeProductCharges = !!opts.includeProductCharges;

  const todayStats = getExpenseStatsByRange(todayKey, todayKey, { includeProductCharges });
  const monthStats = getExpenseStatsByRange(`${y}-${m}-01`, todayKey, { includeProductCharges });
  const allStats = getExpenseStatsByRange('2000-01-01', '2099-12-31', { includeProductCharges });

  return {
    todayExpensesUSD: todayStats.totalExpensesUSD,
    monthExpensesUSD: monthStats.totalExpensesUSD,
    totalExpensesUSD: allStats.totalExpensesUSD,
    productExpensesUSD: allStats.productExpensesUSD,
    generalExpensesUSD: allStats.generalExpensesUSD,
    todayCount: todayStats.count,
    monthCount: monthStats.count,
    totalCount: allStats.count,
  };
}

function addEvent(data) {
  if (!ensureCloudWriteAccess('تۆمارکردنی مامەڵە')) return null;
  invalidateStatsCache();
  const events = DB.get('events') || [];

  if (!data || typeof data !== 'object' || !data.type) {
    console.warn('[addEvent] زانیاری ناتەواو بۆ مامەڵە', data);
    return null;
  }

  const type = String(data.type || '').trim();
  if (!type) {
    console.warn('[addEvent] جۆری مامەڵە دروست نییە', data);
    return null;
  }

  let normalizedProductId = data.productId;
  if (normalizedProductId === '') normalizedProductId = null;

  const productIds = new Set(getProducts().map(p => String(p.id)));
  const hasValidProduct = normalizedProductId != null && normalizedProductId !== '' && productIds.has(String(normalizedProductId));

  if (type === 'expense') {
    if (normalizedProductId != null && normalizedProductId !== '' && !hasValidProduct) {
      console.warn('[addEvent] expense بە productId دروست پەیوەست نەکرا، وەک خەرجی گشتی پاشەکەوت کرا');
      normalizedProductId = null;
    }
    if (!(parseFloat(data.amount) > 0)) {
      console.warn('[addEvent] بڕی خەرجی دەبێت لە صفر زیاتر بێت', data);
      return null;
    }
  } else {
    if (!hasValidProduct) {
      console.warn('[addEvent] productId دروست نییە بۆ مامەڵە', data);
      return null;
    }
  }

  const currency     = data.currency || 'USD';
  const currs        = getCurrencies();
  const currObj      = currs.find(c => c.code === currency);
  const rateSnapshot = data.rateSnapshot || (currObj ? currObj.rateToUSD : 1);
  const sourceAmount = data.totalPrice != null
    ? parseFloat(data.totalPrice)
    : (data.amount != null ? parseFloat(data.amount) : 0);
  const amountUSD    = Number.isFinite(parseFloat(data.amountUSD))
    ? parseFloat(data.amountUSD)
    : toUSD(sourceAmount || 0, currency);

  // ===== Discount scaffold (Step 3 — پشتیوانی بۆ داشکاندن) =====
  // UI wiring لە Step 4 بەشێکی تر ئەم فیلدانە بەکاردەهێنێت
  const discountType  = data.discountType  || '';
  const discountValue = parseFloat(data.discountValue) || 0;
  const rawTotal      = data.rawTotal != null ? parseFloat(data.rawTotal) : (data.totalPrice != null ? parseFloat(data.totalPrice) : null);
  let discountAmount  = parseFloat(data.discountAmount) || 0;
  if (!discountAmount && discountType && discountValue && rawTotal) {
    discountAmount = discountType === 'percent'
      ? (rawTotal * discountValue) / 100
      : discountValue;
  }

  const ev = {
    id: nextId(),
    ...data,
    type,
    productId: normalizedProductId,
    currency,
    rateSnapshot,
    amountUSD,
    date: data.date || today(),
    discountType,
    discountValue,
    discountAmount,
    rawTotal: rawTotal ?? null,
    createdAt: new Date().toISOString(),
  };

  if (isCustomerEventType(ev.type)) {
    const tok = _resolveEventCustomerToken(ev, { createIfMissing: true });
    if (tok) ev.customerToken = tok;
  }

  events.push(ev);
  DB.set('events', events);

  buildCustomerEventIndex();
  _invalidateCustomerCacheFromEvent(ev);

  return ev;
}

function delEvent(id) {
  if (!ensureCloudWriteAccess('سڕینەوەی مامەڵە')) return null;
  invalidateStatsCache();
  const events = DB.get('events') || [];
  const ev     = events.find(e => e.id == id);
  DB.set('events', events.filter(e => e.id != id));

  buildCustomerEventIndex();
  _invalidateCustomerCacheFromEvent(ev);

  return ev;
}

// ============================================================
// ===== وەرگرتنی مامەڵەکان =====
// ============================================================
function getSuppliers() { return DB.get('suppliers') || []; }
function addSupplier(name, phone) {
  if (!ensureCloudWriteAccess('زیادکردنی فرۆشیار')) return getSuppliers();
  const s = [...getSuppliers(), { id: nextId(), name, phone: phone || '' }];
  DB.set('suppliers', s);
  return s;
}

// ============================================================
// ===== ژمارە و پوختە =====
// ============================================================
let _statsCache        = {};
let _statsCacheVersion = 0;

function invalidateStatsCache() {
  _statsCache = {};
  _statsCacheVersion++;
}

// ============================================================
// ===== ئامارەکانی کاڵا و Step 3: event-based =====
//
//  • بار (کڕین):
//     profitUSD = totalRevenueUSD - totalCostUSD
//     stockQty  = product.qty
//
//  • فرۆشتن (خروج):
//     unitCostUSD = totalCostUSD / totalLoadedQty
//     soldCostUSD = unitCostUSD * totalSoldQty
//     profitUSD   = totalRevenueUSD - soldCostUSD
//     stockQty    = totalLoadedQty - totalSoldQty  (event-based)
// ============================================================
function getProductStats(productId) {
  if (_statsCache[productId]) return _statsCache[productId];

  const events = getEvents(productId);
  let loadCostUSD = 0, shippingUSD = 0, taxUSD = 0, raseedUSD = 0, omolaUSD = 0, expenseUSD = 0;
  let totalLoadedQty  = 0;
  let cashRevenueUSD  = 0, debtRevenueUSD = 0, debtPaidUSD = 0, totalSoldQty = 0;
  let totalDiscountUSD = 0;

  events.forEach(ev => {
    try {
      if (!ev || !ev.type) return;
      switch (ev.type) {
        case 'load':
          if (ev.totalPrice == null || !ev.currency) break;
          loadCostUSD    += toUSD(ev.totalPrice, ev.currency);
          totalLoadedQty += parseFloat(ev.qty) || 0;
          break;
        case 'shipping':
          if (ev.amount != null && ev.currency) shippingUSD += toUSD(ev.amount, ev.currency);
          break;
        case 'tax':
          if (ev.amount != null && ev.currency) taxUSD      += toUSD(ev.amount, ev.currency);
          break;
        case 'raseed':
          if (ev.amount != null && ev.currency) raseedUSD   += toUSD(ev.amount, ev.currency);
          break;
        case 'omola':
          if (ev.amount != null && ev.currency) omolaUSD    += toUSD(ev.amount, ev.currency);
          break;
        case 'expense':
          if (ev.amount != null && ev.currency) expenseUSD  += toUSD(ev.amount, ev.currency);
          break;
        case 'sell_cash':
          if (ev.totalPrice == null || !ev.currency) break;
          cashRevenueUSD  += toUSD(ev.totalPrice, ev.currency);
          totalSoldQty    += parseFloat(ev.qty) || 0;
          if (ev.discountAmount) totalDiscountUSD += toUSD(ev.discountAmount, ev.currency);
          break;
        case 'sell_debt':
          if (ev.totalPrice == null || !ev.currency) break;
          debtRevenueUSD  += toUSD(ev.totalPrice, ev.currency);
          totalSoldQty    += parseFloat(ev.qty) || 0;
          if (ev.discountAmount) totalDiscountUSD += toUSD(ev.discountAmount, ev.currency);
          break;
        case 'debt_pay':
          if (ev.amount != null && ev.currency) debtPaidUSD += toUSD(ev.amount, ev.currency);
          break;
      }
    } catch (e) {
      console.warn('getProductStats: هەڵە لە خوێندنەوەی مامەڵەدا لە id:', ev?.id, e);
    }
  });

  // ===== کۆی خەرجی کڕین =====
  const totalCostUSD = loadCostUSD + shippingUSD + taxUSD + raseedUSD + omolaUSD + expenseUSD;

  // ===== Step 3: نرخی یەکە لەسەر بنەمای کاڵای هاتوو =====
  const unitCostUSD = totalLoadedQty > 0 ? totalCostUSD / totalLoadedQty : 0;
  const soldCostUSD = unitCostUSD * totalSoldQty;

  // ===== فرۆشتن =====
  const totalRevenueUSD = cashRevenueUSD + debtRevenueUSD;
  const debtRemainUSD   = Math.max(0, debtRevenueUSD - debtPaidUSD);

  // ===== Step 3: تێچووی فرۆشراو =====
  const profitUSD = totalRevenueUSD - soldCostUSD;

  // ===== Step 3: ستۆک بە event-based =====
  const stockQtyEvent = totalLoadedQty - totalSoldQty;
  // backward compat reference
  const prod            = getProduct(productId);
  const stockQtyLegacy  = prod ? parseFloat(prod.qty) || 0 : 0;
  const stockMode       = prod?.stockMode === 'manual' ? 'manual' : 'events';
  const stockQty        = stockMode === 'manual' ? stockQtyLegacy : stockQtyEvent;

  return _statsCache[productId] = {
    loadCostUSD: roundMoney(loadCostUSD),
    shippingUSD: roundMoney(shippingUSD),
    taxUSD: roundMoney(taxUSD),
    raseedUSD: roundMoney(raseedUSD),
    omolaUSD: roundMoney(omolaUSD),
    expenseUSD: roundMoney(expenseUSD),
    totalCostUSD: roundMoney(totalCostUSD),
    unitCostUSD: roundMoney(unitCostUSD),
    soldCostUSD: roundMoney(soldCostUSD),
    cashRevenueUSD: roundMoney(cashRevenueUSD),
    debtRevenueUSD: roundMoney(debtRevenueUSD),
    debtPaidUSD: roundMoney(debtPaidUSD),
    totalRevenueUSD: roundMoney(totalRevenueUSD),
    totalDiscountUSD: roundMoney(totalDiscountUSD),
    profitUSD: roundMoney(profitUSD),
    debtRemainUSD: Math.max(0, roundMoney(debtRevenueUSD - debtPaidUSD)),
    totalLoadedQty, totalSoldQty,
    stockQty, stockQtyEvent, stockQtyLegacy, stockMode,
    remainingStockValueUSD: roundMoney(stockQty > 0 ? unitCostUSD * stockQty : 0),
    events,
  };
}

// ============================================================
// ===== پوختەی گشتی =====
// ============================================================
function getGlobalStats() {
  const prods = getProducts();
  const g = {
    totalCostUSD: 0, soldCostUSD: 0, totalRevenueUSD: 0,
    debtRemainUSD: 0, profitUSD: 0, remainingStockValueUSD: 0,
    productExpensesUSD: 0, generalExpensesUSD: 0, totalExpensesUSD: 0,
  };
  prods.forEach(p => {
    const s = getProductStats(p.id);
    g.totalCostUSD    += s.totalCostUSD;
    g.soldCostUSD     += s.soldCostUSD;
    g.totalRevenueUSD += s.totalRevenueUSD;
    g.debtRemainUSD   += s.debtRemainUSD;
    g.profitUSD       += s.profitUSD;
    g.remainingStockValueUSD += s.remainingStockValueUSD;
  });
  g.debtRemainUSD = Math.max(0, roundMoney(g.debtRemainUSD));
  g.remainingStockValueUSD = roundMoney(g.remainingStockValueUSD);

  const expenseSummary = getExpenseSummary();
  g.productExpensesUSD = expenseSummary.productExpensesUSD;
  g.generalExpensesUSD = expenseSummary.generalExpensesUSD;
  g.totalExpensesUSD = expenseSummary.totalExpensesUSD;

  return g;
}

// ============================================================
// ===== قازانج بەپێی ماوە و Step 3: sold-cost =====
// ============================================================
function getProfitByRange(from, to) {
  const fromD = new Date(from + 'T00:00:00');
  const toD   = new Date(to   + 'T23:59:59');
  const unitCostMap = {};
  getProducts().forEach(p => { unitCostMap[p.id] = getProductStats(p.id).unitCostUSD; });

  const events = getAllEvents();
  let revenueUSD = 0, soldCostUSD = 0, rawCostUSD = 0;
  let soldQty = 0, saleCount = 0;
  let debtCreatedUSD = 0, debtPaidUSD = 0, totalDiscountUSD = 0;
  let productExpensesUSD = 0, generalExpensesUSD = 0;

  events.forEach(ev => {
    const d = ev.date || ev.createdAt?.split('T')[0];
    if (!d) return;
    const dD = new Date(d + 'T12:00:00');
    if (dD < fromD || dD > toD) return;
    if (ev.type === 'sell_cash' || ev.type === 'sell_debt') {
      revenueUSD  += toUSD(ev.totalPrice, ev.currency);
      soldCostUSD += (unitCostMap[ev.productId] || 0) * (parseFloat(ev.qty) || 0);
      soldQty     += parseFloat(ev.qty) || 0;
      saleCount++;
      if (ev.discountAmount) totalDiscountUSD += toUSD(ev.discountAmount, ev.currency);
    }
    if (ev.type === 'sell_debt') debtCreatedUSD += toUSD(ev.totalPrice, ev.currency);
    if (ev.type === 'debt_pay') debtPaidUSD += toUSD(ev.amount, ev.currency);
    if (['load','shipping','tax','raseed','omola'].includes(ev.type)) {
      const costUSD = toUSD(ev.totalPrice ?? ev.amount, ev.currency);
      rawCostUSD += costUSD;
      if (['shipping', 'tax', 'raseed', 'omola'].includes(ev.type)) {
        if (ev.productId != null && ev.productId !== '') productExpensesUSD += costUSD;
        else generalExpensesUSD += costUSD;
      }
    }

    if (ev.type === 'expense') {
      const exUSD = toUSD(ev.amount ?? ev.totalPrice ?? 0, ev.currency || 'USD');
      rawCostUSD += exUSD;
      if (ev.productId != null && ev.productId !== '') productExpensesUSD += exUSD;
      else generalExpensesUSD += exUSD;
    }
  });

  const profitUSD = revenueUSD - soldCostUSD;
  return {
    revenueUSD:      roundMoney(revenueUSD),
    costUSD:         roundMoney(soldCostUSD),
    soldCostUSD:     roundMoney(soldCostUSD),
    rawCostUSD:      roundMoney(rawCostUSD),
    profitUSD:       roundMoney(profitUSD),
    soldQty:         roundMoney(soldQty),
    saleCount,
    avgSaleUSD:      roundMoney(saleCount > 0 ? revenueUSD / saleCount : 0),
    profitMarginPct: roundMoney(revenueUSD > 0 ? (profitUSD / revenueUSD) * 100 : 0),
    costRecoveryPct: roundMoney(soldCostUSD > 0 ? (revenueUSD / soldCostUSD) * 100 : 0),
    debtCreatedUSD:  roundMoney(debtCreatedUSD),
    debtPaidUSD:     roundMoney(debtPaidUSD),
    totalDiscountUSD: roundMoney(totalDiscountUSD),
    productExpensesUSD: roundMoney(productExpensesUSD),
    generalExpensesUSD: roundMoney(generalExpensesUSD),
    totalExpensesUSD: roundMoney(productExpensesUSD + generalExpensesUSD),
  };
}

// ============================================================
// ===== EXPORT =====
// ============================================================
function exportData() {
  const data = createBackupSnapshot();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = makeBackupFilename(new Date());
  a.click();
  URL.revokeObjectURL(url);
  return data;
}

// ============================================================
// ===== IMPORT =====
// ============================================================
function applyBackupPayload(parsed, opts = {}) {
  const { sanitized, preview } = validateBackupPayload(parsed);
  const requireConfirm = opts.requireConfirm !== false;

  if (requireConfirm && !confirm(_buildImportPreviewMessage(preview))) {
    const cancelErr = new Error('هاوردەکردن هەڵوەشایەوە.');
    cancelErr.code = 'IMPORT_CANCELLED';
    throw cancelErr;
  }

  saveCurrencies(sanitized.currencies);
  DB.set('products', sanitized.products);
  DB.set('events', sanitized.events);
  DB.set('suppliers', sanitized.suppliers);
  DB.set('customerTokens', sanitized.customerTokens);
  DB.set('eventIndex', sanitized.eventIndex);
  DB.set('customerCache', sanitized.customerCache);
  setLastSyncAt(preview.lastSyncAt || sanitized.exportedAt || '');

  repairCustomerRegistry();
  _migrateOrphanedTokens();
  reconcileLegacyProductStock();
  buildCustomerEventIndex();
  invalidateAllCustomerCache();
  invalidateStatsCache();
  silentAutoBackup();

  return {
    ...sanitized,
    preview,
  };
}

function importData(file) {
  if (!ensureCloudAdminAccess('هاوردەکردنی داتا')) {
    return Promise.reject(new Error('ئەم کارە تەنها بۆ admin ڕێگەپێدراوە.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        resolve(applyBackupPayload(parsed, { requireConfirm: true }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('خوێندنەوەی backup شکستی هێنا.'));
    reader.readAsText(file);
  });
}

window.applyBackupPayload = applyBackupPayload;

// ============================================================
// ===== EXPORT CSV — کاڵاکان =====
// ============================================================
function exportToCSV() {
  const prods = getProducts();
  const BOM   = '\uFEFF';
  let csv = BOM + 'ناو,یەکە,ستۆک,کۆی تێچوو (USD),تێچووی فرۆشراو (USD),کۆی فرۆشتن (USD),قازانج (USD),قەرزی ماوە (USD),فرۆشیار,تێبینی\n';
  prods.forEach(p => {
    const s = getProductStats(p.id);
    csv += [
      '"' + p.name.replace(/"/g, '""') + '"',
      '"' + p.unit + '"',
      fmtN(s.stockQty, 2),
      s.totalCostUSD.toFixed(2),
      s.soldCostUSD.toFixed(2),
      s.totalRevenueUSD.toFixed(2),
      s.profitUSD.toFixed(2),
      s.debtRemainUSD.toFixed(2),
      '"' + (p.supplier || '').replace(/"/g, '""') + '"',
      '"' + (p.note || '').replace(/"/g, '""') + '"',
    ].join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `products-${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// ===== EXPORT CSV — مامەڵەکان =====
// ============================================================
function exportEventsToCSV() {
  const events = getAllEvents();
  const prods  = getProducts();
  const BOM    = '\uFEFF';
  const types  = {
    load: 'بارکردن', shipping: 'کرێی بار', tax: 'باج',
    raseed: 'ڕەسید', omola: 'عومولە',
    expense: 'خەرجی',
    sell_cash: 'فرۆشتنی نەقد', sell_debt: 'فرۆشتنی قەرز', debt_pay: 'پارەدانەوە',
  };
  let csv = BOM + 'جۆر,کاڵا,بەروار,بڕ,نرخی یەکە,کۆی نرخ,داشکاندن,دراو,بەرامبەر USD,کڕیار,تەلەفون,تێبینی\n';
  events.forEach(ev => {
    const prod = prods.find(p => p.id == ev.productId);
    csv += [
      '"' + (types[ev.type] || ev.type) + '"',
      '"' + (prod?.name || '').replace(/"/g, '""') + '"',
      ev.date || '',
      ev.qty  != null ? fmtN(ev.qty, 2) : '',
      ev.unitPrice  != null ? ev.unitPrice.toFixed(2)  : '',
      ev.totalPrice != null ? ev.totalPrice.toFixed(2) : (ev.amount != null ? ev.amount.toFixed(2) : ''),
      ev.discountAmount ? ev.discountAmount.toFixed(2) : '',
      ev.currency || '',
      ev.amountUSD  ? ev.amountUSD.toFixed(2) : '',
      '"' + (ev.buyer || '').replace(/"/g, '""') + '"',
      ev.phone || '',
      '"' + (ev.note  || '').replace(/"/g, '""') + '"',
    ].join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `events-${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// ===== EXPORT PDF =====
// ============================================================
function exportToPDF() {
  const prods = getProducts();
  const g     = getGlobalStats();
  const now   = new Date().toLocaleDateString('ar-IQ');
  let rows = '';
  prods.forEach((p, i) => {
    const s = getProductStats(p.id);
    rows += `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(p.name)}</td>
      <td>${fmtN(s.stockQty, 2)} ${escHtml(p.unit)}</td>
      <td style="color:#dc2626">${fmtC(s.soldCostUSD, 'USD')}</td>
      <td style="color:#16a34a">${fmtC(s.totalRevenueUSD, 'USD')}</td>
      <td style="font-weight:800;color:${s.profitUSD >= 0 ? '#16a34a' : '#dc2626'}">${fmtC(s.profitUSD, 'USD')}</td>
      <td style="color:${s.debtRemainUSD > 0 ? '#dc2626' : '#16a34a'}">${s.debtRemainUSD > 0.001 ? fmtC(s.debtRemainUSD, 'USD') : '?'}</td>
    </tr>`;
  });
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
<title>ڕاپۆرتی کاڵاکان</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans Arabic',Arial,sans-serif;color:#111;background:#fff;font-size:12px;direction:rtl;padding:14mm}
h1{font-size:18px;margin-bottom:4px}.meta{color:#666;font-size:11px;margin-bottom:16px}
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
  <div class="st"><div class="sv">${prods.length}</div><div class="sl">کۆی کاڵاکان</div></div>
  <div class="st ok"><div class="sv" style="color:#16a34a">${fmtC(g.totalRevenueUSD, 'USD')}</div><div class="sl">کۆی فرۆشتن</div></div>
  <div class="st bad"><div class="sv" style="color:#dc2626">${fmtC(g.soldCostUSD, 'USD')}</div><div class="sl">تێچووی فرۆشراو</div></div>
  <div class="st ${g.profitUSD >= 0 ? 'ok' : 'bad'}"><div class="sv" style="color:${g.profitUSD >= 0 ? '#16a34a' : '#dc2626'}">${fmtC(g.profitUSD, 'USD')}</div><div class="sl">${g.profitUSD >= 0 ? 'قازانج' : 'زەرەر'}</div></div>
</div>
<table>
<thead><tr><th>#</th><th>کاڵا</th><th>ستۆک</th><th>تێچووی فرۆشراو</th><th>فرۆشتن</th><th>قازانج</th><th>قەرز</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#999">هیچ کاڵایەک نییە</td></tr>'}</tbody>
</table>
<div class="footer">سیستەمی بەڕێوەبردنی کاڵا · v2.4 · ${now}</div>
</body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ============================================================
// ===== کاڵاکانی ستۆکی کەم =====
// ============================================================
function getLowStockProducts(threshold = 5) {
  return getProducts().filter(p => {
    const s = getProductStats(p.id);
    return s.stockQty <= threshold && s.stockQty >= 0;
  });
}

// ============================================================
// ===== ئاگاداری کۆتایی قەرز =====
// ============================================================
function getDebtDueAlerts() {
  const events   = getAllEvents();
  const todayStr = today();
  const debtMap  = {};

  events.forEach(ev => {
    try {
      if (!ev || !ev.type) return;
      // Step 3: registry lookup بۆ ناو و ژمارەی کڕیار
      const regEntry = ev.customerToken ? lookupCustomerByToken(ev.customerToken) : null;
      const mapKey   = ev.customerToken
        || ((ev.buyer || '') + '_' + (ev.phone || ''));

      if (ev.type === 'sell_debt') {
        if (!debtMap[mapKey]) {
          debtMap[mapKey] = {
            name:    regEntry?.name || ev.buyer || 'کڕیار',
            phone:   regEntry?.phone || ev.phone || '',
            owedUSD: 0,
            dueDate: ev.dueDate || '',
          };
        }
        debtMap[mapKey].owedUSD += toUSD(ev.totalPrice, ev.currency);
        if (ev.dueDate && (!debtMap[mapKey].dueDate || ev.dueDate > debtMap[mapKey].dueDate)) {
          debtMap[mapKey].dueDate = ev.dueDate;
        }
      }
      if (ev.type === 'debt_pay' && debtMap[mapKey]) {
        debtMap[mapKey].owedUSD -= toUSD(ev.amount, ev.currency);
      }
    } catch (e) {
      console.warn('getDebtDueAlerts: هەڵە لە خوێندنەوەی مامەڵە', ev?.id, e);
    }
  });

  const alerts = [];
  Object.values(debtMap).forEach(d => {
    if (d.owedUSD <= 0.001 || !d.dueDate) return;
    const diffDays = Math.round((new Date(d.dueDate) - new Date(todayStr)) / 86400000);
    if (diffDays < 0)       alerts.push({ ...d, status: 'overdue', diffDays });
    else if (diffDays <= 7) alerts.push({ ...d, status: 'soon', diffDays });
  });

  return alerts;
}

// ============================================================
// ===== پوختەی قەرزی کڕیار — Step 5 =====
// لە app.js و customer.html بەکار دێت
// پێویست: token
// دەرچوون: { name, phone, token, totalBoughtUSD, totalDebtUSD,
//            totalPaidUSD, debtRemainUSD, paidPct,
//            productBreakdown: [{prodId, name, unit, debtUSD, paidUSD, remainUSD, dueDate}],
//            txHistory: [{type, date, prod, qty, unit, amount, currency, dueDate, note}] }
// ============================================================
function getCustomerDebtSummary(token, opts = {}) {
  if (!token || !validateToken(token)) return null;
  const access = getCustomerTokenAccessState(token);
  if (!access.ok) return null;

  const allEvs = getAllEvents();
  const prods  = getProducts();
  const reg    = access.entry || lookupCustomerByToken(token);
  const preferIndex = opts.preferIndex !== false;

  const myEvs = Array.isArray(opts.events)
    ? opts.events
    : _getCustomerEventsForToken(token, allEvs, reg, preferIndex);

  if (!myEvs.length) return null;

  const first = myEvs.find(e => e.buyer) || myEvs[0];
  const name  = reg?.name  || first.buyer || 'کڕیار';
  const phone = normalizePhone(reg?.phone || first.phone || '');

  const prodMap = {};
  let totalBoughtUSD = 0, totalDebtUSD = 0, totalPaidUSD = 0;
  const txHistory = [];

  myEvs.forEach(ev => {
    const prod  = prods.find(p => p.id == ev.productId);
    const pname = prod ? prod.name : '-';
    const punit = prod ? prod.unit : '';
    const pid   = ev.productId;

    if (ev.type === 'sell_cash') {
      totalBoughtUSD += toUSD(ev.totalPrice, ev.currency);
      txHistory.push({ type: 'sell_cash', date: ev.date || '', prod: pname, unit: punit, qty: ev.qty, amount: ev.totalPrice, currency: ev.currency, dueDate: '', note: ev.note || '', discountAmount: ev.discountAmount || 0, rawTotal: ev.rawTotal || ev.totalPrice });
    }

    if (ev.type === 'sell_debt') {
      totalBoughtUSD += toUSD(ev.totalPrice, ev.currency);
      totalDebtUSD   += toUSD(ev.totalPrice, ev.currency);
      txHistory.push({ type: 'sell_debt', date: ev.date || '', prod: pname, unit: punit, qty: ev.qty, amount: ev.totalPrice, currency: ev.currency, dueDate: ev.dueDate || '', note: ev.note || '', discountAmount: ev.discountAmount || 0, rawTotal: ev.rawTotal || ev.totalPrice });
      if (!prodMap[pid]) prodMap[pid] = { prodId: pid, name: pname, unit: punit, debtUSD: 0, paidUSD: 0, dueDate: '' };
      prodMap[pid].debtUSD += toUSD(ev.totalPrice, ev.currency);
      if (ev.dueDate && (!prodMap[pid].dueDate || ev.dueDate > prodMap[pid].dueDate)) {
        prodMap[pid].dueDate = ev.dueDate;
      }
    }

    if (ev.type === 'debt_pay') {
      totalPaidUSD += toUSD(ev.amount, ev.currency);
      txHistory.push({ type: 'debt_pay', date: ev.date || '', prod: pname, unit: punit, qty: null, amount: ev.amount, currency: ev.currency, dueDate: '', note: ev.note || '' });
      const totalProdDebt = Object.values(prodMap).reduce((s, x) => s + x.debtUSD, 0);
      if (totalProdDebt > 0) {
        const payUSD = toUSD(ev.amount, ev.currency);
        Object.values(prodMap).forEach(pm => {
          if (pm.debtUSD > 0) {
            pm.paidUSD += payUSD * (pm.debtUSD / totalProdDebt);
          }
        });
      }
    }
  });

  const debtRemainUSD = Math.max(0, roundMoney(totalDebtUSD - totalPaidUSD));
  const paidPct = totalDebtUSD > 0 ? Math.min(100, roundMoney((totalPaidUSD / totalDebtUSD) * 100)) : 100;
  const productBreakdown = Object.values(prodMap)
    .map(pm => ({ ...pm, remainUSD: Math.max(0, roundMoney(pm.debtUSD - pm.paidUSD)) }))
    .filter(pm => pm.debtUSD > 0)
    .sort((a, b) => b.remainUSD - a.remainUSD);

  txHistory.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);

  return {
    name, phone, token,
    totalBoughtUSD: roundMoney(totalBoughtUSD),
    totalDebtUSD: roundMoney(totalDebtUSD),
    totalPaidUSD: roundMoney(totalPaidUSD),
    debtRemainUSD, paidPct,
    productBreakdown, txHistory,
  };
}


