/*
 * Debt payoff simulation engine.
 * Runs a month-by-month amortization for a set of debts under a chosen
 * payoff strategy. Works in the browser (window.DebtEngine) and in Node
 * (module.exports) so the math can be unit-tested headlessly.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DebtEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_MONTHS = 1200; // 100-year safety cap
  var EPS = 0.005;       // balances below half a cent count as paid

  /**
   * Order the open debts by strategy priority.
   * snowball  – smallest balance first (tie: higher APR first)
   * avalanche – highest APR first (tie: smaller balance first)
   */
  function priorityOrder(debts, strategy) {
    var open = debts.filter(function (d) { return d.bal > EPS; });
    if (strategy === 'snowball') {
      open.sort(function (a, b) { return (a.bal - b.bal) || (b.apr - a.apr) || (a.idx - b.idx); });
    } else if (strategy === 'avalanche') {
      open.sort(function (a, b) { return (b.apr - a.apr) || (a.bal - b.bal) || (a.idx - b.idx); });
    }
    return open;
  }

  /**
   * Simulate one payoff plan.
   *
   * debts: [{ id, name, balance, apr, minPayment }]
   * strategy: 'snowball' | 'avalanche' | 'minimum'
   * opts: {
   *   extraMonthly:  extra recurring payment applied every month (default 0)
   *   oneTimeAmount: single lump-sum payment (default 0)
   *   oneTimeMonth:  1-based month the lump sum lands in (default 1)
   *   rollover:      keep total monthly budget constant after payoffs (default true)
   * }
   */
  function simulate(debts, strategy, opts) {
    opts = opts || {};
    var extraMonthly = +opts.extraMonthly || 0;
    var oneTimeAmount = +opts.oneTimeAmount || 0;
    var oneTimeMonth = Math.max(1, Math.round(+opts.oneTimeMonth || 1));
    var rollover = opts.rollover !== false;

    var state = debts.map(function (d, i) {
      return {
        id: d.id, idx: i, name: d.name,
        bal: +d.balance || 0,
        apr: +d.apr || 0,
        min: +d.minPayment || 0,
        interestPaid: 0, totalPaid: 0, payoffMonth: null
      };
    }).filter(function (d) { return d.bal > EPS; });

    var startBalance = state.reduce(function (s, d) { return s + d.bal; }, 0);
    var totalMinBudget = state.reduce(function (s, d) { return s + d.min; }, 0);

    var result = {
      strategy: strategy,
      startBalance: startBalance,
      months: [],
      payoffOrder: [],
      perDebt: {},
      totalInterest: 0,
      totalPaid: 0,
      monthsToPayoff: 0,
      neverPayoff: false,
      debtIds: state.map(function (d) { return d.id; })
    };
    if (!state.length) return result;

    var month = 0;
    while (state.some(function (d) { return d.bal > EPS; }) && month < MAX_MONTHS) {
      month++;
      var snapshot = {
        m: month, interest: 0, principal: 0, payment: 0,
        totalBalance: 0, balances: {}, payments: {}, focusId: null, paidOff: []
      };

      // 1. Accrue this month's interest on every open balance.
      state.forEach(function (d) {
        if (d.bal > EPS) {
          var i = d.bal * d.apr / 1200;
          d.bal += i;
          d.interestPaid += i;
          snapshot.interest += i;
        }
      });

      // 2. Determine this month's budget.
      var open = state.filter(function (d) { return d.bal > EPS; });
      var activeMins = open.reduce(function (s, d) { return s + Math.min(d.min, d.bal); }, 0);
      var budget;
      if (strategy === 'minimum') {
        budget = activeMins; // baseline: minimums only, nothing rolls over
      } else if (rollover) {
        budget = totalMinBudget + extraMonthly; // freed minimums stay in the plan
      } else {
        budget = open.reduce(function (s, d) { return s + d.min; }, 0) + extraMonthly;
      }
      if (oneTimeAmount > 0 && month === oneTimeMonth && strategy !== 'minimum') {
        budget += oneTimeAmount;
      }

      // 3. Pay every open debt its minimum first.
      open.forEach(function (d) {
        var p = Math.min(d.min, d.bal, budget);
        d.bal -= p;
        d.totalPaid += p;
        budget -= p;
        snapshot.payments[d.id] = (snapshot.payments[d.id] || 0) + p;
        snapshot.payment += p;
      });

      // 4. Send everything left at the strategy's target debt,
      //    cascading to the next target when one is wiped out mid-month.
      if (strategy !== 'minimum' && budget > EPS) {
        var targets = priorityOrder(state, strategy);
        if (targets.length) snapshot.focusId = targets[0].id;
        for (var t = 0; t < targets.length && budget > EPS; t++) {
          var d = targets[t];
          if (d.bal <= EPS) continue;
          var p = Math.min(budget, d.bal);
          d.bal -= p;
          d.totalPaid += p;
          budget -= p;
          snapshot.payments[d.id] = (snapshot.payments[d.id] || 0) + p;
          snapshot.payment += p;
        }
      }

      // 5. Record payoffs and month totals.
      state.forEach(function (d) {
        if (d.bal <= EPS && d.payoffMonth === null) {
          d.bal = 0;
          d.payoffMonth = month;
          snapshot.paidOff.push(d.id);
          result.payoffOrder.push({
            id: d.id, name: d.name, month: month,
            interestPaid: d.interestPaid, totalPaid: d.totalPaid
          });
        }
        snapshot.balances[d.id] = d.bal;
        snapshot.totalBalance += d.bal;
      });
      snapshot.principal = snapshot.payment - snapshot.interest;
      result.totalInterest += snapshot.interest;
      result.totalPaid += snapshot.payment;
      result.months.push(snapshot);

      // Stall guard: if the balance is not shrinking, payments can't
      // outrun interest and the plan never finishes.
      var prevTotal = result.months.length > 1
        ? result.months[result.months.length - 2].totalBalance
        : startBalance;
      if (snapshot.totalBalance >= prevTotal - 0.01 && snapshot.totalBalance > EPS) {
        result.neverPayoff = true;
        break;
      }
    }

    if (month >= MAX_MONTHS && state.some(function (d) { return d.bal > EPS; })) {
      result.neverPayoff = true;
    }
    result.monthsToPayoff = result.neverPayoff ? null : month;
    state.forEach(function (d) {
      result.perDebt[d.id] = {
        name: d.name, payoffMonth: d.payoffMonth,
        interestPaid: d.interestPaid, totalPaid: d.totalPaid
      };
    });
    return result;
  }

  /** Run all three plans over the same debts so views stay in sync. */
  function compare(debts, opts) {
    return {
      snowball: simulate(debts, 'snowball', opts),
      avalanche: simulate(debts, 'avalanche', opts),
      minimum: simulate(debts, 'minimum', opts)
    };
  }

  /** Per-debt sanity warnings (e.g. minimum payment below monthly interest). */
  function validateDebts(debts) {
    var warnings = [];
    debts.forEach(function (d) {
      var monthlyInterest = (+d.balance || 0) * (+d.apr || 0) / 1200;
      if ((+d.minPayment || 0) <= monthlyInterest && (+d.balance || 0) > 0 && (+d.apr || 0) > 0) {
        warnings.push({
          id: d.id,
          message: '"' + d.name + '": the minimum payment does not cover its monthly interest (' +
            '~$' + monthlyInterest.toFixed(2) + '/mo). On minimum payments alone this balance grows instead of shrinking.'
        });
      }
    });
    return warnings;
  }

  return {
    simulate: simulate,
    compare: compare,
    validateDebts: validateDebts,
    MAX_MONTHS: MAX_MONTHS
  };
});
