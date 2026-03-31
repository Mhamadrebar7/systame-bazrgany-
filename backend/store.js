const fs = require('fs');
const path = require('path');

function nowIso() {
  return new Date().toISOString();
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  ensureDirSync(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

class AppStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.backupsDir = path.join(rootDir, 'backups');
    this.logsDir = path.join(rootDir, 'logs');
    this.usersPath = path.join(rootDir, 'users.json');
    this.sessionsPath = path.join(rootDir, 'sessions.json');
    this.statePath = path.join(rootDir, 'state.json');

    ensureDirSync(this.rootDir);
    ensureDirSync(this.backupsDir);
    ensureDirSync(this.logsDir);
  }

  readUsers() {
    return readJson(this.usersPath, []);
  }

  writeUsers(users) {
    writeJsonAtomic(this.usersPath, Array.isArray(users) ? users : []);
  }

  readSessions() {
    return readJson(this.sessionsPath, {});
  }

  writeSessions(sessions) {
    writeJsonAtomic(this.sessionsPath, sessions && typeof sessions === 'object' ? sessions : {});
  }

  readState() {
    return readJson(this.statePath, {
      revision: 0,
      updatedAt: '',
      updatedBy: '',
      snapshot: null,
    });
  }

  writeState(state) {
    writeJsonAtomic(this.statePath, state && typeof state === 'object' ? state : this.readState());
  }

  createBackup(snapshot, meta = {}) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      id,
      createdAt: nowIso(),
      meta,
      snapshot,
    };
    const filePath = path.join(this.backupsDir, `${id}.json`);
    writeJsonAtomic(filePath, payload);
    this._pruneOldBackups(20);
    return payload;
  }

  _pruneOldBackups(maxKeep = 20) {
    try {
      ensureDirSync(this.backupsDir);
      const files = fs.readdirSync(this.backupsDir)
        .filter(name => name.endsWith('.json'))
        .map(name => ({
          name,
          mtime: fs.statSync(path.join(this.backupsDir, name)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);
      files.slice(maxKeep).forEach(file => {
        try { fs.unlinkSync(path.join(this.backupsDir, file.name)); } catch (_) {}
      });
    } catch (_) {}
  }

  listBackups() {
    ensureDirSync(this.backupsDir);
    return fs.readdirSync(this.backupsDir)
      .filter(name => name.endsWith('.json'))
      .map(name => readJson(path.join(this.backupsDir, name), null))
      .filter(Boolean)
      .map(entry => ({
        id: entry.id,
        createdAt: entry.createdAt,
        meta: entry.meta || {},
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  readBackup(id) {
    if (!id || /[\\/]/.test(id)) return null;
    const filePath = path.join(this.backupsDir, `${id}.json`);
    return readJson(filePath, null);
  }

  appendLog(fileName, entry) {
    ensureDirSync(this.logsDir);
    const filePath = path.join(this.logsDir, fileName);
    this._rotateLogIfNeeded(filePath);
    const line = JSON.stringify({ at: nowIso(), ...entry });
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
  }

  _rotateLogIfNeeded(filePath, maxBytes = 5 * 1024 * 1024) {
    try {
      if (!fs.existsSync(filePath)) return;
      const { size } = fs.statSync(filePath);
      if (size < maxBytes) return;
      const rotated = `${filePath}.${Date.now()}.bak`;
      fs.renameSync(filePath, rotated);
      // تەنها ٣ بەکاپی لۆگ دەهێڵرێت
      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      const baks = fs.readdirSync(dir)
        .filter(n => n.startsWith(base + '.') && n.endsWith('.bak'))
        .map(n => ({ n, mtime: fs.statSync(path.join(dir, n)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      baks.slice(3).forEach(({ n }) => {
        try { fs.unlinkSync(path.join(dir, n)); } catch (_) {}
      });
    } catch (_) {}
  }
}

module.exports = {
  AppStore,
  ensureDirSync,
  nowIso,
  readJson,
  writeJsonAtomic,
};
