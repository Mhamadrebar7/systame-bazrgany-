const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, verifyPassword } = require('../backend/security');
const {
  getCustomerPortalData,
  getCustomerTokenAccessState,
  sanitizeSnapshot,
} = require('../backend/snapshot');

test('hashPassword + verifyPassword work together', () => {
  const passwordState = hashPassword('secret-123');
  assert.equal(verifyPassword('secret-123', passwordState.salt, passwordState.hash), true);
  assert.equal(verifyPassword('wrong-pass', passwordState.salt, passwordState.hash), false);
});

test('sanitizeSnapshot keeps valid product-linked events', () => {
  const snapshot = sanitizeSnapshot({
    products: [{ id: 1, name: 'Test' }],
    events: [
      { id: 10, type: 'sell_cash', productId: 1, totalPrice: 20, currency: 'USD' },
      { id: 11, type: 'sell_cash', productId: 2, totalPrice: 15, currency: 'USD' },
    ],
    customerTokens: {},
  });

  assert.equal(snapshot.products.length, 1);
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.events[0].id, 10);
});

test('customer token access detects expired and revoked links', () => {
  const base = {
    products: [{ id: 1, name: 'Phone', unit: 'دانە' }],
    events: [],
    customerTokens: {
      '0750': { token: 'active123', name: 'A', phone: '0750', createdAt: '2026-01-01T00:00:00.000Z' },
      '0751': { token: 'revoked123', name: 'B', phone: '0751', createdAt: '2026-01-01T00:00:00.000Z', revokedAt: '2026-01-02T00:00:00.000Z' },
      '0752': { token: 'expired123', name: 'C', phone: '0752', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2025-01-01T00:00:00.000Z' },
    },
  };

  assert.equal(getCustomerTokenAccessState(base, 'active123').ok, true);
  assert.equal(getCustomerTokenAccessState(base, 'revoked123').code, 'revoked');
  assert.equal(getCustomerTokenAccessState(base, 'expired123').code, 'expired');
});

test('getCustomerPortalData builds summary for a valid token', () => {
  const snapshot = {
    currencies: [{ code: 'USD', rateToUSD: 1 }],
    products: [{ id: 1, name: 'Phone', unit: 'دانە' }],
    events: [
      { id: 1, type: 'sell_debt', productId: 1, buyer: 'K', phone: '0750', customerToken: 'cust1234', totalPrice: 100, currency: 'USD', date: '2026-03-01' },
      { id: 2, type: 'debt_pay', productId: 1, buyer: 'K', phone: '0750', customerToken: 'cust1234', amount: 25, currency: 'USD', date: '2026-03-02' },
    ],
    customerTokens: {
      '0750': { token: 'cust1234', name: 'K', phone: '0750', createdAt: '2026-03-01T00:00:00.000Z' },
    },
  };

  const summary = getCustomerPortalData(snapshot, 'cust1234');
  assert.ok(summary);
  assert.equal(summary.name, 'K');
  assert.equal(summary.totalDebtUSD, 100);
  assert.equal(summary.totalPaidUSD, 25);
  assert.equal(summary.debtRemainUSD, 75);
  assert.equal(summary.txs.length, 2);
});
