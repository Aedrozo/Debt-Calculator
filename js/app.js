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
      // Keep the plan current as time passes: a saved start month that is
      // now in the past rolls forward to this month, so every date on the
      // page (and in saved game plans) stays fresh on each visit.
      // "YYYY-MM" strings compare correctly as text.
      if (state.startMonth < defaultStartMonth()) {
        state.startMonth = defaultStartMonth();
      }
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

  /** Emoji wrapped so print CSS can drop them — emoji glyphs print
      unreliably (missing/monochrome on many printers). */
  function emo(icon) {
    return '<span class="emoji" aria-hidden="true">' + icon + ' </span>';
  }

  /** Color swatch as inline SVG: backgrounds are often skipped by printers,
      SVG fills always print. */
  function swatch(color) {
    return '<svg class="swatch" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">' +
      '<rect width="12" height="12" rx="3" fill="' + color + '"/></svg>';
  }

  /* ---------------- debt inputs ---------------- */

  var debtRowsEl = document.getElementById('debt-rows');

  /* Formatted numeric fields: values display as "$8,500" or "24.99%", but
     while a field is focused it shows the plain number for easy editing. */

  function parseNumStr(s) {
    var cleaned = String(s == null ? '' : s).replace(/[^0-9.]/g, '');
    if (cleaned === '') return '';
    var n = parseFloat(cleaned);
    return isNaN(n) ? '' : String(n);
  }

  function fmtInputMoney(v) {
    var n = parseFloat(v);
    if (v === '' || v == null || isNaN(n)) return '';
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function fmtInputPct(v) {
    var n = parseFloat(v);
    if (v === '' || v == null || isNaN(n)) return '';
    return n.toLocaleString('en-US', { maximumFractionDigits: 3 }) + '%';
  }

  var FIELD_FORMATS = { money: fmtInputMoney, pct: fmtInputPct };

  function renderDebtRows() {
    debtRowsEl.innerHTML = state.debts.map(function (d) {
      var typeOpts = DEBT_TYPES.map(function (t) {
        return '<option' + (t === d.type ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
      return '<tr data-id="' + d.id + '">' +
        '<td class="col-name"><input type="text" data-field="name" value="' + esc(d.name) + '" placeholder="e.g. Visa card" aria-label="Debt name"></td>' +
        '<td class="col-type"><select data-field="type" aria-label="Debt type">' + typeOpts + '</select></td>' +
        '<td><input type="text" data-field="balance" data-format="money" value="' + esc(fmtInputMoney(d.balance)) + '" placeholder="$0" inputmode="decimal" autocomplete="off" aria-label="Current balance in dollars"></td>' +
        '<td><input type="text" data-field="apr" data-format="pct" value="' + esc(fmtInputPct(d.apr)) + '" placeholder="0%" inputmode="decimal" autocomplete="off" aria-label="Annual interest rate percent"></td>' +
        '<td><input type="text" data-field="minPayment" data-format="money" value="' + esc(fmtInputMoney(d.minPayment)) + '" placeholder="$0" inputmode="decimal" autocomplete="off" aria-label="Minimum monthly payment in dollars"></td>' +
        '<td><button type="button" class="remove-debt" title="Remove this debt" aria-label="Remove ' + esc(d.name || 'debt') + '">✕</button></td>' +
        '</tr>';
    }).join('');
  }

  function debtForRow(el) {
    var tr = el.closest('tr');
    if (!tr) return null;
    return state.debts.find(function (d) { return d.id === tr.getAttribute('data-id'); }) || null;
  }

  debtRowsEl.addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-field');
    var debt = debtForRow(e.target);
    if (!field || !debt) return;
    debt[field] = e.target.getAttribute('data-format')
      ? parseNumStr(e.target.value)
      : e.target.value;
    scheduleRecalc();
  });

  // focused: show the raw number; blurred: show it formatted
  debtRowsEl.addEventListener('focusin', function (e) {
    var format = e.target.getAttribute('data-format');
    var debt = debtForRow(e.target);
    if (!format || !debt) return;
    e.target.value = debt[e.target.getAttribute('data-field')] || '';
    e.target.select();
  });

  debtRowsEl.addEventListener('focusout', function (e) {
    var format = e.target.getAttribute('data-format');
    var debt = debtForRow(e.target);
    if (!format || !debt) return;
    e.target.value = FIELD_FORMATS[format](debt[e.target.getAttribute('data-field')]);
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

  var extraEl = bindPlanInput('extra-monthly', 'extraMonthly', function (v) { return Math.max(0, +parseNumStr(v) || 0); });
  var oneAmtEl = bindPlanInput('onetime-amount', 'oneTimeAmount', function (v) { return Math.max(0, +parseNumStr(v) || 0); });

  // plan money fields show grouped digits ("1,250") beside their $ prefix,
  // and the plain number while being edited
  function wirePlanMoneyField(el, key) {
    el.addEventListener('focus', function () {
      el.value = state[key] ? String(state[key]) : '';
      el.select();
    });
    el.addEventListener('blur', function () {
      el.value = state[key] ? state[key].toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
    });
  }
  wirePlanMoneyField(extraEl, 'extraMonthly');
  wirePlanMoneyField(oneAmtEl, 'oneTimeAmount');
  var oneMonthEl = bindPlanInput('onetime-month', 'oneTimeMonth', function (v) { return Math.max(1, +v || 1); });
  var startEl = document.getElementById('start-month');
  startEl.addEventListener('change', function () {
    if (startEl.value) state.startMonth = startEl.value;
    fillOneTimeMonths();
    scheduleRecalc();
  });

  /** Start-month dropdown: this month plus the next 23, so nobody has to
      type a date. A persisted month outside that window stays selectable. */
  function fillStartMonths() {
    var base = defaultStartMonth().split('-');
    var options = [];
    for (var i = 0; i < 24; i++) {
      var d = new Date(+base[0], +base[1] - 1 + i, 1);
      var val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      options.push(val);
    }
    if (options.indexOf(state.startMonth) === -1) {
      options.push(state.startMonth);
      options.sort();
    }
    startEl.innerHTML = options.map(function (val) {
      var parts = val.split('-');
      var label = MONTHS_LONG[+parts[1] - 1] + ' ' + parts[0];
      return '<option value="' + val + '"' + (val === state.startMonth ? ' selected' : '') + '>' +
        label + '</option>';
    }).join('');
  }
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
    extraEl.value = state.extraMonthly.toLocaleString('en-US', { maximumFractionDigits: 2 });
    oneAmtEl.value = state.oneTimeAmount.toLocaleString('en-US', { maximumFractionDigits: 2 });
    fillStartMonths();
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

  // arrow-key navigation between tabs
  document.querySelector('.tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    var i = TABS.indexOf(activeTab);
    var next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next);
    document.getElementById('tab-' + next).focus();
  });

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
      budgetEl.innerHTML = 'Add your debts below to see your plan.';
    }

    // warnings
    var warnEl = document.getElementById('debt-warnings');
    warnEl.innerHTML = DebtEngine.validateDebts(debts)
      .map(function (w) { return '<p>' + emo('⚠️') + esc(w.message) + '</p>'; }).join('');

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
      return '<span class="item">' + swatch(seriesColor(m)) + METHOD_META[m].label + '</span>';
    }).join('') + '</div>';
  }

  function renderStrategyPanel(method, results) {
    var run = results[method];
    var min = results.minimum;
    var meta = METHOD_META[method];
    var panel = document.getElementById('panel-' + method);
    var saved = savingsVsMinimum(run, min);

    var html = '<p class="strategy-blurb">' + emo(meta.icon) + meta.blurb + '</p>';

    if (run.neverPayoff) {
      html += '<div class="warnings"><p>' + emo('⚠️') + 'With the current payments, this plan never pays off — your ' +
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
    html += '<div class="panel-section schedule-section"><h3>Month-by-month payment schedule</h3>' +
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
        return esc(run.perDebt[id] ? run.perDebt[id].name : id) + ' paid off! ' + emo('🎉');
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
      html += '<div class="warnings"><p>' + emo('⚠️') + 'With the current payments, these plans never pay off — your ' +
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
      '<th>Order</th><th>' + emo('❄️') + 'Snowball pays off…</th><th>' + emo('⛰') + 'Avalanche pays off…</th>' +
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
      '<h3>' + swatch(seriesColor(method)) + emo(meta.icon) + meta.label + '</h3>' +
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
      (never ? '<div class="row"><span>' + emo('⚠️') + 'Minimum payments never catch up with interest here.</span></div>' : '') +
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
      '<th><span class="metric-head">' + swatch(seriesColor('snowball')) + emo('❄️') + 'Snowball</span></th>' +
      '<th><span class="metric-head">' + swatch(seriesColor('avalanche')) + emo('⛰') + 'Avalanche</span></th>' +
      '<th><span class="metric-head">' + swatch(seriesColor('minimum')) + emo('🐢') + 'Minimums only</span></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        // r[4]: which column is best — 0 snowball, 1 avalanche, -1 tie/none
        return '<tr><td>' + r[0] + '</td>' +
          '<td' + (r[4] === 0 ? ' class="best"' : '') + '>' + r[1] + '</td>' +
          '<td' + (r[4] === 1 ? ' class="best"' : '') + '>' + r[2] + '</td>' +
          '<td>' + r[3] + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ---------------- game plan ---------------- */

  /* Official lockup art, inlined as a data URI so saved and printed plans
     carry the exact brand image even opened offline later. If the fetch
     fails (page opened straight from disk), an SVG recreation stands in. */
  var brandLogoDataUri = null;
  try {
    if (location.protocol === 'file:') throw new Error('no fetch from disk');
    fetch('assets/gem-neo-collab-light.png?v=3').then(function (r) {
      return r.ok ? r.blob() : Promise.reject(new Error('http ' + r.status));
    }).then(function (blob) {
      var fr = new FileReader();
      fr.onload = function () { brandLogoDataUri = fr.result; };
      fr.readAsDataURL(blob);
    }).catch(function () { /* SVG fallback used */ });
  } catch (e) { /* SVG fallback used */ }

  var gpModal = document.getElementById('gameplan-modal');
  var gpBody = document.getElementById('gp-body');
  var gpBodyHtml = gpBody.innerHTML; // pristine form, restored on each open

  document.getElementById('gameplan-btn').addEventListener('click', openGamePlan);
  gpModal.addEventListener('click', function (e) {
    if (e.target === gpModal || e.target.id === 'gp-close' || e.target.closest('#gp-close')) closeGamePlan();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !gpModal.hidden) closeGamePlan();
  });

  function closeGamePlan() { gpModal.hidden = true; }

  function openGamePlan() {
    gpBody.innerHTML = gpBodyHtml;
    gpModal.hidden = false;

    if (!lastResults || !cleanDebts().length) {
      gpBody.innerHTML = '<p class="gp-empty">Add your debts in step 2 first — then come back and ' +
        'we’ll turn your numbers into a step-by-step game plan you can save.</p>';
      return;
    }
    var snow = lastResults.snowball, aval = lastResults.avalanche;
    if (snow.neverPayoff || aval.neverPayoff) {
      gpBody.innerHTML = '<p class="gp-empty">⚠️ With the current payments, this plan never pays off — ' +
        'your payments don’t keep up with interest. Increase the extra monthly payment in step 2, ' +
        'then save your game plan.</p>';
      return;
    }

    // Recommend the cheaper method; on a tie, snowball (motivation wins ties).
    var iDiff = snow.totalInterest - aval.totalInterest;
    var recommended = iDiff > 0.5 ? 'avalanche' : 'snowball';
    var badge = '<span class="gp-badge">RECOMMENDED</span>';
    document.querySelector('#gp-method-' + recommended + ' strong').insertAdjacentHTML('beforeend', badge);
    var radio = document.querySelector('#gp-method-' + recommended + ' input');
    radio.checked = true;
    updateGpSummary();

    Array.prototype.forEach.call(document.querySelectorAll('input[name="gp-method"]'), function (r) {
      r.addEventListener('change', updateGpSummary);
    });
    document.getElementById('gp-print').addEventListener('click', function () { emitGamePlan('print'); });
    document.getElementById('gp-download').addEventListener('click', function () { emitGamePlan('download'); });
  }

  function chosenGpMethod() {
    var r = document.querySelector('input[name="gp-method"]:checked');
    return r ? r.value : 'snowball';
  }

  function updateGpSummary() {
    var run = lastResults[chosenGpMethod()];
    var saved = savingsVsMinimum(run, lastResults.minimum);
    document.getElementById('gp-summary').innerHTML =
      'Debt-free <strong>' + fmtMonthLong(run.monthsToPayoff) + '</strong> · ' +
      money(run.totalInterest) + ' total interest' +
      (saved.interest != null
        ? ' · saves <strong>' + money(saved.interest) + '</strong> and <strong>' +
          fmtDuration(saved.months) + '</strong> vs. minimum payments'
        : '');
  }

  function emitGamePlan(mode) {
    var method = chosenGpMethod();
    var clientName = String(document.getElementById('gp-client-name').value || '').trim();
    var html = buildGamePlanHtml(method, clientName);
    if (mode === 'download') {
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my-debt-free-game-plan.html';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } else {
      var w = window.open('', '_blank');
      if (!w) { alert('Please allow pop-ups to print your game plan, or use “Download the plan” instead.'); return; }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(function () { try { w.print(); } catch (e) { /* user can print manually */ } }, 400);
    }
  }

  /** Self-contained branded HTML document — safe to save, email, or print. */
  function buildGamePlanHtml(method, clientName) {
    var debts = cleanDebts();
    var run = lastResults[method];
    var min = lastResults.minimum;
    var meta = METHOD_META[method];
    var saved = savingsVsMinimum(run, min);
    var totalBal = debts.reduce(function (s, d) { return s + d.balance; }, 0);
    var totalMin = debts.reduce(function (s, d) { return s + d.minPayment; }, 0);
    var budget = totalMin + state.extraMonthly;
    var byId = {};
    debts.forEach(function (d) { byId[d.id] = d; });

    var logo = brandLogoDataUri
      ? '<div class="lockup"><img src="' + brandLogoDataUri + '" ' +
        'alt="Gem Home Team Mortgage Lending × NEO Home Loans, powered by Better" ' +
        'style="width:100%;max-width:470px;height:auto;display:block"></div>'
      : '<div class="lockup">' +
        '<div class="gem"><svg viewBox="0 0 100 100" width="46" height="46" aria-hidden="true">' +
        '<path d="M50 10 L7 47 L20 47 L20 86 Q20 92 26 92 L74 92 Q80 92 80 86 L80 47 L93 47 Z" fill="#16323f" stroke="#16323f" stroke-width="6" stroke-linejoin="round"/>' +
        '<rect x="41.5" y="58.5" width="17" height="17" rx="3" transform="rotate(45 50 67)" fill="#3fb3e5"/></svg>' +
        '<div><div class="gname">GEM HOME TEAM</div><div class="gtag">MORTGAGE LENDING</div></div></div>' +
        '<span class="lx">×</span>' +
        '<div class="neo"><svg viewBox="0 0 100 100" width="40" height="40" aria-hidden="true">' +
        '<path d="M50 4 L87 25 Q90 27 90 31 L90 69 Q90 73 87 75 L50 96 L13 75 Q10 73 10 69 L10 31 Q10 27 13 25 Z" fill="#15222c"/>' +
        '<path d="M24 32 L58 50 L24 68 Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>' +
        '<path d="M76 32 L42 50 L76 68 Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/></svg>' +
        '<div><div class="nname">NEO</div><div class="ntag">HOME LOANS</div><div class="npow">powered by <b>Better</b></div></div></div>' +
        '</div>';

    // Milestones: one step per debt in payoff order, with the money aimed at it.
    var rolled = 0;
    var steps = run.payoffOrder.map(function (p, i) {
      var d = byId[p.id] || { minPayment: 0, balance: 0, apr: 0 };
      var attack = state.rollover ? (d.minPayment + state.extraMonthly + rolled) : (d.minPayment + state.extraMonthly);
      rolled += d.minPayment;
      var next = run.payoffOrder[i + 1];
      return '<div class="step">' +
        '<div class="step-check"><span class="cbox"></span></div>' +
        '<div class="step-body">' +
        '<div class="step-title">Target #' + (i + 1) + ': <strong>' + esc(p.name) + '</strong>' +
        '<span class="step-date">paid off ' + fmtMonth(p.month) + '</span></div>' +
        '<div class="step-detail">' + money(d.balance) + ' at ' + d.apr + '% APR — aim about <strong>' +
        money(Math.round(attack)) + '/mo</strong> at this debt while paying minimums on the rest.' +
        (next
          ? (state.rollover
            ? ' When it’s gone, roll its ' + money(d.minPayment) + '/mo into <strong>' + esc(next.name) + '</strong>.'
            : ' Then move on to <strong>' + esc(next.name) + '</strong>.')
          : ' This is your last debt — pay it off and you’re <strong>DEBT-FREE!</strong>') +
        '</div></div></div>';
    }).join('');

    var oneTimeNote = state.oneTimeAmount > 0
      ? '<li>Your plan includes a one-time extra payment of <strong>' + money(state.oneTimeAmount) +
        '</strong> in ' + fmtMonthLong(state.oneTimeMonth) + ' — when it arrives, send all of it at your current target debt.</li>'
      : '';

    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>My Debt-Free Game Plan — Gem Home Team</title><style>' +
      'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#16242e;margin:0;background:#fff;line-height:1.55}' +
      '.page{max-width:760px;margin:0 auto;padding:36px 28px}' +
      '.lockup{display:flex;align-items:center;gap:22px;flex-wrap:wrap;padding-bottom:18px;border-bottom:2px solid #e2e7ea}' +
      '.gem,.neo{display:flex;align-items:center;gap:10px}' +
      '.gname{font-weight:800;font-size:19px;color:#1d3543;letter-spacing:.02em}' +
      '.gtag{font-size:9px;font-weight:600;color:#3fb3e5;letter-spacing:.4em}' +
      '.lx{color:#3fb3e5;font-size:18px;font-weight:600}' +
      '.nname{font-weight:800;font-size:17px;color:#15222c;letter-spacing:.14em;line-height:1}' +
      '.ntag{font-size:8px;font-weight:600;color:#15222c;letter-spacing:.32em}' +
      '.npow{font-size:10px;color:#15222c}' +
      'h1{font-size:27px;color:#1d3543;margin:26px 0 2px}' +
      '.sub{color:#4d5e69;margin:0 0 22px}' +
      '.hero{background:#e3f4fc;border-radius:12px;padding:18px 22px;margin:0 0 22px;display:flex;gap:26px;flex-wrap:wrap}' +
      '.hero div{min-width:130px}.hero .lab{font-size:11px;font-weight:600;color:#4d5e69;text-transform:uppercase;letter-spacing:.05em}' +
      '.hero .val{font-size:21px;font-weight:800;color:#1d3543}.hero .good{color:#0c7a3c}' +
      'h2{font-size:17px;color:#1d3543;margin:26px 0 10px}' +
      'table{width:100%;border-collapse:collapse;font-size:13.5px}' +
      'th,td{padding:7px 10px;border-bottom:1px solid #e2e7ea;text-align:right}' +
      'th:first-child,td:first-child{text-align:left}' +
      'thead th{font-size:11px;color:#8a949b;text-transform:uppercase;letter-spacing:.05em}' +
      'ol.rules{padding-left:20px;margin:0}ol.rules li{margin-bottom:8px}' +
      '.step{display:flex;gap:12px;border-left:3px solid #3fb3e5;background:#f6f8f9;border-radius:0 10px 10px 0;padding:12px 16px;margin-bottom:10px;page-break-inside:avoid}' +
      '.step-check .cbox{display:inline-block;width:15px;height:15px;border:2px solid #1d3543;border-radius:4px;margin-top:3px}' +
      '.step-title{font-size:15px}.step-date{float:right;color:#0c7a3c;font-weight:700;font-size:13px}' +
      '.step-detail{font-size:13.5px;color:#4d5e69;margin-top:2px}' +
      'ul.tips{padding-left:20px;margin:0}ul.tips li{margin-bottom:7px;font-size:14px}' +
      '.foot{margin-top:30px;padding-top:14px;border-top:2px solid #e2e7ea;font-size:11px;color:#8a949b}' +
      // Print hygiene: real page margins, keep the brand tints when the browser
      // allows background printing (all text is dark, so the document stays
      // fully legible even when backgrounds are skipped).
      '@page{margin:16mm}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '@media print{.page{padding:12px 0;max-width:none}.hero,.step{border:1px solid #e2e7ea}}' +
      '</style></head><body><div class="page">' +
      logo +
      '<h1>My Debt-Free Game Plan</h1>' +
      '<p class="sub">' + (clientName ? 'Prepared for <strong>' + esc(clientName) + '</strong> · ' : '') +
      'The ' + meta.label + ' method · Created ' + MONTHS_LONG[new Date().getMonth()] + ' ' +
      new Date().getDate() + ', ' + new Date().getFullYear() + ' with the Gem Home Team Debt Payoff Calculator</p>' +

      '<div class="hero">' +
      '<div><div class="lab">Debt-free date</div><div class="val">' + fmtMonthLong(run.monthsToPayoff) + '</div></div>' +
      '<div><div class="lab">Total debt today</div><div class="val">' + money(totalBal) + '</div></div>' +
      '<div><div class="lab">Monthly commitment</div><div class="val">' + money(budget) + '</div></div>' +
      (saved.interest != null
        ? '<div><div class="lab">You save</div><div class="val good">' + money(saved.interest) + '</div>' +
          '<div class="lab" style="text-transform:none;letter-spacing:0">+ ' + fmtDuration(saved.months) + ' sooner vs. minimums</div></div>'
        : '') +
      '</div>' +

      '<h2>The 3 rules of your plan</h2><ol class="rules">' +
      '<li><strong>Never miss a minimum.</strong> Pay the minimum on every debt, every month, on time.</li>' +
      '<li><strong>Attack one debt at a time.</strong> Send every extra dollar (' + money(state.extraMonthly) +
      '/mo in your plan) at your current target — ' +
      (method === 'snowball' ? 'the smallest balance' : 'the highest interest rate') + ' first.</li>' +
      '<li><strong>Never shrink your payment.</strong> When a debt is gone, keep paying the same ' +
      money(budget) + ' total every month — the freed-up money rolls onto the next target. That’s where the magic is.</li>' +
      '</ol>' +

      '<h2>Your debts (' + debts.length + ')</h2>' +
      '<table><thead><tr><th>Debt</th><th>Balance</th><th>APR</th><th>Minimum/mo</th></tr></thead><tbody>' +
      debts.map(function (d) {
        return '<tr><td>' + esc(d.name) + '</td><td>' + money(d.balance) + '</td><td>' +
          d.apr + '%</td><td>' + money(d.minPayment) + '</td></tr>';
      }).join('') +
      '<tr><td><strong>Total</strong></td><td><strong>' + money(totalBal) + '</strong></td><td></td><td><strong>' +
      money(totalMin) + '</strong></td></tr></tbody></table>' +

      '<h2>Your marching orders — check them off as you go</h2>' + steps +

      '<h2>Tips to stay on track</h2><ul class="tips">' +
      '<li><strong>Automate it.</strong> Set every minimum on autopay, plus an automatic ' +
      money(state.extraMonthly) + ' transfer to your target debt each payday.</li>' +
      oneTimeNote +
      '<li><strong>Windfalls go to the target.</strong> Tax refunds, bonuses, side income — every surprise dollar shortens this plan.</li>' +
      '<li><strong>Don’t add new debt.</strong> Pause the cards you’re paying off; one new swipe restarts the climb.</li>' +
      '<li><strong>Celebrate every milestone.</strong> Each checked box above is a real win — small (free) celebrations keep the streak alive.</li>' +
      '<li><strong>Ask about your bigger picture.</strong> If you own a home or plan to buy one, talk with the Gem Home Team — ' +
      'sometimes a refinance or consolidation changes this math entirely.</li>' +
      '</ul>' +

      '<div class="foot"><strong>GEM HOME TEAM × NEO HOME LOANS</strong> · Mortgage Lending · powered by Better<br>' +
      'This plan is an estimate for educational purposes only and is not financial advice. It assumes fixed rates, ' +
      'monthly compounding, and on-time payments; actual results vary with rate changes, fees, and payment timing.</div>' +
      '</div></body></html>';
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

    // BOM so Excel opens the file as UTF-8 (accented debt names stay intact)
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
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
