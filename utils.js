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

// ===== Step 5.1.5: ï؟½??ï؟½ï؟½?ï؟½?ï؟½ ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½?ï؟½ï؟½ï؟½ ï؟½? token ï؟½ hardened =====
function lookupCustomerByToken(token) {
  if (!token) return null;
  try {
    const registry = JSON.parse(localStorage.getItem('pm_customerTokens') || '{}');
    const entry = Object.values(registry).find(r => r && r.token === token);
    if (!entry) return null;
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
    const raw = localStorage.getItem('pm_customerTokens');
    if (!raw) return;
    let registry;
    try { registry = JSON.parse(raw); } catch {
      console.warn('[repairRegistry] JSON ï؟½ï؟½اپ ï؟½ ?ï؟½ï؟½?ï؟½ ï؟½?ï؟½ï؟½?ï؟½');
      localStorage.setItem('pm_customerTokens', '{}');
      return;
    }
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
      console.warn('[repairRegistry] ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ï؟½ ï؟½ ?ï؟½ï؟½?ï؟½ ï؟½?ï؟½ï؟½?ï؟½');
      localStorage.setItem('pm_customerTokens', '{}');
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
      // ï؟½ï؟½ï؟½ï؟½ normalize بک?
      if (normPhone && key !== normPhone && !registry[normPhone]) {
        registry[normPhone] = entry;
        delete registry[key];
        changed = true;
      }
    }

    if (changed) {
      localStorage.setItem('pm_customerTokens', JSON.stringify(registry));
      console.debug('[repairRegistry] ï؟½اکï؟½ï؟½ï؟½ ?');
    }
  } catch (e) {
    console.warn('[repairRegistry] ï؟½???:', e.message);
  }
}
