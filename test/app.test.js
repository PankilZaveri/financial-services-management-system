const { test } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');

test('health route responds ok', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.status, 'ok');
  server.close();
});

test('deposit increases balance and appears in transaction list', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const before = await (await fetch(`${base}/api/accounts`)).json();
  const acc = before[0];

  const post = await fetch(`${base}/transactions`, {
    method: 'POST',
    body: new URLSearchParams({ accountId: String(acc.id), type: 'deposit', amount: '500' }),
    redirect: 'manual',
  });
  assert.equal(post.status, 302);

  const after = await (await fetch(`${base}/api/accounts`)).json();
  const updated = after.find((a) => a.id === acc.id);
  assert.equal(updated.balance, acc.balance + 500);

  const txs = await (await fetch(`${base}/api/transactions`)).json();
  assert.equal(txs[txs.length - 1].type, 'deposit');

  server.close();
});

test('withdrawal larger than balance is rejected', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const accounts = await (await fetch(`${base}/api/accounts`)).json();
  const acc = accounts[0];

  const res = await fetch(`${base}/transactions`, {
    method: 'POST',
    body: new URLSearchParams({ accountId: String(acc.id), type: 'withdraw', amount: String(acc.balance + 999999) }),
  });
  assert.equal(res.status, 400);

  server.close();
});

test('invalid input (missing amount) is rejected', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const res = await fetch(`${base}/transactions`, {
    method: 'POST',
    body: new URLSearchParams({ accountId: '1', type: 'deposit' }),
  });
  assert.equal(res.status, 400);

  server.close();
});
