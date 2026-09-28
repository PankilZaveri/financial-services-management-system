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
  { id: 5, name: 'Priya Nair', balance: 7500 },
];

const transactions = []; // { id, accountId, type: 'deposit'|'withdraw', amount, balanceAfter }

// escape user input so HTML/script tags render as text, not markup
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const inr = (n) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const initials = (name) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const sha = process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || 'local';
const commit = sha.slice(0, 7);

function findAccount(id) {
  return accounts.find((a) => a.id === Number(id));
}

// ---- EMI calculator helpers ----
function parseEmi(q) {
  const amount = Number(q.amount);
  const rate = Number(q.rate);
  const months = Number(q.months);
  if (!(amount > 0) || amount > 100000000) return { error: 'Loan amount must be between 1 and 10,00,00,000' };
  if (q.rate === '' || !(rate >= 0) || rate > 50) return { error: 'Interest rate must be between 0 and 50%' };
  if (!Number.isInteger(months) || months < 1 || months > 480) return { error: 'Tenure must be a whole number of months (1 to 480)' };
  return { amount, rate, months };
}

function calcEmi({ amount, rate, months }) {
  const r = rate / 12 / 100;
  const emi = r === 0 ? amount / months : (amount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const total = emi * months;
  return { emi, total, interest: total - amount };
}

const styles = `
:root { --navy:#0f2a4a; --blue:#2563eb; --green:#16a34a; --red:#dc2626; --bg:#f1f5f9; --card:#fff; --text:#0f172a; --muted:#64748b; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif; background: var(--bg); color: var(--text); }
.hero { background: linear-gradient(120deg, #0f2a4a, #1d4ed8, #0ea5e9); background-size: 200% 200%; animation: shift 12s ease infinite; color: #fff; padding: 48px 20px 90px; text-align: center; }
.hero h1 { font-size: clamp(1.6rem, 4vw, 2.6rem); letter-spacing: .5px; animation: fadeUp .8s ease both; }
.hero p { opacity: .85; margin-top: 8px; animation: fadeUp .8s .15s ease both; }
.wrap { max-width: 980px; margin: -60px auto 40px; padding: 0 16px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat, .panel { background: var(--card); border-radius: 16px; box-shadow: 0 10px 30px rgba(15,42,74,.10); animation: fadeUp .7s ease both; }
.stat { padding: 20px; transition: transform .25s, box-shadow .25s; }
.stat:hover { transform: translateY(-5px); box-shadow: 0 16px 36px rgba(37,99,235,.22); }
.stat small { color: var(--muted); text-transform: uppercase; font-size: .72rem; letter-spacing: 1px; }
.stat b { display: block; font-size: 1.7rem; margin-top: 6px; color: var(--navy); }
.stat:nth-child(2) { animation-delay: .1s; } .stat:nth-child(3) { animation-delay: .2s; }
.panel { padding: 24px; margin-bottom: 24px; animation-delay: .25s; }
.panel h2 { font-size: 1.15rem; margin-bottom: 16px; color: var(--navy); border-left: 4px solid var(--blue); padding-left: 10px; }
table { width: 100%; border-collapse: collapse; font-size: .95rem; }
th { text-align: left; color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .8px; padding: 10px; border-bottom: 2px solid #e2e8f0; }
td { padding: 12px 10px; border-bottom: 1px solid #eef2f7; }
tbody tr { transition: background .2s; } tbody tr:hover { background: #f0f7ff; }
.who { display: flex; align-items: center; gap: 10px; }
.av { width: 36px; height: 36px; border-radius: 50%; color: #fff; font-weight: 600; font-size: .8rem; display: grid; place-items: center; }
.badge { padding: 3px 12px; border-radius: 999px; font-size: .78rem; font-weight: 600; text-transform: capitalize; }
.deposit { background: #dcfce7; color: var(--green); } .withdraw { background: #fee2e2; color: var(--red); }
form { display: flex; gap: 10px; flex-wrap: wrap; }
select, input { flex: 1; min-width: 150px; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: .95rem; transition: border .2s, box-shadow .2s; }
select:focus, input:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px rgba(37,99,235,.18); }
button { padding: 12px 28px; border: 0; border-radius: 10px; color: #fff; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, #2563eb, #0ea5e9); transition: transform .15s, box-shadow .2s; }
button:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(37,99,235,.35); } button:active { transform: scale(.97); }
.empty { text-align: center; color: var(--muted); padding: 22px; }
footer { text-align: center; color: var(--muted); font-size: .8rem; padding-bottom: 30px; }
footer span { background: #e2e8f0; padding: 3px 10px; border-radius: 999px; font-family: monospace; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
@keyframes shift { 50% { background-position: 100% 50%; } }
.nav { margin-top: 18px; animation: fadeUp .8s .3s ease both; } .nav a { color: #fff; text-decoration: none; border: 1px solid rgba(255,255,255,.6); padding: 8px 20px; border-radius: 999px; font-size: .9rem; transition: background .2s; } .nav a:hover { background: rgba(255,255,255,.2); }
.alert { background: #fee2e2; color: #991b1b; padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; }
.bar { height: 16px; background: #fb923c; border-radius: 999px; overflow: hidden; margin: 8px 0 12px; } .bar span { display: block; height: 100%; background: linear-gradient(90deg, #2563eb, #0ea5e9); animation: grow 1s ease both; }
.legend { display: flex; justify-content: space-between; font-size: .85rem; color: var(--muted); }
@keyframes grow { from { width: 0; } }
@media (max-width: 600px) { .panel { padding: 16px; overflow-x: auto; } }
`;

// ---- Home page: dynamic HTML generated from server-side data ----
app.get('/', (req, res) => {
  const total = accounts.reduce((s, a) => s + a.balance, 0);

  const accountRows = accounts
    .map(
      (a) => `<tr><td>${a.id}</td>
      <td><div class="who"><div class="av" style="background:hsl(${a.id * 67 % 360},60%,45%)">${initials(a.name)}</div>${esc(a.name)}</div></td>
      <td><b>${inr(a.balance)}</b></td></tr>`
    )
    .join('');

  const accountOptions = accounts.map((a) => `<option value="${a.id}">${esc(a.name)} (ID ${a.id})</option>`).join('');

  const txRows = transactions
    .slice()
    .reverse()
    .map(
      (t) => `<tr><td>${t.id}</td><td>${esc(findAccount(t.accountId)?.name || t.accountId)}</td>
      <td><span class="badge ${t.type}">${t.type}</span></td><td>${inr(t.amount)}</td><td>${inr(t.balanceAfter)}</td></tr>`
    )
    .join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Financial Services Management System</title>
  <style>${styles}</style>
</head>
<body>
  <header class="hero">
    <h1>💼 Financial Services Management System</h1>
    <p>Manage customer accounts, deposits and withdrawals in real time</p>
    <div class="nav"><a href="/emi">🧮 EMI Loan Calculator</a></div>
  </header>

  <main class="wrap">
    <section class="stats">
      <div class="stat"><small>Total Accounts</small><b data-count="${accounts.length}">0</b></div>
      <div class="stat"><small>Total Balance</small><b data-count="${total}" data-dec="2" data-prefix="₹">₹0</b></div>
      <div class="stat"><small>Transactions</small><b data-count="${transactions.length}">0</b></div>
    </section>

    <section class="panel">
      <h2>Accounts</h2>
      <table><thead><tr><th>ID</th><th>Customer</th><th>Balance</th></tr></thead><tbody>${accountRows}</tbody></table>
    </section>

    <section class="panel">
      <h2>New Transaction</h2>
      <form method="POST" action="/transactions">
        <select name="accountId" required>${accountOptions}</select>
        <select name="type" required><option value="deposit">Deposit</option><option value="withdraw">Withdraw</option></select>
        <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount (₹)" required>
        <button>Submit</button>
      </form>
    </section>

    <section class="panel">
      <h2>Transaction History</h2>
      <table><thead><tr><th>ID</th><th>Account</th><th>Type</th><th>Amount</th><th>Balance After</th></tr></thead>
      <tbody>${txRows || '<tr><td colspan="5" class="empty">No transactions yet — submit one above.</td></tr>'}</tbody></table>
    </section>
  </main>

  <footer>Built for CCA2 Assignment &bull; commit <span>${commit}</span></footer>

  <script>
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var end = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), t0 = performance.now();
      function step(t) {
        var p = Math.min((t - t0) / 900, 1), v = end * (1 - Math.pow(1 - p, 3));
        el.textContent = (el.dataset.prefix || '') + v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  </script>
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
  if (amt > 10000000) {
    return res.status(400).send('Amount exceeds maximum allowed limit');
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

// ---- EMI loan calculator page (server-side computed) ----
app.get('/emi', (req, res) => {
  const q = req.query;
  const submitted = ['amount', 'rate', 'months'].some((k) => q[k] !== undefined);
  const parsed = submitted ? parseEmi(q) : null;
  const result = parsed && !parsed.error ? calcEmi(parsed) : null;
  const val = (k, d) => esc(q[k] !== undefined ? q[k] : d);
  const principalPct = result ? Math.round((parsed.amount / result.total) * 100) : 0;

  res.status(parsed && parsed.error ? 400 : 200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EMI Loan Calculator</title>
  <style>${styles}</style>
</head>
<body>
  <header class="hero">
    <h1>🧮 EMI Loan Calculator</h1>
    <p>Plan your loan: monthly instalment, total interest and total payment</p>
    <div class="nav"><a href="/">← Back to Dashboard</a></div>
  </header>
  <main class="wrap">
    <section class="panel">
      <h2>Loan Details</h2>
      ${parsed && parsed.error ? `<div class="alert">${esc(parsed.error)}</div>` : ''}
      <form method="GET" action="/emi">
        <input name="amount" type="number" step="any" min="1" placeholder="Loan amount (₹)" value="${val('amount', '')}" required>
        <input name="rate" type="number" step="any" min="0" max="50" placeholder="Interest rate (% per year)" value="${val('rate', '')}" required>
        <input name="months" type="number" min="1" max="480" placeholder="Tenure (months)" value="${val('months', '')}" required>
        <button>Calculate EMI</button>
      </form>
    </section>
    ${result ? `
    <section class="stats">
      <div class="stat"><small>Monthly EMI</small><b data-count="${result.emi.toFixed(2)}" data-dec="2" data-prefix="₹">₹0</b></div>
      <div class="stat"><small>Total Interest</small><b data-count="${result.interest.toFixed(2)}" data-dec="2" data-prefix="₹">₹0</b></div>
      <div class="stat"><small>Total Payment</small><b data-count="${result.total.toFixed(2)}" data-dec="2" data-prefix="₹">₹0</b></div>
    </section>
    <section class="panel">
      <h2>Payment Breakdown</h2>
      <div class="bar"><span style="width:${principalPct}%"></span></div>
      <div class="legend"><span>Principal ${principalPct}%</span><span>Interest ${100 - principalPct}%</span></div>
    </section>` : ''}
  </main>
  <footer>Built for CCA2 Assignment &bull; commit <span>${commit}</span></footer>
  <script>
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var end = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), t0 = performance.now();
      function step(t) {
        var p = Math.min((t - t0) / 900, 1), v = end * (1 - Math.pow(1 - p, 3));
        el.textContent = (el.dataset.prefix || '') + v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  </script>
</body>
</html>`);
});

// ---- JSON API routes ----
app.get('/api/emi', (req, res) => {
  const p = parseEmi(req.query);
  if (p.error) return res.status(400).json({ error: p.error });
  const r = calcEmi(p);
  res.json({ ...p, emi: +r.emi.toFixed(2), totalInterest: +r.interest.toFixed(2), totalPayment: +r.total.toFixed(2) });
});
app.get('/api/accounts', (req, res) => res.json(accounts));
app.get('/api/transactions', (req, res) => res.json(transactions));

// Health check route used by Docker and Render to verify the app is running
app.get('/health', (req, res) => res.json({ status: 'ok', commit }));

module.exports = app;
