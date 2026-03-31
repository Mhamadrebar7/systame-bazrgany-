const fs = require('fs');
const path = require('path');

function normalizeForAlign(line) {
  let out = line;
  out = out.replace(/'([^'\\]|\\.)*'/g, "''");
  out = out.replace(/"([^"\\]|\\.)*"/g, '""');
  out = out.replace(/`([^`\\]|\\.)*`/g, '``');
  return out.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
}

function buildLcsMap(currentLines, historyLines) {
  const a = currentLines.map(normalizeForAlign);
  const b = historyLines.map(normalizeForAlign);
  const n = a.length;
  const m = b.length;
  const dp = new Uint16Array((n + 1) * (m + 1));

  for (let i = n - 1; i >= 0; i--) {
    const row = i * (m + 1);
    const next = (i + 1) * (m + 1);
    for (let j = m - 1; j >= 0; j--) {
      dp[row + j] = a[i] && a[i] === b[j]
        ? dp[next + j + 1] + 1
        : Math.max(dp[next + j], dp[row + j + 1]);
    }
  }

  const map = new Map();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) {
      map.set(i, j);
      i++;
      j++;
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return map;
}

function repairFromHistory(currentPath, historyPath) {
  if (!fs.existsSync(currentPath) || !fs.existsSync(historyPath)) return;
  const currentLines = fs.readFileSync(currentPath, 'utf8').split(/\r?\n/);
  const historyLines = fs.readFileSync(historyPath, 'utf8').split(/\r?\n/);
  const map = buildLcsMap(currentLines, historyLines);
  let changed = false;

  for (const [curIdx, histIdx] of map.entries()) {
    if (currentLines[curIdx].includes('\uFFFD') && !historyLines[histIdx].includes('\uFFFD')) {
      currentLines[curIdx] = historyLines[histIdx];
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(currentPath, currentLines.join('\n'), 'utf8');
  }
}

function applyLineReplacements(filePath, replacementsPath) {
  if (!fs.existsSync(filePath) || !fs.existsSync(replacementsPath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const raw = fs.readFileSync(replacementsPath, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const row of raw) {
    const idx = row.indexOf('|||');
    if (idx === -1) continue;
    const lineNo = Number(row.slice(0, idx));
    const text = row.slice(idx + 3);
    if (Number.isInteger(lineNo) && lineNo >= 1 && lineNo <= lines.length) {
      lines[lineNo - 1] = text;
    }
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function rebuildIndexHtml() {
  const histIndex = path.join(process.env.APPDATA, 'Code', 'User', 'History', '-35fc58e0', 'oSoP.html');
  let indexText = fs.readFileSync(histIndex, 'utf8');
  indexText = indexText.replace('<title>بەڕێوەبردنی کاڵا</title>', '<title>بەڕێوەبردنی کاڵا</title>\n<link rel="icon" href="data:,">');
  indexText = indexText.replace('سیستەمی ئابووری v2.2', 'سیستەمی ئابووری v2.4');
  indexText = indexText.replace('نسخە ٢.١', 'نسخە ٢.٤');
  indexText = indexText.replace('· نسخە ٢.٢', '· نسخە ٢.٤');
  indexText = indexText.replace('<script src="data.js"></script>', '<script src="utils.js"></script>\n<script src="data.js"></script>');
  fs.writeFileSync('index.html', indexText, 'utf8');
}

rebuildIndexHtml();
repairFromHistory('app.js', path.join(process.env.APPDATA, 'Code', 'User', 'History', '-36f74f71', 'BAa1.js'));
repairFromHistory('data.js', path.join(process.env.APPDATA, 'Code', 'User', 'History', '-2289f32c', 'GiBL.js'));
applyLineReplacements('data.js', '__data_replacements.txt');
applyLineReplacements('app.js', '__app_replacements.txt');
