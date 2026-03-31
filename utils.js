// ============================================================
// utils.js ï؟½ ï؟½ï؟½ï؟½ï؟½?ï؟½ï؟½ï؟½?ï؟½?ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½?ï؟½  v2.4
// ?? ï؟½?ï؟½?ï؟½ ï؟½?ï؟½ data.js ï؟½ app.js ï؟½ï؟½ï؟½ بکï؟½?ï؟½
// ============================================================

// ===== XSS Protection =====
function escHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

// ===== Storage Engine: IndexedDB primary + in-memory mirror =====
(function initPMStorage() {
  if (window.PMStorage) return;

  const PREFIX = 'pm_';
  const DB_NAME = 'pm_inventory_storage_v1';
  const STORE_NAME = 'kv';
  const ENGINE_MARKER = `${PREFIX}storage_engine`;
  const cloneValue = value => {
    if (value == null) return value;
    try {
      if (typeof structuredClone === 'function') return structuredClone(value);
    } catch (_) {}
    return JSON.parse(JSON.stringify(value));
  };

  let memory = {};
  let ready = false;
  let mode = 'localStorage';
  let openPromise = null;
  let readyPromise = null;
  let writeQueue = Promise.resolve();

  function pmKey(key) {
    return `${PREFIX}${key}`;
  }

  function stripPrefix(key) {
    return String(key || '').startsWith(PREFIX) ? String(key).slice(PREFIX.length) : String(key || '');
  }

  function listLegacyLocalKeys() {
    return Object.keys(localStorage).filter(key => key.startsWith(PREFIX) && key !== ENGINE_MARKER);
  }

  function localReadParsed(key) {
    try {
      return JSON.parse(localStorage.getItem(pmKey(key)) || 'null');
    } catch (_) {
      return null;
    }
  }

  function localWriteParsed(key, value) {
    localStorage.setItem(pmKey(key), JSON.stringify(value));
  }

  function localRemoveKey(key) {
    localStorage.removeItem(pmKey(key));
  }

  function openIndexedDb() {
    if (openPromise) return openPromise;
    openPromise = new Promise(resolve => {
      if (!('indexedDB' in window)) {
        resolve(null);
        return;
      }
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return openPromise;
  }

  function withStore(type, worker) {
    return openIndexedDb().then(db => new Promise(resolve => {
      if (!db) {
        resolve(null);
        return;
      }
      try {
        const tx = db.transaction(STORE_NAME, type);
        const store = tx.objectStore(STORE_NAME);
        const result = worker(store, tx);
        tx.oncomplete = () => resolve(result ?? true);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    }));
  }

  function loadAllFromIndexedDb() {
    return withStore('readonly', store => new Promise(resolve => {
      const data = {};
      const request = store.openCursor();
      request.onsuccess = event => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve(data);
          return;
        }
        data[String(cursor.key)] = cloneValue(cursor.value);
        cursor.continue();
      };
      request.onerror = () => resolve(data);
    }));
  }

  function writeAllToIndexedDb(snapshot) {
    return withStore('readwrite', store => {
      Object.entries(snapshot || {}).forEach(([key, value]) => store.put(cloneValue(value), String(key)));
      return true;
    });
  }

  function removeAllLegacyLocalKeys() {
    listLegacyLocalKeys().forEach(key => localStorage.removeItem(key));
  }

  async function bootstrap() {
    const db = await openIndexedDb();
    if (db) {
      const persisted = await loadAllFromIndexedDb();
      const hasPersisted = persisted && Object.keys(persisted).length > 0;
      if (hasPersisted) {
        memory = persisted;
        mode = 'indexedDB';
        localStorage.setItem(ENGINE_MARKER, 'indexedDB');
        ready = true;
        return;
      }

      const legacy = {};
      listLegacyLocalKeys().forEach(key => {
        const stripped = stripPrefix(key);
        try {
          legacy[stripped] = JSON.parse(localStorage.getItem(key) || 'null');
        } catch (_) {
          legacy[stripped] = null;
        }
      });
      memory = legacy;
      mode = 'indexedDB';
      await writeAllToIndexedDb(memory);
      removeAllLegacyLocalKeys();
      localStorage.setItem(ENGINE_MARKER, 'indexedDB');
      ready = true;
      return;
    }

    const legacy = {};
    listLegacyLocalKeys().forEach(key => {
      const stripped = stripPrefix(key);
      legacy[stripped] = localReadParsed(stripped);
    });
    memory = legacy;
    mode = 'localStorage';
    ready = true;
  }

  function ensureReady() {
    if (ready) return Promise.resolve();
    if (!readyPromise) readyPromise = bootstrap();
    return readyPromise;
  }

  function scheduleWrite(task) {
    writeQueue = writeQueue.then(() => ensureReady()).then(() => task()).catch(() => null);
    return writeQueue;
  }

  function persistKey(key) {
    if (mode !== 'indexedDB') {
      try {
        if (memory[key] === undefined) localRemoveKey(key);
        else localWriteParsed(key, memory[key]);
      } catch (_) {}
      return Promise.resolve(true);
    }
    return withStore('readwrite', store => {
      if (memory[key] === undefined) store.delete(String(key));
      else store.put(cloneValue(memory[key]), String(key));
      return true;
    });
  }

  function clearIndexedDb() {
    if (mode !== 'indexedDB') return Promise.resolve(true);
    return withStore('readwrite', store => {
      store.clear();
      return true;
    });
  }

window.PMStorage = {
    prefix: PREFIX,
    ready: ensureReady,
    isReady: () => ready,
    mode: () => mode,
    getSync(key) {
      return cloneValue(memory[String(key)]);
    },
    setSync(key, value) {
      memory[String(key)] = cloneValue(value);
      scheduleWrite(() => persistKey(String(key)));
      return cloneValue(value);
    },
    removeSync(key) {
      delete memory[String(key)];
      scheduleWrite(() => persistKey(String(key)));
    },
    clearSync() {
      memory = {};
      listLegacyLocalKeys().forEach(key => localStorage.removeItem(key));
      return scheduleWrite(() => clearIndexedDb());
    },
    getLocalMeta(key) {
      return localReadParsed(key);
    },
    setLocalMeta(key, value) {
      localWriteParsed(key, value);
    },
    removeLocalMeta(key) {
      localRemoveKey(key);
    },
    estimateManagedBytesSync() {
      const memoryBytes = Object.entries(memory).reduce((sum, [key, value]) => {
        try {
          return sum + key.length + JSON.stringify(value).length;
        } catch (_) {
          return sum;
        }
      }, 0);
      const localBytes = Object.keys(localStorage).filter(key => key.startsWith(PREFIX)).reduce((sum, key) => {
        return sum + key.length + String(localStorage.getItem(key) || '').length;
      }, 0);
      return Math.max(memoryBytes, 0) + localBytes;
    },
  };
})();

// ===== PWA registration + install prompt =====
(function initPWAHelpers() {
  if (typeof window === 'undefined') return;

  let deferredInstallPrompt = null;
  let serviceWorkerBootstrapped = false;

  function updateInstallButtons() {
    const canInstall = !!deferredInstallPrompt;
    document.querySelectorAll('[data-install-app]').forEach(btn => {
      btn.hidden = !canInstall;
      btn.setAttribute('aria-hidden', canInstall ? 'false' : 'true');
    });
  }

  async function registerPMServiceWorker() {
    if (serviceWorkerBootstrapped) return true;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;

    try {
      await navigator.serviceWorker.register('./sw.js');
      serviceWorkerBootstrapped = true;
      return true;
    } catch (err) {
      console.warn('[PWA] service worker registration failed', err);
      return false;
    }
  }

  async function installAppPrompt(btn) {
    if (!deferredInstallPrompt) return false;

    try {
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
      }
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => null);
    } finally {
      deferredInstallPrompt = null;
      updateInstallButtons();
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    }
    return true;
  }

  window.registerPMServiceWorker = registerPMServiceWorker;
  window.installAppPrompt = installAppPrompt;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButtons();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButtons();
  });

  window.addEventListener('load', () => {
    registerPMServiceWorker();
    updateInstallButtons();
  }, { once: true });
})();

