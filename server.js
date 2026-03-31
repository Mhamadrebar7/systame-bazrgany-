const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const { AppStore, nowIso } = require('./backend/store');
const { createSessionToken, hashPassword, verifyPassword, SESSION_TTL_MS, randomHex } = require('./backend/security');
const { getCustomerPortalData, getCustomerTokenAccessState, sanitizeSnapshot } = require('./backend/snapshot');

const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'server-data');
const store = new AppStore(DATA_DIR);

// ---- Rate limiter ساده بۆ login و setup ----
const rateLimitMap = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT_MAX = 10;       // زیاتر لە ١٠ هەوڵ
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // لە ماوەی ١ خولەک

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

// پاککردنەوەی خۆکاری داتای kevin بەرپرسانە هەر ٥ خولەک
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const WRITE_ROLES = new Set(['admin', 'staff']);

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(message);
}

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || `http://localhost:${PORT},http://127.0.0.1:${PORT}`)
    .split(',').map(o => o.trim()).filter(Boolean)
);

function setApiCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    disabled: !!user.disabled,
    createdAt: user.createdAt,
  };
}

function pruneExpiredSessions() {
  const sessions = store.readSessions();
  const now = Date.now();
  let changed = false;

  Object.entries(sessions).forEach(([token, session]) => {
    const expiresAtMs = Date.parse(session?.expiresAt || '');
    if (!session || !session.userId || (expiresAtMs && !Number.isNaN(expiresAtMs) && expiresAtMs < now)) {
      delete sessions[token];
      changed = true;
    }
  });

  if (changed) store.writeSessions(sessions);
  return sessions;
}

function getAuthContext(req) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;

  const sessions = pruneExpiredSessions();
  const session = sessions[token];
  if (!session) return null;

  const users = store.readUsers();
  const user = users.find(candidate => candidate.id === session.userId && !candidate.disabled);
  if (!user) return null;

  return {
    token,
    session,
    user,
  };
}

function requireAuth(req, res) {
  const auth = getAuthContext(req);
  if (!auth) {
    sendJson(res, 401, { ok: false, error: 'AUTH_REQUIRED' });
    return null;
  }
  return auth;
}

function requireAdmin(req, res) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (auth.user.role !== 'admin') {
    sendJson(res, 403, { ok: false, error: 'ADMIN_REQUIRED' });
    return null;
  }
  return auth;
}

function requireWrite(req, res) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (!WRITE_ROLES.has(auth.user.role)) {
    sendJson(res, 403, { ok: false, error: 'WRITE_REQUIRED' });
    return null;
  }
  return auth;
}

