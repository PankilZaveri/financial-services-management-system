const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ---- In-memory "database" ----
const accounts = [
  { id: 1, name: 'Asha Kulkarni', balance: 5000 },
  { id: 2, name: 'Ravi Patil', balance: 12000 },
  { id: 3, name: 'Meera Shah', balance: 800 },
   { id: 4, name: 'Karan Mehta', balance: 3000 },
];

const transactions = []; // { id, accountId, type: 'deposit'|'withdraw', amount, balanceAfter }

// escape user input so HTML/script tags render as text, not markup
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const sha = process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || 'local';
const commit = sha.slice(0, 7);

function findAccount(id) {
  return accounts.find((a) => a.id === Number(id));
}

// ---- Home page: dynamic HTML generated from server-side data ----
app.get('/', (req, res) => {
  const accountRows = accounts
    .map((a) => `<tr><td>${a.id}</td><td>${esc(a.name)}</td><td>₹${a.balance.toFixed(2)}</td></tr>`)
    .join('');

  const accountOptions = accounts
    .map((a) => `<option value="${a.id}">${esc(a.name)} (ID ${a.id})</option>`)
    .join('');

  const txRows = transactions
    .slice()
    .reverse()
    .map(
      (t) =>
        `<tr><td>${t.id}</td><td>${esc(findAccount(t.accountId)?.name || t.accountId)}</td><td>${t.type}</td><td>₹${t.amount.toFixed(2)}</td><td>₹${t.balanceAfter.toFixed(2)}</td></tr>`
    )
    .join('');

  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Financial Services Management System</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 16px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 14px; }
    th { background: #f4f4f4; }
    form { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
    input, select, button { padding: 8px; font-size: 14px; }
    button { cursor: pointer; }
    footer { color: #888; font-size: 12px; margin-top: 32px; }
    .error { color: #b00020; }
  </style>
</head>
<body>
  <h1>Financial Services Management System</h1>

  <h2>Accounts</h2>
  <table>
    <tr><th>ID</th><th>Name</th><th>Balance</th></tr>
    ${accountRows}
  </table>

  <h2>New Transaction</h2>
  <form method="POST" action="/transactions">
    <select name="accountId" required>${accountOptions}</select>
    <select name="type" required>
      <option value="deposit">Deposit</option>
      <option value="withdraw">Withdraw</option>
    </select>
    <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required>
    <button>Submit</button>
  </form>

  <h2>Transaction History</h2>
  <table>
    <tr><th>ID</th><th>Account</th><th>Type</th><th>Amount</th><th>Balance After</th></tr>
    ${txRows}
  </table>

  <footer>commit ${commit}</footer>
</body>
</html>`);
});

// ---- Add a transaction (deposit or withdraw), with validation ----
app.post('/transactions', (req, res) => {
  const { accountId, type, amount } = req.body;
  const account = findAccount(accountId);
  const amt = Number(amount);

  if (!account) {
    return res.status(400).send('Unknown account');
  }
  if (!['deposit', 'withdraw'].includes(type)) {
    return res.status(400).send('Transaction type must be deposit or withdraw');
  }
  if (!amt || amt <= 0 || Number.isNaN(amt)) {
    return res.status(400).send('Amount must be a positive number');
  }
  if (type === 'withdraw' && amt > account.balance) {
    return res.status(400).send('Insufficient balance');
  }

  account.balance += type === 'deposit' ? amt : -amt;

  transactions.push({
    id: transactions.length + 1,
    accountId: account.id,
    type,
    amount: amt,
    balanceAfter: account.balance,
  });

  res.redirect('/');
});

// ---- JSON API routes ----
app.get('/api/accounts', (req, res) => res.json(accounts));
app.get('/api/transactions', (req, res) => res.json(transactions));

// ---- Health check (used by Docker smoke test and Render) ----
app.get('/health', (req, res) => res.json({ status: 'ok', commit }));

module.exports = app;