// ===== Step 5.1: ï؟½ï؟½دکï؟½ï؟½ï؟½?ï؟½?ï؟½ ï؟½ï؟½ï؟½?ï؟½ï؟½ ï؟½ 2 ï؟½ï؟½ï؟½?ï؟½ ï؟½?ï؟½?ï؟½ï؟½ =====
function roundMoney(v) {
  return Math.round((parseFloat(v) || 0) * 100) / 100;
}

// ===== ï؟½?ï؟½ï؟½ï؟½ï؟½ =====
function today() {
  return new Date().toISOString().split('T')[0];
}

// ===== ï؟½?ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ ï؟½ ï؟½ï؟½ï؟½?ï؟½ ï؟½اگï؟½ 31 =====
function endOfMonth(year, month1indexed) {
  return new Date(year, month1indexed, 0).toISOString().split('T')[0];
}

// ===== ï؟½?ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½? =====
function fmtN(n, decimals) {
  const num = parseFloat(n || 0);
  if (decimals === undefined) decimals = num >= 100 ? 0 : 2;
  return num.toLocaleString('en', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ===== ï؟½ï؟½ï؟½تکï؟½ï؟½ï؟½?ï؟½?ï؟½ ï؟½ï؟½ï؟½ï؟½?ï؟½ ï؟½?ï؟½ï؟½? =====
function fmtShort(n) {
  const v = Math.abs(n);
  if (v >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}

// ===== ï؟½??ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ ï؟½? USD =====
function toUSD(amount, fromCode) {
  if (!amount) return 0;
  const list = getCurrencies();
  const from = list.find(c => c.code === fromCode);
  if (!from) return parseFloat(amount) || 0;
  return (parseFloat(amount) || 0) / (from.rateToUSD || 1);
}

// ===== ï؟½??ï؟½ï؟½ï؟½ USD ï؟½? ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ =====
function fromUSD(usdAmount, toCode) {
  const list = getCurrencies();
  const to = list.find(c => c.code === toCode);
  if (!to) return parseFloat(usdAmount) || 0;
  return (parseFloat(usdAmount) || 0) * (to.rateToUSD || 1);
}

// ===== ï؟½?ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ =====
function fmtC(amount, code) {
  const list = getCurrencies();
  const c = list.find(x => x.code === code) || { symbol: code, code };
  const dec = (code === 'IQD' || code === 'IRR') ? 0 : 2;
  return c.symbol + ' ' + fmtN(amount, dec);
}

// ===== Step 6.5: ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ ï؟½ NaN safety =====
function fmtDual(amount, currency, rateSnapshot) {
  if (!amount) return fmtC(0, currency);
  const primary = fmtC(amount, currency);
  if (currency === 'USD') return primary;
  const rate = rateSnapshot || (getCurrencies().find(c => c.code === currency)?.rateToUSD || 1);
  if (!rate || !isFinite(rate)) return primary;
  const inUSD = (parseFloat(amount) || 0) / rate;
  if (!isFinite(inUSD)) return primary;
  return `${primary} <span style="color:var(--muted);font-size:10px;font-weight:400">(${fmtC(inUSD, 'USD')} | ${fmtN(rate, 0)} ${currency}/$)</span>`;
}

// ===== Step 5.1.1: ï؟½?ï؟½ï؟½ï؟½ï؟½ï؟½?ï؟½?ï؟½ ï؟½ï؟½ï؟½ï؟½?ï؟½ ï؟½?ï؟½ï؟½ï؟½ï؟½ =====
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/[\s\-\(\)]/g, '');
}

// ===== ï؟½ï؟½ش‌ï؟½ ï؟½?ï؟½ ï؟½? backward compatibility =====
function legacyHashToken(buyer, phone) {
  const raw = (buyer || '') + '|' + (phone || '');
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
  }
  return Math.abs(hash).toString(36) + (buyer || 'x').slice(0, 3).replace(/\s/g, '');
}