function buildSession(userId) {
  return {
    userId,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
}

function validateRole(role) {
  return ['admin', 'staff', 'viewer'].includes(role);
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health' && req.method === 'GET') {
    const state = store.readState();
    sendJson(res, 200, {
      ok: true,
      needsSetup: store.readUsers().length === 0,
      revision: state.revision || 0,
      updatedAt: state.updatedAt || '',
    });
    return true;
  }

  if (pathname === '/api/auth/setup-status' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, needsSetup: store.readUsers().length === 0 });
    return true;
  }

  if (pathname === '/api/auth/setup' && req.method === 'POST') {
    const clientIp = req.socket.remoteAddress || '';
    if (!checkRateLimit(`setup:${clientIp}`)) {
      sendJson(res, 429, { ok: false, error: 'TOO_MANY_REQUESTS' });
      return true;
    }
    if (store.readUsers().length > 0) {
      sendJson(res, 409, { ok: false, error: 'SETUP_ALREADY_COMPLETED' });
      return true;
    }
    const body = await parseBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.displayName || username || 'Admin').trim();
    if (username.length < 3 || password.length < 6) {
      sendJson(res, 400, { ok: false, error: 'INVALID_SETUP_INPUT' });
      return true;
    }
    const passwordState = hashPassword(password);
    const user = {
      id: randomHex(12),
      username,
      displayName,
      role: 'admin',
      disabled: false,
      createdAt: nowIso(),
      passwordSalt: passwordState.salt,
      passwordHash: passwordState.hash,
    };
    store.writeUsers([user]);
    const token = createSessionToken();
    const sessions = store.readSessions();
    sessions[token] = buildSession(user.id);
    store.writeSessions(sessions);
    sendJson(res, 201, { ok: true, token, user: serializeUser(user) });
    return true;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const clientIp = req.socket.remoteAddress || '';
    if (!checkRateLimit(`login:${clientIp}`)) {
      sendJson(res, 429, { ok: false, error: 'TOO_MANY_REQUESTS' });
      return true;
    }
    const body = await parseBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = store.readUsers().find(candidate => candidate.username === username && !candidate.disabled);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      sendJson(res, 401, { ok: false, error: 'INVALID_CREDENTIALS' });
      return true;
    }
    const token = createSessionToken();
    const sessions = store.readSessions();
    sessions[token] = buildSession(user.id);
    store.writeSessions(sessions);
    sendJson(res, 200, { ok: true, token, user: serializeUser(user) });
    return true;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    const sessions = store.readSessions();
    delete sessions[auth.token];
    store.writeSessions(sessions);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    sendJson(res, 200, { ok: true, user: serializeUser(auth.user) });
    return true;
  }

  if (pathname === '/api/users' && req.method === 'GET') {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
    sendJson(res, 200, { ok: true, users: store.readUsers().map(serializeUser) });
    return true;
  }

  if (pathname === '/api/users' && req.method === 'POST') {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
    const body = await parseBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.displayName || username).trim();
    const role = String(body.role || 'staff').trim().toLowerCase();
    if (username.length < 3 || password.length < 6 || !validateRole(role)) {
      sendJson(res, 400, { ok: false, error: 'INVALID_USER_INPUT' });
      return true;
    }
    const users = store.readUsers();
    if (users.some(user => user.username === username)) {
      sendJson(res, 409, { ok: false, error: 'USERNAME_EXISTS' });
      return true;
    }
    const passwordState = hashPassword(password);
    const user = {
      id: randomHex(12),
      username,
      displayName,
      role,
      disabled: false,
      createdAt: nowIso(),
      passwordSalt: passwordState.salt,
      passwordHash: passwordState.hash,
    };
    users.push(user);
    store.writeUsers(users);
    sendJson(res, 201, { ok: true, user: serializeUser(user) });
    return true;
  }

  if (pathname.startsWith('/api/users/') && req.method === 'PATCH') {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
    const userId = pathname.split('/').pop();
    const body = await parseBody(req);
    const users = store.readUsers();
    const user = users.find(candidate => candidate.id === userId);
    if (!user) {
      sendJson(res, 404, { ok: false, error: 'USER_NOT_FOUND' });
      return true;
    }
    if (body.displayName != null) user.displayName = String(body.displayName || '').trim() || user.displayName;
    if (body.role != null) {
      const role = String(body.role || '').trim().toLowerCase();
      if (!validateRole(role)) {
        sendJson(res, 400, { ok: false, error: 'INVALID_ROLE' });
        return true;
      }
      user.role = role;
    }
    if (body.disabled != null) user.disabled = !!body.disabled;
    if (body.password) {
      const passwordState = hashPassword(String(body.password));
      user.passwordSalt = passwordState.salt;
      user.passwordHash = passwordState.hash;
    }

    const activeAdmins = users.filter(candidate => candidate.role === 'admin' && !candidate.disabled && candidate.id !== user.id);
    if ((user.disabled || user.role !== 'admin') && activeAdmins.length === 0) {
      sendJson(res, 400, { ok: false, error: 'LAST_ADMIN_PROTECTED' });
      return true;
    }

    store.writeUsers(users);
    sendJson(res, 200, { ok: true, user: serializeUser(user) });
    return true;
  }

  if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
    const userId = pathname.split('/').pop();
    const users = store.readUsers();
    const target = users.find(user => user.id === userId);
    if (!target) {
      sendJson(res, 404, { ok: false, error: 'USER_NOT_FOUND' });
      return true;
    }
    const remainingAdmins = users.filter(user => user.id !== userId && user.role === 'admin' && !user.disabled);
    if (target.role === 'admin' && remainingAdmins.length === 0) {
      sendJson(res, 400, { ok: false, error: 'LAST_ADMIN_PROTECTED' });
      return true;
    }
    store.writeUsers(users.filter(user => user.id !== userId));
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/api/sync' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    const state = store.readState();
    sendJson(res, 200, {
      ok: true,
      revision: state.revision || 0,
      updatedAt: state.updatedAt || '',
      updatedBy: state.updatedBy || '',
      snapshot: state.snapshot,
    });
    return true;
  }

  if (pathname === '/api/sync' && req.method === 'PUT') {
    const auth = requireWrite(req, res);
    if (!auth) return true;
    const body = await parseBody(req);
    const currentState = store.readState();
    const nextSnapshot = sanitizeSnapshot(body.snapshot || {});
    const conflict = Number.isFinite(Number(body.baseRevision)) && Number(body.baseRevision) !== Number(currentState.revision || 0);
    const nextRevision = Number(currentState.revision || 0) + 1;
    nextSnapshot.metadata = {
      ...(nextSnapshot.metadata || {}),
      lastSyncAt: nowIso(),
      syncedBy: auth.user.username,
      serverRevision: nextRevision,
    };
    const nextState = {
      revision: nextRevision,
      updatedAt: nowIso(),
      updatedBy: auth.user.username,
      snapshot: nextSnapshot,
    };
    store.writeState(nextState);
    if (conflict) {
      store.appendLog('errors.log', {
        type: 'sync-conflict',
        username: auth.user.username,
        expectedRevision: currentState.revision || 0,
        providedRevision: body.baseRevision,
      });
    }
    sendJson(res, 200, {
      ok: true,
      revision: nextState.revision,
      updatedAt: nextState.updatedAt,
      updatedBy: nextState.updatedBy,
      conflict,
      snapshot: nextState.snapshot,
    });
    return true;
  }

  if (pathname === '/api/backups' && req.method === 'GET') {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
    sendJson(res, 200, { ok: true, backups: store.listBackups() });
    return true;
  }

  if (pathname === '/api/backups' && req.method === 'POST') {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
    const state = store.readState();
    if (!state.snapshot) {
      sendJson(res, 400, { ok: false, error: 'NO_SNAPSHOT_AVAILABLE' });
      return true;
    }
    const backup = store.createBackup(state.snapshot, {
      createdBy: auth.user.username,
      revision: state.revision || 0,
      updatedAt: state.updatedAt || '',
    });
    sendJson(res, 201, { ok: true, backup: { id: backup.id, createdAt: backup.createdAt, meta: backup.meta } });
    return true;
  }

  if (pathname.startsWith('/api/backups/') && req.method === 'GET') {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
    const backupId = pathname.split('/').pop();
    const backup = store.readBackup(backupId);
    if (!backup) {
      sendJson(res, 404, { ok: false, error: 'BACKUP_NOT_FOUND' });
      return true;
    }
    sendJson(res, 200, { ok: true, backup });
    return true;
  }

  if (pathname === '/api/monitoring/client-error' && req.method === 'POST') {
    const clientIp = req.socket.remoteAddress || '';
    if (!checkRateLimit(`monitor:${clientIp}`)) {
      sendJson(res, 429, { ok: false, error: 'TOO_MANY_REQUESTS' });
      return true;
    }
    const auth = getAuthContext(req);
    const body = await parseBody(req);
    store.appendLog('errors.log', {
      type: 'client-error',
      username: auth?.user?.username || '',
      role: auth?.user?.role || '',
      payload: body,
    });
    sendJson(res, 202, { ok: true });
    return true;
  }

  if (pathname.startsWith('/api/customer/') && req.method === 'GET') {
    const token = decodeURIComponent(pathname.split('/').pop() || '');
    const state = store.readState();
    if (!state.snapshot) {
      sendJson(res, 404, { ok: false, error: 'CUSTOMER_NOT_FOUND' });
      return true;
    }
    const access = getCustomerTokenAccessState(state.snapshot, token);
    if (!access.ok) {
      const statusCode = access.code === 'revoked' || access.code === 'expired' ? 410 : 404;
      sendJson(res, statusCode, { ok: false, error: access.code.toUpperCase() });
      return true;
    }
    const customer = getCustomerPortalData(state.snapshot, token);
    if (!customer) {
      sendJson(res, 404, { ok: false, error: 'CUSTOMER_NOT_FOUND' });
      return true;
    }
    sendJson(res, 200, { ok: true, customer });
    return true;
  }

  return false;
}

