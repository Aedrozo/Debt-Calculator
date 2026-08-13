/*
 * UI layer: debt entry, plan inputs, tabs, results rendering.
 * One shared debt list drives all three views (snowball, avalanche,
 * comparison), so debts entered once automatically flow everywhere.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ght-debt-calculator-v1';

  var DEBT_TYPES = ['Credit card', 'Store card', 'Auto loan', 'Student loan',
    'Personal loan', 'Medical bill', 'Mortgage / HELOC', 'Other'];

  var SAMPLE_DEBTS = [
    { name: 'Visa credit card', type: 'Credit card', balance: 8500, apr: 24.99, minPayment: 215 },
    { name: 'Store card', type: 'Store card', balance: 1200, apr: 26.99, minPayment: 45 },
    { name: 'Car loan', type: 'Auto loan', balance: 16300, apr: 6.4, minPayment: 410 },
    { name: 'Student loan', type: 'Student loan', balance: 22000, apr: 5.5, minPayment: 250 },
    { name: 'Personal loan', type: 'Personal loan', balance: 5000, apr: 11.9, minPayment: 150 },
    { name: 'Medical bill', type: 'Medical bill', balance: 900, apr: 0, minPayment: 50 }
  ];

  var METHOD_META = {
    snowball: {
      label: 'Debt Snowball', icon: '❄️', cssVar: '--series-snowball',
      sub: 'Smallest balance first',
      blurb: 'The snowball method pays minimums on everything and throws every extra dollar at your ' +
        'smallest balance. Each debt you wipe out frees up its payment for the next one — quick wins ' +
        'that keep you motivated.'
    },
    avalanche: {
      label: 'Debt Avalanche', icon: '⛰', cssVar: '--series-avalanche',
      sub: 'Highest interest rate first',
      blurb: 'The avalanche method pays minimums on everything and throws every extra dollar at your ' +
        'highest-APR debt. It is the mathematically optimal order — you will never pay more interest ' +
        'than with any other order.'
    },
    minimum: {
      label: 'Minimum Payments Only', icon: '🐢', cssVar: '--series-minimum',
      sub: 'No extra payments, nothing rolls over'
    }
  };

  /* ---------------- state ---------------- */

  var state = {
    debts: [],
    extraMonthly: 100,
    oneTimeAmount: 0,
    oneTimeMonth: 1,
    startMonth: defaultStartMonth(),
    rollover: true
  };
  var nextId = 1;
  var activeTab = 'compare';

  function defaultStartMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function newDebt(seed) {
    seed = seed || {};
    return {
      id: 'd' + (nextId++),
      name: seed.name || '',
      type: seed.type || DEBT_TYPES[0],
      balance: seed.balance != null ? seed.balance : '',
      apr: seed.apr != null ? seed.apr : '',
      minPayment: seed.minPayment != null ? seed.minPayment : ''
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        debts: state.debts, extraMonthly: state.extraMonthly,
        oneTimeAmount: state.oneTimeAmount, oneTimeMonth: state.oneTimeMonth,
        startMonth: state.startMonth, rollover: state.rollover
      }));
    } catch (e) { /* private-mode storage failures are non-fatal */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.debts)) return false;
      state.debts = data.debts.map(function (d) { return newDebt(d); });
      state.extraMonthly = +data.extraMonthly || 0;
      state.oneTimeAmount = +data.oneTimeAmount || 0;
      state.oneTimeMonth = +data.oneTimeMonth || 1;
      state.startMonth = data.startMonth || defaultStartMonth();
      state.rollover = data.rollover !== false;
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- formatting helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(v, cents) {
    if (v == null || isNaN(v)) return '—';
    return '$' + Number(v).toLocaleString('en-US', {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0
    });
  }

  function startDate() {
    var parts = (state.startMonth || defaultStartMonth()).split('-');
    return new Date(+parts[0], +parts[1] - 1, 1);
  }

  /** Calendar month of plan-month m (m=1 is the start month itself). */
  function monthDate(m) {
    var d = startDate();
    return new Date(d.getFullYear(), d.getMonth() + (m - 1), 1);
  }

  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  function fmtMonth(m) {
    var d = monthDate(m);
    return MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtMonthLong(m) {
    var d = monthDate(m);
    return MONTHS_LONG[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDuration(months) {
    if (months == null) return 'Never';
    if (months < 1) return '0 months';
    var y = Math.floor(months / 12), mo = months % 12, parts = [];
    if (y) parts.push(y + (y === 1 ? ' year' : ' years'));
    if (mo) parts.push(mo + (mo === 1 ? ' month' : ' months'));
    return parts.join(', ');
  }

  function seriesColor(method) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(METHOD_META[method].cssVar).trim() || '#2a78d6';
  }

  /* ---------------- debt inputs ---------------- */

  var debtRowsEl = document.getElementById('debt-rows');

  function renderDebtRows() {
    debtRowsEl.innerHTML = state.debts.map(function (d) {
      var typeOpts = DEBT_TYPES.map(function (t) {
        return '<option' + (t === d.type ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
      return '<tr data-id="' + d.id + '">' +
        '<td class="col-name"><input type="text" data-field="name" value="' + esc(d.name) + '" placeholder="e.g. Visa card" aria-label="Debt name"></td>' +
        '<td class="col-type"><select data-field="type" aria-label="Debt type">' + typeOpts + '</select></td>' +
        '<td><input type="number" data-field="balance" value="' + esc(d.balance) + '" min="0" step="50" placeholder="0" inputmode="decimal" aria-label="Current balance in dollars"></td>' +
        '<td><input type="number" data-field="apr" value="' + esc(d.apr) + '" min="0" max="120" step="0.1" placeholder="0.0" inputmode="decimal" aria-label="Annual interest rate percent"></td>' +
        '<td><input type="number" data-field="minPayment" value="' + esc(d.minPayment) + '" min="0" step="5" placeholder="0" inputmode="decimal" aria-label="Minimum monthly payment in dollars"></td>' +
        '<td><button type="button" class="remove-debt" title="Remove this debt" aria-label="Remove ' + esc(d.name || 'debt') + '">✕</button></td>' +
        '</tr>';
    }).join('');
  }

  debtRowsEl.addEventListener('input', function (e) {
    var tr = e.target.closest('tr');
    var field = e.target.getAttribute('data-field');
    if (!tr || !field) return;
    var debt = state.debts.find(function (d) { return d.id === tr.getAttribute('data-id'); });
    if (!debt) return;
    debt[field] = e.target.value;
    scheduleRecalc();
  });

  debtRowsEl.addEventListener('click', function (e) {
    if (!e.target.classList.contains('remove-debt')) return;
    var tr = e.target.closest('tr');
    state.debts = state.debts.filter(function (d) { return d.id !== tr.getAttribute('data-id'); });
    renderDebtRows();
    scheduleRecalc();
  });

  document.getElementById('add-debt').addEventListener('click', function () {
    state.debts.push(newDebt());
    renderDebtRows();
    debtRowsEl.querySelector('tr:last-child input')?.focus();
    scheduleRecalc();
  });

  document.getElementById('load-sample').addEventListener('click', function () {
    state.debts = SAMPLE_DEBTS.map(newDebt);
    renderDebtRows();
    scheduleRecalc();
  });

  document.getElementById('clear-debts').addEventListener('click', function () {
    state.debts = [];
    renderDebtRows();
    scheduleRecalc();
  });

  /* ---------------- plan inputs ---------------- */

  function bindPlanInput(id, key, parse) {
    var el = document.getElementById(id);
    el.addEventListener('input', function () {
      state[key] = parse ? parse(el.value) : el.value;
      scheduleRecalc();
    });
    return el;
  }

  var extraEl = bindPlanInput('extra-monthly', 'extraMonthly', function (v) { return Math.max(0, +v || 0); });
  var oneAmtEl = bindPlanInput('onetime-amount', 'oneTimeAmount', function (v) { return Math.max(0, +v || 0); });
  var oneMonthEl = bindPlanInput('onetime-month', 'oneTimeMonth', function (v) { return Math.max(1, +v || 1); });
  var startEl = document.getElementById('start-month');
  startEl.addEventListener('input', function () {
    if (startEl.value) state.startMonth = startEl.value;
    fillOneTimeMonths();
    scheduleRecalc();
  });
  var rolloverEl = document.getElementById('rollover');
  rolloverEl.addEventListener('change', function () {
    state.rollover = rolloverEl.checked;
    scheduleRecalc();
  });

  function fillOneTimeMonths() {
    var opts = '';
    for (var m = 1; m <= 60; m++) {
      opts += '<option value="' + m + '"' + (m === state.oneTimeMonth ? ' selected' : '') + '>' +
        'Month ' + m + ' — ' + fmtMonth(m) + '</option>';
    }
    oneMonthEl.innerHTML = opts;
  }

  function syncPlanInputs() {
    extraEl.value = state.extraMonthly;
    oneAmtEl.value = state.oneTimeAmount;
    startEl.value = state.startMonth;
    rolloverEl.checked = state.rollover;
    fillOneTimeMonths();
  }

  /* ---------------- tabs ---------------- */

  var TABS = ['snowball', 'avalanche', 'compare'];
  TABS.forEach(function (t) {
    document.getElementById('tab-' + t).addEventListener('click', function () { setTab(t); });
  });

  function setTab(t) {
    activeTab = t;
    TABS.forEach(function (k) {
      var isActive = k === t;
      var tab = document.getElementById('tab-' + k);
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      document.getElementById('panel-' + k).hidden = !isActive;
    });
  }

  document.getElementById('print-btn').addEventListener('click', function () { window.print(); });

  /* ---------------- recalc pipeline ---------------- */

  var recalcTimer = null;
  var lastResults = null;

  function scheduleRecalc() {
    clearTimeout(recalcTimer);
    recalcTimer = setTimeout(recalc, 120);
  }

  function cleanDebts() {
    return state.debts
      .map(function (d, i) {
        return {
          id: d.id,
          name: String(d.name || '').trim() || 'Debt ' + (i + 1),
          balance: Math.max(0, +d.balance || 0),
          apr: Math.max(0, +d.apr || 0),
          minPayment: Math.max(0, +d.minPayment || 0)
        };
      })
      .filter(function (d) { return d.balance > 0; });
  }

  function recalc() {
    save();
    var debts = cleanDebts();

    // totals row
    var totalBal = debts.reduce(function (s, d) { return s + d.balance; }, 0);
    var totalMin = debts.reduce(function (s, d) { return s + d.minPayment; }, 0);
    var wAvg = totalBal > 0
      ? debts.reduce(function (s, d) { return s + d.apr * d.balance; }, 0) / totalBal : 0;
    document.getElementById('total-balance').textContent = money(totalBal);
    document.getElementById('total-min').textContent = money(totalMin) + '/mo';
    document.getElementById('avg-apr').textContent = totalBal ? wAvg.toFixed(1) + '% avg' : '—';

    // budget line
    var budgetEl = document.getElementById('budget-line');
    if (debts.length) {
      var budget = totalMin + state.extraMonthly;
      budgetEl.innerHTML = 'Your total monthly payment: <strong>' + money(budget) + '</strong>' +
        ' (' + money(totalMin) + ' in minimums + ' + money(state.extraMonthly) + ' extra)' +
        (state.oneTimeAmount > 0
          ? ', plus a one-time <strong>' + money(state.oneTimeAmount) + '</strong> in ' + fmtMonth(state.oneTimeMonth)
          : '');
    } else {
      budgetEl.innerHTML = 'Add your debts above to see your plan.';
    }

    // warnings
    var warnEl = document.getElementById('debt-warnings');
    warnEl.innerHTML = DebtEngine.validateDebts(debts)
      .map(function (w) { return '<p>⚠️ ' + esc(w.message) + '</p>'; }).join('');

    if (!debts.length) {
      lastResults = null;
      var empty = '<div class="empty-state">Add at least one debt above (or click ' +
        '<strong>“Load example debts”</strong>) to see your payoff plan.</div>';
      TABS.forEach(function (t) { document.getElementById('panel-' + t).innerHTML = empty; });
      return;
    }

    lastResults = DebtEngine.compare(debts, {
      extraMonthly: state.extraMonthly,
      oneTimeAmount: state.oneTimeAmount,
      oneTimeMonth: state.oneTimeMonth,
      rollover: state.rollover
    });

    renderStrategyPanel('snowball', lastResults);
    renderStrategyPanel('avalanche', lastResults);
    renderComparePanel(lastResults);
  }

  /* ---------------- strategy panels ---------------- */

  function savingsVsMinimum(run, min) {
    if (min.neverPayoff || run.neverPayoff) return { interest: null, months: null };
    return {
      interest: Math.max(0, min.totalInterest - run.totalInterest),
      months: Math.max(0, min.monthsToPayoff - run.monthsToPayoff)
    };
  }

  function kpi(label, value, note, cls) {
    return '<div class="kpi ' + (cls || '') + '">' +
      '<div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      (note ? '<div class="kpi-note">' + note + '</div>' : '') + '</div>';
  }

  function balanceSeries(run) {
    var vals = [run.startBalance];
    run.months.forEach(function (m) { vals.push(m.totalBalance); });
    return vals;
  }

  function renderChart(el, runsByMethod, height) {
    var series = Object.keys(runsByMethod).map(function (method) {
      return {
        name: METHOD_META[method].label.replace('Debt ', '').replace(' Payments Only', ' only'),
        color: seriesColor(method),
        dash: method === 'minimum' ? '5 5' : null,
        values: balanceSeries(runsByMethod[method])
      };
    });
    Charts.lineChart(el, series, {
      height: height || 320,
      monthLabel: function (m) { return fmtMonth(Math.max(1, m)); }
    });
  }

  function legendHtml(methods) {
    return '<div class="chart-legend">' + methods.map(function (m) {
      return '<span class="item"><span class="swatch" style="background:' + seriesColor(m) + '"></span>' +
        METHOD_META[m].label + '</span>';
    }).join('') + '</div>';
  }

  function renderStrategyPanel(method, results) {
    var run = results[method];
    var min = results.minimum;
    var meta = METHOD_META[method];
    var panel = document.getElementById('panel-' + method);
    var saved = savingsVsMinimum(run, min);

    var html = '<p class="strategy-blurb">' + meta.icon + ' ' + meta.blurb + '</p>';

    if (run.neverPayoff) {
      html += '<div class="warnings"><p>⚠️ With the current payments, this plan never pays off — your ' +
        'payments don’t keep up with the interest being charged. Increase your extra monthly payment ' +
        'or check the minimum payments you entered.</p></div>';
      panel.innerHTML = html;
      return;
    }

    html += '<div class="kpi-row">' +
      kpi('Debt-free date', fmtMonthLong(run.monthsToPayoff), 'Your last payment', 'kpi-hero') +
      kpi('Payoff time', fmtDuration(run.monthsToPayoff), run.monthsToPayoff + ' payments') +
      kpi('Total interest', money(run.totalInterest), 'Cost of borrowing') +
      kpi('Total paid', money(run.totalPaid), money(run.startBalance) + ' principal') +
      kpi('Interest saved', saved.interest == null ? '—' : money(saved.interest),
        min.neverPayoff ? 'Minimums alone never finish' : 'vs. minimum payments only', 'kpi-good') +
      kpi('Time saved', saved.months == null ? '—' : fmtDuration(saved.months),
        min.neverPayoff ? 'Minimums alone never finish' : 'vs. minimum payments only', 'kpi-good') +
      '</div>';

    // chart: this method vs minimums baseline
    html += '<div class="panel-section"><h3>Remaining balance over time</h3>' +
      '<div class="chart-box"><div class="chart-mount"></div>' +
      legendHtml([method, 'minimum']) + '</div></div>';

    // payoff order
    html += '<div class="panel-section"><h3>Your payoff order</h3>' +
      '<div class="table-scroll"><table class="order-table"><thead><tr>' +
      '<th>Order</th><th>Debt</th><th>Paid off</th><th>Months</th><th>Interest paid</th><th>Total paid</th>' +
      '</tr></thead><tbody>' +
      run.payoffOrder.map(function (p, i) {
        return '<tr><td><span class="order-num">' + (i + 1) + '</span></td>' +
          '<td>' + esc(p.name) + '</td>' +
          '<td>' + fmtMonth(p.month) + '</td>' +
          '<td>' + p.month + '</td>' +
          '<td>' + money(p.interestPaid, true) + '</td>' +
          '<td>' + money(p.totalPaid, true) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<p class="panel-note">Each debt’s freed-up payment rolls onto the next target' +
      (state.rollover ? '' : ' (rollover is currently turned off in your plan)') + '.</p></div>';

    // schedule
    html += '<div class="panel-section"><h3>Month-by-month payment schedule</h3>' +
      scheduleHtml(run) + '</div>';

    panel.innerHTML = html;
    renderChartFor(panel, method === 'snowball'
      ? { snowball: run, minimum: min }
      : { avalanche: run, minimum: min });
    wireScheduleTools(panel, run);
  }

  function scheduleHtml(run) {
    var rows = run.months.map(function (m) {
      var paidNote = m.paidOff.map(function (id) {
        return esc(run.perDebt[id] ? run.perDebt[id].name : id) + ' paid off! 🎉';
      }).join(', ');
      return '<tr' + (m.paidOff.length ? ' class="payoff-row"' : '') + '>' +
        '<td>' + m.m + '</td>' +
        '<td>' + fmtMonth(m.m) + (paidNote ? ' <span class="paid-note">' + paidNote + '</span>' : '') + '</td>' +
        '<td>' + money(m.payment, true) + '</td>' +
        '<td>' + money(m.interest, true) + '</td>' +
        '<td>' + money(m.principal, true) + '</td>' +
        '<td>' + money(m.totalBalance, true) + '</td></tr>';
    }).join('');
    return '<details class="schedule"><summary>Show all ' + run.months.length + ' payments</summary>' +
      '<div class="schedule-scroll"><table class="schedule-table"><thead><tr>' +
      '<th>#</th><th>Month</th><th>Payment</th><th>Interest</th><th>Principal</th><th>Balance left</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="schedule-tools"><button type="button" class="btn btn-ghost csv-btn">⬇ Download schedule (CSV)</button></div>' +
      '</details>';
  }

  function renderChartFor(panel, runsByMethod) {
    var mount = panel.querySelector('.chart-mount');
    if (mount) renderChart(mount, runsByMethod);
  }

  function wireScheduleTools(panel, run) {
    var btn = panel.querySelector('.csv-btn');
    if (btn) btn.addEventListener('click', function () { downloadCsv(run); });
  }

  /* ---------------- comparison panel ---------------- */

  function renderComparePanel(results) {
    var snow = results.snowball, aval = results.avalanche, min = results.minimum;
    var panel = document.getElementById('panel-compare');
    var html = '';

    // headline callout
    if (snow.neverPayoff || aval.neverPayoff) {
      html += '<div class="warnings"><p>⚠️ With the current payments, these plans never pay off — your ' +
        'payments don’t keep up with interest. Increase your extra monthly payment.</p></div>';
      panel.innerHTML = html;
      return;
    }

    var iDiff = snow.totalInterest - aval.totalInterest;
    var mDiff = snow.monthsToPayoff - aval.monthsToPayoff;
    if (Math.round(Math.abs(iDiff)) < 1 && mDiff === 0) {
      html += '<div class="callout neutral"><strong>For your debts, both methods come out the same</strong> — ' +
        'same debt-free date (' + fmtMonthLong(aval.monthsToPayoff) + ') and the same total interest (' +
        money(aval.totalInterest) + '). Pick the order that keeps you motivated.</div>';
    } else {
      var winner = iDiff > 0 ? 'Avalanche' : 'Snowball';
      var save = Math.abs(iDiff), faster = Math.abs(mDiff);
      html += '<div class="callout"><strong>The Debt ' + winner + ' wins for your debts:</strong> it saves you ' +
        '<span class="big">' + money(save) + '</span> in interest' +
        (faster > 0 ? ' and gets you debt-free <span class="big">' + fmtDuration(faster) + '</span> sooner'
          : ' with the same debt-free date') +
        ' compared to the ' + (winner === 'Avalanche' ? 'Snowball' : 'Avalanche') + '. ' +
        (winner === 'Avalanche'
          ? 'The Snowball still finishes on ' + fmtMonthLong(snow.monthsToPayoff) +
            ' — if quick wins keep you going, that trade-off can be worth it.'
          : '')
        + '</div>';
    }

    // method cards — badge goes to the strictly cheaper strategy
    html += '<div class="compare-grid">' +
      methodCard('snowball', snow, min, iDiff < -0.5) +
      methodCard('avalanche', aval, min, iDiff > 0.5) +
      methodCard('minimum', min, min, false) +
      '</div>';

    // combined chart
    html += '<div class="panel-section"><h3>Remaining balance over time — all three plans</h3>' +
      '<div class="chart-box"><div class="chart-mount"></div>' +
      legendHtml(['snowball', 'avalanche', 'minimum']) + '</div></div>';

    // metric table
    html += '<div class="panel-section"><h3>The numbers, side by side</h3>' +
      '<div class="table-scroll">' + metricTable(snow, aval, min) + '</div></div>';

    // payoff order comparison
    var maxLen = Math.max(snow.payoffOrder.length, aval.payoffOrder.length);
    var orderRows = '';
    for (var i = 0; i < maxLen; i++) {
      var s = snow.payoffOrder[i], a = aval.payoffOrder[i];
      orderRows += '<tr><td><span class="order-num">' + (i + 1) + '</span></td>' +
        '<td>' + (s ? esc(s.name) + ' <span class="paid-note">(' + fmtMonth(s.month) + ')</span>' : '—') + '</td>' +
        '<td>' + (a ? esc(a.name) + ' <span class="paid-note">(' + fmtMonth(a.month) + ')</span>' : '—') + '</td></tr>';
    }
    html += '<div class="panel-section"><h3>Payoff order by method</h3>' +
      '<div class="table-scroll"><table class="order-table"><thead><tr>' +
      '<th>Order</th><th>❄️ Snowball pays off…</th><th>⛰ Avalanche pays off…</th>' +
      '</tr></thead><tbody>' + orderRows + '</tbody></table></div>' +
      '<p class="panel-note">Same debts, same money — only the order changes. The snowball clears small ' +
      'balances early for motivation; the avalanche kills expensive interest first.</p></div>';

    panel.innerHTML = html;
    renderChartFor(panel, { snowball: snow, avalanche: aval, minimum: min });
  }

  function methodCard(method, run, min, isWinner) {
    var meta = METHOD_META[method];
    var saved = method === 'minimum' ? null : savingsVsMinimum(run, min);
    var never = run.neverPayoff;
    return '<div class="method-card' + (isWinner ? ' is-winner' : '') + '">' +
      (isWinner ? '<span class="winner-badge">LOWEST COST</span>' : '') +
      '<h3><span class="swatch" style="background:' + seriesColor(method) + '"></span>' +
      meta.icon + ' ' + meta.label + '</h3>' +
      '<p class="method-sub">' + meta.sub + '</p>' +
      '<div class="method-stats">' +
      '<div class="row"><span>Debt-free date</span><span>' + (never ? 'Never' : fmtMonthLong(run.monthsToPayoff)) + '</span></div>' +
      '<div class="row"><span>Payoff time</span><span>' + (never ? '—' : fmtDuration(run.monthsToPayoff)) + '</span></div>' +
      '<div class="row"><span>Total interest</span><span>' + (never ? '$—' : money(run.totalInterest)) + '</span></div>' +
      '<div class="row"><span>Total paid</span><span>' + (never ? '$—' : money(run.totalPaid)) + '</span></div>' +
      (saved ? '<div class="row hl"><span>Interest saved vs. minimums</span><span>' +
        (saved.interest == null ? '—' : money(saved.interest)) + '</span></div>' +
        '<div class="row hl"><span>Time saved vs. minimums</span><span>' +
        (saved.months == null ? '—' : fmtDuration(saved.months)) + '</span></div>' : '') +
      (never ? '<div class="row"><span>⚠️ Minimum payments never catch up with interest here.</span></div>' : '') +
      '</div></div>';
  }

  function metricTable(snow, aval, min) {
    function minCell(fn, never) { return min.neverPayoff ? never : fn(min); }
    var rows = [
      ['Debt-free date',
        fmtMonthLong(snow.monthsToPayoff), fmtMonthLong(aval.monthsToPayoff),
        minCell(function (r) { return fmtMonthLong(r.monthsToPayoff); }, 'Never'),
        aval.monthsToPayoff === snow.monthsToPayoff ? -1 : (aval.monthsToPayoff < snow.monthsToPayoff ? 1 : 0)],
      ['Total payoff time',
        fmtDuration(snow.monthsToPayoff), fmtDuration(aval.monthsToPayoff),
        minCell(function (r) { return fmtDuration(r.monthsToPayoff); }, '—'),
        aval.monthsToPayoff === snow.monthsToPayoff ? -1 : (aval.monthsToPayoff < snow.monthsToPayoff ? 1 : 0)],
      ['Total interest paid',
        money(snow.totalInterest), money(aval.totalInterest),
        minCell(function (r) { return money(r.totalInterest); }, 'Keeps growing'),
        Math.abs(snow.totalInterest - aval.totalInterest) < 0.5 ? -1 : (aval.totalInterest < snow.totalInterest ? 1 : 0)],
      ['Total amount paid',
        money(snow.totalPaid), money(aval.totalPaid),
        minCell(function (r) { return money(r.totalPaid); }, '—'),
        Math.abs(snow.totalPaid - aval.totalPaid) < 0.5 ? -1 : (aval.totalPaid < snow.totalPaid ? 1 : 0)],
      ['First debt eliminated',
        snow.payoffOrder.length ? esc(snow.payoffOrder[0].name) + ' — ' + fmtMonth(snow.payoffOrder[0].month) : '—',
        aval.payoffOrder.length ? esc(aval.payoffOrder[0].name) + ' — ' + fmtMonth(aval.payoffOrder[0].month) : '—',
        min.payoffOrder.length ? esc(min.payoffOrder[0].name) + ' — ' + fmtMonth(min.payoffOrder[0].month) : '—',
        (snow.payoffOrder.length && aval.payoffOrder.length)
          ? (snow.payoffOrder[0].month === aval.payoffOrder[0].month ? -1
            : (snow.payoffOrder[0].month < aval.payoffOrder[0].month ? 0 : 1)) : -1]
    ];
    return '<table class="metric-table"><thead><tr><th></th>' +
      '<th><span class="metric-head"><span class="swatch" style="background:' + seriesColor('snowball') + '"></span>❄️ Snowball</span></th>' +
      '<th><span class="metric-head"><span class="swatch" style="background:' + seriesColor('avalanche') + '"></span>⛰ Avalanche</span></th>' +
      '<th><span class="metric-head"><span class="swatch" style="background:' + seriesColor('minimum') + '"></span>🐢 Minimums only</span></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        // r[4]: which column is best — 0 snowball, 1 avalanche, -1 tie/none
        return '<tr><td>' + r[0] + '</td>' +
          '<td' + (r[4] === 0 ? ' class="best"' : '') + '>' + r[1] + '</td>' +
          '<td' + (r[4] === 1 ? ' class="best"' : '') + '>' + r[2] + '</td>' +
          '<td>' + r[3] + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ---------------- CSV export ---------------- */

  function downloadCsv(run) {
    var names = run.debtIds.map(function (id) {
      return (run.perDebt[id] ? run.perDebt[id].name : id);
    });
    var head = ['Payment #', 'Month', 'Total payment', 'Interest', 'Principal', 'Total balance']
      .concat(names.map(function (n) { return n + ' balance'; }));
    var lines = [head.map(csvCell).join(',')];
    run.months.forEach(function (m) {
      var row = [m.m, fmtMonth(m.m), m.payment.toFixed(2), m.interest.toFixed(2),
        m.principal.toFixed(2), m.totalBalance.toFixed(2)]
        .concat(run.debtIds.map(function (id) {
          return (m.balances[id] != null ? m.balances[id] : 0).toFixed(2);
        }));
      lines.push(row.map(csvCell).join(','));
    });
    lines.push('');
    lines.push(csvCell('Totals') + ',,' + run.totalPaid.toFixed(2) + ',' +
      run.totalInterest.toFixed(2) + ',' + (run.totalPaid - run.totalInterest).toFixed(2) + ',0');

    var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'debt-payoff-' + run.strategy + '-schedule.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function csvCell(v) {
    v = String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  /* ---------------- boot ---------------- */

  if (!load()) {
    // first visit: show a filled-in example so the tool demos itself
    state.debts = SAMPLE_DEBTS.map(newDebt);
  }
  renderDebtRows();
  syncPlanInputs();
  setTab(activeTab);
  recalc();

  // keep charts crisp when the viewport changes
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (lastResults) recalc(); }, 200);
  });
})();