// ===== Step 5.1.4: Token validation =====
function validateToken(token) {
  if (!token || typeof token !== 'string') return false;
  if (token.length < 6) return false;
  if (!/^[a-zA-Z0-9\-_]+$/.test(token)) return false;
  return true;
}

function getCustomerTokenEntry(token) {
  if (!validateToken(token)) return null;
  try {
    const registry = PMStorage.getSync('customerTokens') || {};
    const entry = Object.values(registry).find(r => r && r.token === token);
    if (!entry) return null;
    return {
      ...entry,
      name: entry.name || '',
      phone: normalizePhone(entry.phone || ''),
      token: entry.token || token,
    };
  } catch (e) {
    console.warn('[getCustomerTokenEntry] هەڵە:', e.message);
    return null;
  }
}

function isCustomerTokenEntryActive(entry, nowMs = Date.now()) {
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
  const entry = getCustomerTokenEntry(token);
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

// ===== Step 5.1.5: ï؟½??ï؟½ï؟½?ï؟½?ï؟½ ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½?ï؟½ï؟½ï؟½ ï؟½? token ï؟½ hardened =====
function lookupCustomerByToken(token) {
  if (!token) return null;
  try {
    const access = getCustomerTokenAccessState(token);
    if (!access.ok) return null;
    const entry = access.entry;
    return {
      name:  entry.name  || '',
      phone: normalizePhone(entry.phone || ''),
      token: entry.token || token,
    };
  } catch (e) {
    console.warn('[lookupCustomerByToken] ï؟½???:', e.message);
    return null;
  }
}

// ===== Step 5.1.3: ï؟½اکï؟½ï؟½ï؟½ï؟½ï؟½ registry =====
function repairCustomerRegistry() {
  try {
    const existing = PMStorage.getSync('customerTokens');
    if (!existing) return;
    let registry;
    try { registry = cloneRegistry(existing); } catch {
      console.warn('[repairRegistry] JSON ï؟½ï؟½اپ ï؟½ ?ï؟½ï؟½?ï؟½ ï؟½?ï؟½ï؟½?ï؟½');
      PMStorage.setSync('customerTokens', {});
      return;
    }
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
      console.warn('[repairRegistry] ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ ?ï؟½ï؟½?ï؟½ ï؟½?ï؟½ï؟½?ï؟½');
      PMStorage.setSync('customerTokens', {});
      return;
    }

    let changed = false;
    const seenTokens = new Set();
    const keys = Object.keys(registry);

    for (const key of keys) {
      const entry = registry[key];
      if (!entry || typeof entry !== 'object' || !entry.token) {
        console.warn('[repairRegistry] ï؟½?ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½اپ ï؟½ï؟½ï؟½ï؟½ï؟½:', key);
        delete registry[key];
        changed = true;
        continue;
      }
      if (seenTokens.has(entry.token)) {
        console.warn('[repairRegistry] ï؟½?ï؟½ï؟½ï؟½ ï؟½?ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ï؟½:', key);
        delete registry[key];
        changed = true;
        continue;
      }
      seenTokens.add(entry.token);

      // phone normalize
      const normPhone = normalizePhone(entry.phone || '');
      if (normPhone !== (entry.phone || '')) {
        entry.phone = normPhone;
        changed = true;
      }
      if (entry.expiresAt == null) {
        entry.expiresAt = '';
        changed = true;
      }
      if (entry.revokedAt == null) {
        entry.revokedAt = '';
        changed = true;
      }
      if (entry.updatedAt == null) {
        entry.updatedAt = entry.createdAt || new Date().toISOString();
        changed = true;
      }
      // ï؟½ï؟½ï؟½ï؟½ normalize بک?
      if (normPhone && key !== normPhone && !registry[normPhone]) {
        registry[normPhone] = entry;
        delete registry[key];
        changed = true;
      }
    }

    if (changed) {
      PMStorage.setSync('customerTokens', registry);
      console.debug('[repairRegistry] ï؟½اکï؟½ï؟½ï؟½ ?');
    }
  } catch (e) {
    console.warn('[repairRegistry] ï؟½???:', e.message);
  }
}

function cloneRegistry(value) {
  if (!value || typeof value !== 'object') return {};
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch (_) {}
  return JSON.parse(JSON.stringify(value));
}
