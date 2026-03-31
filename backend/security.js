const crypto = require('crypto');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashPassword(password, salt = randomHex(16)) {
  const normalized = String(password || '');
  const hash = crypto.scryptSync(normalized, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(String(expectedHash), 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function createSessionToken() {
  return randomHex(24);
}

module.exports = {
  SESSION_TTL_MS,
  createSessionToken,
  hashPassword,
  randomHex,
  verifyPassword,
};