function resolveStaticPath(pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  relativePath = relativePath.replace(/^\/+/, '');
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\\/])+/, '');
  if (safePath.startsWith('server-data') || safePath.startsWith('backend') || safePath.startsWith('tests')) {
    return null;
  }
  const absolutePath = path.join(ROOT_DIR, safePath);
  if (!absolutePath.startsWith(ROOT_DIR)) return null;
  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) return null;
  return absolutePath;
}

function serveStaticFile(res, absolutePath) {
  const ext = path.extname(absolutePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(absolutePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const auth = getAuthContext(req);
  let statusCode = 200;
  const apiRequest = isApiPath(pathname);

  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = (code, ...args) => {
    statusCode = code;
    return originalWriteHead(code, ...args);
  };

  try {
    if (apiRequest) {
      setApiCorsHeaders(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    const handledApi = await handleApi(req, res, pathname);
    if (!handledApi) {
      const staticPath = resolveStaticPath(pathname);
      if (!staticPath) sendText(res, 404, 'Not found');
      else serveStaticFile(res, staticPath);
    }
  } catch (error) {
    statusCode = 500;
    store.appendLog('errors.log', {
      type: 'server-error',
      pathname,
      method: req.method,
      username: auth?.user?.username || '',
      message: error.message,
      stack: error.stack,
    });
    sendJson(res, 500, { ok: false, error: 'SERVER_ERROR', message: error.message });
  } finally {
    store.appendLog('requests.log', {
      type: 'request',
      method: req.method,
      pathname,
      statusCode,
      durationMs: Date.now() - startedAt,
      username: auth?.user?.username || '',
    });
  }
});

server.listen(PORT, () => {
  console.log(`Zakarya server running at http://localhost:${PORT}`);
});
