# Debt Payoff Calculator

A free debt payoff calculator for **Gem Home Team Mortgage Lending × NEO Home Loans**
(powered by Better). Enter your debts once and instantly compare the two most popular
payoff strategies — the **Debt Snowball** and the **Debt Avalanche** — side by side,
including exactly how much interest each one saves and how much sooner you'll be debt-free.

## Features

- **Unlimited debts** — name, type, balance, APR, and minimum payment for each
- **Debt Snowball** — smallest balance first (quick motivational wins)
- **Debt Avalanche** — highest APR first (mathematically optimal, least interest)
- **Minimum-payments-only baseline** — so both strategies show real savings
- **Side-by-side comparison tab** — debts entered once automatically flow into every
  view; a winner callout shows the exact dollar-and-month difference between methods
- **Extra payments** — recurring monthly extra plus a one-time lump sum in any month
- **Payment rollover ("snowballing")** — freed-up minimums roll onto the next target,
  with a toggle to turn it off
- **Full results** — debt-free date, payoff time, total interest, total paid, interest
  and time saved, payoff order with dates, and a complete month-by-month amortization
  schedule for every plan
- **Interactive charts** — remaining balance over time with hover tooltips
- **CSV export** of any schedule and a print/save-to-PDF view
- **Warnings** when a minimum payment doesn't cover a debt's monthly interest
- Debts and settings **auto-save in the browser** (localStorage); nothing is sent to a server

## Running it

It's a fully static site — no build step, no dependencies.

```bash
# just open it
open index.html

# or serve it
python3 -m http.server 8000   # → http://localhost:8000
```

Deploys as-is to GitHub Pages, Netlify, or any static host.

## How the math works

The engine (`js/engine.js`) runs a month-by-month simulation: each month, interest
accrues on every balance at `APR / 12`, every debt receives its minimum payment, and
all remaining budget (minimums freed by paid-off debts + extra payments) goes at the
current target debt — smallest balance for snowball, highest APR for avalanche —
cascading to the next target if a debt is wiped out mid-month. The baseline plan pays
minimums only with no rollover. Plans that can't outrun interest are flagged instead
of looping forever.

## Project layout

```
index.html      page structure + inline SVG brand lockup
css/styles.css  brand styling, layout, print styles
js/engine.js    payoff simulation engine (browser + Node, unit-testable)
js/charts.js    dependency-free SVG line chart with hover tooltips
js/app.js       UI: debt table, plan inputs, tabs, results, comparison, CSV
```

---
*This calculator is for educational purposes only and is not financial advice.*
