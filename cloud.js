(function initAuthCloud() {
  const SESSION_KEY = 'cloud_session_token';
  const DEFAULT_SERVER_PORT = '8787';

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  const state = {
    available: false,
    apiBase: '',
    bootPromise: null,
    needsSetup: false,
    revision: 0,
    token: '',
    user: null,
    suppressMutations: false,
    syncTimer: null,
    syncInFlight: null,
    usersCache: [],
    monitoringBound: false,
  };

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function canUseBackend() {
    return typeof window !== 'undefined' && /^(https?:|file:)$/.test(window.location.protocol);
  }

  function candidateApiBases() {
    if (typeof window === 'undefined') return [];

    const proto = window.location.protocol === 'file:' ? 'http:' : window.location.protocol;
    const host = window.location.hostname || '127.0.0.1';
    const port = window.location.port || '';
    const currentOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '';
    const loopbackAlt = host === '127.0.0.1' ? 'localhost' : (host === 'localhost' ? '127.0.0.1' : '');
    const preferredServerOrigin = `${proto}//${host}:${DEFAULT_SERVER_PORT}`;
    const fallbackServerOrigin = loopbackAlt ? `${proto}//${loopbackAlt}:${DEFAULT_SERVER_PORT}` : '';

    return unique([
      currentOrigin,
      port !== DEFAULT_SERVER_PORT ? preferredServerOrigin : '',
      port !== DEFAULT_SERVER_PORT ? fallbackServerOrigin : '',
      `${proto}//127.0.0.1:${DEFAULT_SERVER_PORT}`,
      `${proto}//localhost:${DEFAULT_SERVER_PORT}`,
    ]);
  }

  function withApiBase(path) {
    if (!state.apiBase) return path;
    if (/^https?:\/\//i.test(path)) return path;
    return `${state.apiBase}${path}`;
  }

  function getStoredSessionToken() {
    try {
      if (window.PMStorage && typeof window.PMStorage.getLocalMeta === 'function') {
        return window.PMStorage.getLocalMeta(SESSION_KEY) || '';
      }
      return localStorage.getItem(`pm_${SESSION_KEY}`) || '';
    } catch (_) {
      return '';
    }
  }

  function storeSessionToken(token) {
    state.token = token || '';
    try {
      if (window.PMStorage && typeof window.PMStorage.setLocalMeta === 'function') {
        window.PMStorage.setLocalMeta(SESSION_KEY, state.token);
      } else {
        localStorage.setItem(`pm_${SESSION_KEY}`, state.token);
      }
    } catch (_) {}
  }

  function clearSessionToken() {
    state.token = '';
    try {
      if (window.PMStorage && typeof window.PMStorage.removeLocalMeta === 'function') {
        window.PMStorage.removeLocalMeta(SESSION_KEY);
      } else {
        localStorage.removeItem(`pm_${SESSION_KEY}`);
      }
    } catch (_) {}
  }

  async function api(path, options = {}) {
    const method = options.method || 'GET';
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };
    if (options.body != null) headers['Content-Type'] = 'application/json';
    if (options.auth !== false && state.token) headers.Authorization = `Bearer ${state.token}`;

    const response = await fetch(withApiBase(path), {
      method,
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (_) {}

    if (!response.ok) {
      const error = new Error(payload.message || payload.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.code = payload.error || 'REQUEST_FAILED';
      throw error;
    }

    return payload;
  }

  function showMessage(message, type = 'ok') {
    if (typeof window.showA === 'function') {
      const settingsAlert = document.getElementById('settingsAlert');
      if (settingsAlert) {
        window.showA('settingsAlert', type === 'bad' ? 'bad' : 'ok', message);
        return;
      }
    }
    if (type === 'bad') {
      alert(message);
    }
  }

  function canWrite() {
    return !!state.user && ['admin', 'staff'].includes(state.user.role);
  }

  function isAdmin() {
    return !!state.user && state.user.role === 'admin';
  }

  function ensureCanWrite(label = 'ئەم کارە') {
    if (state.suppressMutations) return true;
    if (!state.available) return true;
    if (canWrite()) return true;
    showMessage(`🚫 تۆ مافی ${label} نیت.`, 'bad');
    return false;
  }

  function ensureCanAdmin(label = 'ئەم کارە') {
    if (state.suppressMutations) return true;
    if (!state.available) return true;
    if (isAdmin()) return true;
    showMessage(`🚫 تەنها admin دەتوانێت ${label} بکات.`, 'bad');
    return false;
  }

  function ensureCloudStyles() {
    if (document.getElementById('cloudStyles')) return;
    const style = document.createElement('style');
    style.id = 'cloudStyles';
    style.textContent = `
      .cloud-overlay{position:fixed;inset:0;background:rgba(5,10,18,.78);backdrop-filter:blur(10px);z-index:1200;display:flex;align-items:center;justify-content:center;padding:20px}
      .cloud-card{width:min(460px,100%);background:var(--bg2,#161b27);border:1px solid var(--border,#2a3347);border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
      .cloud-card h3{font-size:18px;font-weight:800;margin-bottom:8px}
      .cloud-card p{color:var(--muted,#8896b3);font-size:13px;line-height:1.8;margin-bottom:14px}
      .cloud-auth-form{display:grid;gap:10px}
      .cloud-auth-form input,.cloud-auth-form select{width:100%;padding:10px 12px;background:var(--bg3,#1e2535);border:1.5px solid var(--border,#2a3347);border-radius:10px;color:var(--text,#e2e8f0);font:inherit}
      .cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .cloud-inline{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .cloud-muted{color:var(--muted,#8896b3);font-size:12px}
      .cloud-section{display:grid;gap:12px}
      .cloud-user-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--border,#2a3347);border-radius:12px;background:var(--bg3,#1e2535)}
      .cloud-user-meta{min-width:0}
      .cloud-user-name{font-weight:700}
      .cloud-user-sub{font-size:11px;color:var(--muted,#8896b3);margin-top:2px}
      .cloud-empty{padding:14px;border:1px dashed var(--border2,#374160);border-radius:12px;text-align:center;color:var(--muted,#8896b3);font-size:12px;line-height:1.9}
    `;
    document.head.appendChild(style);
  }

  function updateAuthButtonsLegacy() {
    document.querySelectorAll('[data-auth-toggle]').forEach(btn => {
      btn.hidden = false;
      btn.setAttribute('aria-hidden', 'false');
      if (!state.available) {
        btn.textContent = '☁️ Cloud';
        return;
      }
      if (state.user) {
        btn.textContent = `🚪 ${state.user.displayName || state.user.username || ''}`;
      } else {
        btn.textContent = '🔐 Login';
      }
    });
  }

  function updateAuthButtons() {
    document.querySelectorAll('[data-auth-toggle]').forEach(btn => {
      btn.hidden = false;
      btn.setAttribute('aria-hidden', 'false');
      if (!state.available) {
        btn.textContent = 'Cloud';
        btn.title = 'backend not connected';
        return;
      }
      if (state.user) {
        const label = state.user.displayName || state.user.username || '';
        btn.textContent = `Logout: ${label}`;
        btn.title = `${label} - logout`;
      } else {
        btn.textContent = 'Login';
        btn.title = 'login';
      }
    });
  }

  function ensureAuthOverlay() {
    ensureCloudStyles();
    let overlay = document.getElementById('cloudAuthOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'cloudAuthOverlay';
      overlay.className = 'cloud-overlay';
      overlay.hidden = true;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function hideAuthOverlay() {
    const overlay = document.getElementById('cloudAuthOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.innerHTML = '';
    }
  }

  function renderAuthOverlay(mode, resolve) {
    const overlay = ensureAuthOverlay();
    const isSetup = mode === 'setup';
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="cloud-card">
        <h3>${isSetup ? 'دامەزراندنی یەکەم ئەدمین' : 'چوونە ژوورەوە'}</h3>
        <p>${isSetup
          ? 'بۆ دەستپێکردنی cloud sync، یەک هەژماری admin دروست بکە.'
          : 'بە هەژمارەکەت بچۆ ژوورەوە بۆ login و sync.'}</p>
        <form class="cloud-auth-form" id="cloudAuthForm">
          ${isSetup ? '<input name="displayName" placeholder="ناوی پیشاندان" autocomplete="name">' : ''}
          <input name="username" placeholder="Username" autocomplete="username" required>
          <input name="password" type="password" placeholder="Password" autocomplete="${isSetup ? 'new-password' : 'current-password'}" required>
          <div class="cloud-actions">
            <button class="btn btn-p" type="submit">${isSetup ? 'دامەزراندن' : 'Login'}</button>
            <button class="btn btn-g" type="button" id="cloudCancelBtn">داخستن</button>
          </div>
        </form>
        <div class="cloud-muted" id="cloudAuthMsg"></div>
      </div>`;

    overlay.querySelector('#cloudCancelBtn')?.addEventListener('click', () => {
      hideAuthOverlay();
      resolve(null);
    });

    const form = overlay.querySelector('#cloudAuthForm');
    const msg = overlay.querySelector('#cloudAuthMsg');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        username: String(formData.get('username') || '').trim(),
        password: String(formData.get('password') || ''),
        displayName: String(formData.get('displayName') || '').trim(),
      };
      msg.textContent = 'چاوەڕێبە...';
      try {
        const result = await api(isSetup ? '/api/auth/setup' : '/api/auth/login', {
          method: 'POST',
          body: payload,
          auth: false,
        });
        storeSessionToken(result.token);
        state.user = result.user;
        state.needsSetup = false;
        hideAuthOverlay();
        updateAuthButtons();
        renderSettingsPanel();
        resolve(result.user);
      } catch (error) {
        msg.textContent = error.message;
      }
    });
  }

  function promptForAuth(mode) {
    return new Promise(resolve => renderAuthOverlay(mode, resolve));
  }

  async function probeHealth(base) {
    try {
      const response = await fetch(`${base}/api/health`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const payload = await response.json();
      return { base, payload };
    } catch (_) {
      return null;
    }
  }

  async function checkBackendHealth() {
    if (!canUseBackend()) return { ok: false };
    const candidates = candidateApiBases();
    for (const base of candidates) {
      const result = await probeHealth(base);
      if (result && result.payload?.ok) {
        state.apiBase = base;
        return { ok: true, ...result.payload };
      }
    }
    state.apiBase = '';
    return { ok: false };
  }

  async function restoreSessionIfPossible() {
    const token = getStoredSessionToken();
    if (!token) return false;
    storeSessionToken(token);
    try {
      const result = await api('/api/auth/me');
      state.user = result.user;
      return true;
    } catch (_) {
      clearSessionToken();
      state.user = null;
      return false;
    }
  }

  function snapshotHasContent(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    return (snapshot.products?.length || 0) + (snapshot.events?.length || 0) + (snapshot.suppliers?.length || 0) > 0;
  }

  async function applyRemoteSnapshot(snapshot) {
    if (!snapshot || typeof window.applyBackupPayload !== 'function') return;
    state.suppressMutations = true;
    try {
      window.applyBackupPayload(snapshot, { requireConfirm: false });
    } finally {
      state.suppressMutations = false;
    }
  }

  async function syncNow(options = {}) {
    if (!state.available || !state.user || !canWrite()) return null;
    if (state.syncInFlight) return state.syncInFlight;
    if (typeof window.createBackupSnapshot !== 'function') return null;

    const snapshot = window.createBackupSnapshot();
    state.syncInFlight = (async () => {
      try {
        const result = await api('/api/sync', {
          method: 'PUT',
          body: {
            snapshot,
            baseRevision: state.revision || 0,
          },
        });
        state.revision = result.revision || state.revision;
        if (result.snapshot) await applyRemoteSnapshot(result.snapshot);
        if (!options.silent) {
          showMessage(result.conflict ? '⚠️ sync بە conflict هاتە تەواوکردن.' : '✅ sync تەواو بوو.');
        }
        renderSettingsPanel();
        updateAuthButtons();
        return result;
      } catch (error) {
        if (!options.silent) showMessage(`❌ sync شکستی هێنا: ${error.message}`, 'bad');
        throw error;
      } finally {
        state.syncInFlight = null;
      }
    })();
    return state.syncInFlight;
  }

  function scheduleSync() {
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(() => {
      syncNow({ silent: true }).catch(() => {});
    }, 900);
  }

  function noteLocalMutation() {
    if (state.suppressMutations) return;
    renderSettingsPanel();
    if (state.available && state.user && canWrite()) scheduleSync();
  }

  async function runInitialSync() {
    if (!state.available || !state.user) return;
    const remote = await api('/api/sync');
    state.revision = remote.revision || 0;
    if (remote.snapshot) {
      await applyRemoteSnapshot(remote.snapshot);
      return;
    }
    if (typeof window.createBackupSnapshot === 'function') {
      const localSnapshot = window.createBackupSnapshot();
      if (snapshotHasContent(localSnapshot)) {
        await syncNow({ silent: true });
      }
    }
  }

  async function logout() {
    try {
      if (state.available && state.token) {
        await api('/api/auth/logout', { method: 'POST' });
      }
    } catch (_) {}
    clearSessionToken();
    state.user = null;
    state.revision = 0;
    state.usersCache = [];
    updateAuthButtons();
    renderSettingsPanel();
  }

  async function openLogin() {
    if (!state.available) {
      showMessage('backend نەدۆزرایەوە. `npm start` بکە یان پەڕەکە لە `http://127.0.0.1:8787` بکەرەوە.', 'bad');
      return null;
    }
    const user = await promptForAuth('login');
    if (user) {
      if (isAdmin()) await fetchUsers().catch(() => {});
      await runInitialSync().catch(error => showMessage(`❌ syncی سەرەتایی شکستی هێنا: ${error.message}`, 'bad'));
      updateAuthButtons();
      renderSettingsPanel();
    }
    return user;
  }

  async function handleAuthToggle() {
    if (state.user) return logout();
    return openLogin();
  }

  async function fetchUsers() {
    if (!isAdmin()) {
      state.usersCache = [];
      return [];
    }
    const result = await api('/api/users');
    state.usersCache = result.users || [];
    return state.usersCache;
  }

  async function createServerBackup() {
    if (!ensureCanAdmin('دروستکردنی backup لە server')) return false;
    const result = await api('/api/backups', { method: 'POST' });
    showMessage(`✅ backup نوێ دروست کرا: ${result.backup.id}`);
    renderSettingsPanel();
    return true;
  }

  async function submitAddUser(event) {
    event.preventDefault();
    if (!ensureCanAdmin('زیادکردنی بەکارهێنەر')) return false;
    const form = event.target;
    const formData = new FormData(form);
    try {
      await api('/api/users', {
        method: 'POST',
        body: {
          username: String(formData.get('username') || '').trim(),
          displayName: String(formData.get('displayName') || '').trim(),
          password: String(formData.get('password') || ''),
          role: String(formData.get('role') || 'staff'),
        },
      });
      form.reset();
      await fetchUsers();
      renderSettingsPanel();
      showMessage('✅ بەکارهێنەر زیادکرا.');
    } catch (error) {
      showMessage(`❌ ${error.message}`, 'bad');
    }
    return false;
  }

  async function updateUserRole(userId, role) {
    if (!ensureCanAdmin('گۆڕینی ڕۆڵی بەکارهێنەر')) return;
    try {
      await api(`/api/users/${userId}`, {
        method: 'PATCH',
        body: { role },
      });
      await fetchUsers();
      renderSettingsPanel();
      showMessage('✅ ڕۆڵ نوێکرایەوە.');
    } catch (error) {
      showMessage(`❌ ${error.message}`, 'bad');
    }
  }

  async function toggleUserDisabled(userId, disabled) {
    if (!ensureCanAdmin(disabled ? 'ناچالاککردنی بەکارهێنەر' : 'چالاککردنی بەکارهێنەر')) return;
    try {
      await api(`/api/users/${userId}`, {
        method: 'PATCH',
        body: { disabled },
      });
      await fetchUsers();
      renderSettingsPanel();
      showMessage(disabled ? '✅ بەکارهێنەر ناچالاک کرا.' : '✅ بەکارهێنەر چالاک کرا.');
    } catch (error) {
      showMessage(`❌ ${error.message}`, 'bad');
    }
  }

  async function resetUserPassword(userId) {
    if (!ensureCanAdmin('گۆڕینی وشەی نهێنی')) return;
    const password = prompt('وشەی نهێنیی نوێ بنووسە:');
    if (!password) return;
    try {
      await api(`/api/users/${userId}`, {
        method: 'PATCH',
        body: { password },
      });
      showMessage('✅ وشەی نهێنی نوێکرایەوە.');
    } catch (error) {
      showMessage(`❌ ${error.message}`, 'bad');
    }
  }

  function renderSettingsPanel() {
    const host = document.getElementById('cloudStatusPanel');
    if (!host) return;

    if (!state.available) {
      host.innerHTML = `
        <div class="cloud-empty">
          backend نەدۆزرایەوە.<br>
          بۆ login و cloud sync: <code>npm start</code> بکە یان وێبەکە لە <code>http://127.0.0.1:${DEFAULT_SERVER_PORT}</code> بکەرەوە.
        </div>`;
      updateAuthButtons();
      return;
    }

    const userLabel = state.user
      ? `${esc(state.user.displayName)} · ${esc(state.user.role)}`
      : 'هێشتا login نەکراوە';

    const usersMarkup = isAdmin()
      ? (state.usersCache.length
        ? state.usersCache.map(user => `
            <div class="cloud-user-row">
              <div class="cloud-user-meta">
                <div class="cloud-user-name">${esc(user.displayName)}</div>
                <div class="cloud-user-sub">@${esc(user.username)} · ${user.disabled ? 'ناچالاک' : 'چالاک'}</div>
              </div>
              <select onchange="AuthCloud.updateUserRole('${esc(user.id)}', this.value)">
                <option value="admin"${user.role === 'admin' ? ' selected' : ''}>admin</option>
                <option value="staff"${user.role === 'staff' ? ' selected' : ''}>staff</option>
                <option value="viewer"${user.role === 'viewer' ? ' selected' : ''}>viewer</option>
              </select>
              <button class="btn btn-g btn-sm" type="button" onclick="AuthCloud.toggleUserDisabled('${esc(user.id)}', ${!user.disabled})">${user.disabled ? 'چالاککردنەوە' : 'ناچالاککردن'}</button>
              <button class="btn btn-ol btn-sm" type="button" onclick="AuthCloud.resetUserPassword('${esc(user.id)}')">Password</button>
            </div>`).join('')
        : '<div class="cloud-empty">هیچ بەکارهێنەرێکی تر نییە.</div>')
      : '';

    host.innerHTML = `
      <div class="cloud-section">
        <div class="cloud-inline">
          <span class="tag">Cloud</span>
          <strong>${userLabel}</strong>
          <span class="cloud-muted">Revision: ${state.revision || 0}</span>
          <span class="cloud-muted">${esc(state.apiBase)}</span>
        </div>
        <div class="cloud-actions">
          ${state.user ? `<button class="btn btn-p btn-sm" type="button" onclick="AuthCloud.syncNow()">☁️ Sync ئێستا</button>` : `<button class="btn btn-p btn-sm" type="button" onclick="AuthCloud.openLogin()">🔐 Login</button>`}
          ${isAdmin() ? '<button class="btn btn-ok btn-sm" type="button" onclick="AuthCloud.createServerBackup()">💾 Backup لە server</button>' : ''}
          ${state.user ? '<button class="btn btn-g btn-sm" type="button" onclick="AuthCloud.logout()">🚪 Logout</button>' : ''}
        </div>
        ${!canWrite() && state.user ? '<div class="alert al-info">ئەم هەژمارەیە read-only ـە. تۆ دەتوانیت تەنها ببینی.</div>' : ''}
        ${isAdmin() ? `
          <div class="divider"></div>
          <div>
            <div class="ctitle" style="margin-bottom:10px">👤 بەکارهێنەران</div>
            <form onsubmit="return AuthCloud.submitAddUser(event)" class="cloud-auth-form" style="margin-bottom:12px">
              <input name="displayName" placeholder="ناوی پیشاندان">
              <input name="username" placeholder="Username" required>
              <input name="password" type="password" placeholder="Password" required>
              <select name="role">
                <option value="staff">staff</option>
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
              </select>
              <button class="btn btn-p btn-sm" type="submit">➕ زیادکردنی بەکارهێنەر</button>
            </form>
            ${usersMarkup}
          </div>` : ''}
      </div>`;
    updateAuthButtons();
  }

  async function boot() {
    if (state.bootPromise) return state.bootPromise;

    state.bootPromise = (async () => {
      ensureCloudStyles();
      updateAuthButtons();
      renderSettingsPanel();

      const health = await checkBackendHealth();
      if (!health.ok) {
        renderSettingsPanel();
        return state;
      }

      state.available = true;
      state.needsSetup = !!health.needsSetup;
      updateAuthButtons();

      if (state.needsSetup) {
        await promptForAuth('setup');
      }

      if (!state.user) {
        await restoreSessionIfPossible();
      }

      if (!state.user && !state.needsSetup) {
        await promptForAuth('login');
      }

      if (state.user) {
        if (isAdmin()) {
          await fetchUsers().catch(() => {});
        }
        await runInitialSync().catch(error => {
          showMessage(`❌ syncی سەرەتایی شکستی هێنا: ${error.message}`, 'bad');
        });
      }

      renderSettingsPanel();
      updateAuthButtons();
      bindMonitoring();
      return state;
    })();

    return state.bootPromise;
  }

  function bindMonitoring() {
    if (!state.available || state.monitoringBound) return;
    state.monitoringBound = true;

    const postError = payload => {
      fetch(withApiBase('/api/monitoring/client-error'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener('error', event => {
      postError({
        type: 'window-error',
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', event => {
      postError({
        type: 'unhandledrejection',
        message: event.reason?.message || String(event.reason || ''),
      });
    });
  }

  async function fetchCustomerPortalData(token) {
    const health = await checkBackendHealth();
    if (!health.ok) return null;
    const response = await fetch(withApiBase(`/api/customer/${encodeURIComponent(token)}`), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch (_) {}
    if (!response.ok) {
      const error = new Error(payload.error || 'CUSTOMER_FETCH_FAILED');
      error.code = payload.error || 'CUSTOMER_FETCH_FAILED';
      throw error;
    }
    return payload.customer || null;
  }

  window.fetchCustomerPortalData = fetchCustomerPortalData;
  window.AuthCloud = {
    boot,
    canWrite,
    createServerBackup,
    ensureCanAdmin,
    ensureCanWrite,
    fetchUsers,
    handleAuthToggle,
    isAdmin,
    logout,
    noteLocalMutation,
    openLogin,
    renderSettingsPanel,
    resetUserPassword,
    submitAddUser,
    syncNow,
    toggleUserDisabled,
    updateUserRole,
  };
})();
