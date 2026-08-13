/*
 * Minimal dependency-free SVG line chart for the payoff timelines.
 * Renders remaining-balance-over-time series with a hover crosshair
 * and tooltip. Colors come in via each series definition.
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function fmtMoneyShort(v) {
    if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + Math.round(v / 1000) + 'k';
    return '$' + Math.round(v);
  }

  function fmtMoney(v) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  /** "nice" round step for the y grid */
  function niceStep(range, target) {
    var raw = range / target;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
    return step * mag;
  }

  /**
   * Draw a balance-over-time chart.
   * container: DOM node (emptied first)
   * series: [{ name, color, dash?, values: [balance at month 0..N] }]
   *   values[0] is the starting balance; index = months elapsed.
   * opts: { monthLabel: fn(monthIndex) -> 'Jan 2027', height? }
   */
  function lineChart(container, series, opts) {
    opts = opts || {};
    container.innerHTML = '';
    series = series.filter(function (s) { return s.values && s.values.length > 1; });
    if (!series.length) return;

    var W = 860, H = opts.height || 320;
    var pad = { top: 16, right: 26, bottom: 34, left: 56 };
    var iw = W - pad.left - pad.right, ih = H - pad.top - pad.bottom;

    var maxX = Math.max.apply(null, series.map(function (s) { return s.values.length - 1; }));
    var maxY = Math.max.apply(null, series.map(function (s) {
      return Math.max.apply(null, s.values);
    }));
    if (maxY <= 0) maxY = 1;
    var yStep = niceStep(maxY, 4);
    var yTop = Math.ceil(maxY / yStep) * yStep;

    var x = function (m) { return pad.left + (m / maxX) * iw; };
    var y = function (v) { return pad.top + ih - (v / yTop) * ih; };

    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': opts.ariaLabel || 'Remaining balance over time by payoff method'
    });
    svg.classList.add('chart-svg');

    // horizontal gridlines + y labels
    for (var gy = 0; gy <= yTop; gy += yStep) {
      svg.appendChild(el('line', {
        x1: pad.left, x2: pad.left + iw, y1: y(gy), y2: y(gy),
        'class': gy === 0 ? 'chart-baseline' : 'chart-grid'
      }));
      var lab = el('text', { x: pad.left - 8, y: y(gy) + 4, 'class': 'chart-tick', 'text-anchor': 'end' });
      lab.textContent = fmtMoneyShort(gy);
      svg.appendChild(lab);
    }

    // x labels: ~6 evenly spaced month marks
    var xTicks = Math.min(6, maxX);
    for (var i = 0; i <= xTicks; i++) {
      var m = Math.round((i / xTicks) * maxX);
      var tl = el('text', { x: x(m), y: pad.top + ih + 22, 'class': 'chart-tick', 'text-anchor': 'middle' });
      tl.textContent = opts.monthLabel ? opts.monthLabel(m) : ('Mo ' + m);
      svg.appendChild(tl);
    }

    // series lines; identity lives in the legend below the chart, and the
    // end dot marks where each plan hits $0 (its debt-free point)
    series.forEach(function (s) {
      var dAttr = s.values.map(function (v, m) {
        return (m ? 'L' : 'M') + x(m).toFixed(1) + ' ' + y(v).toFixed(1);
      }).join(' ');
      var path = el('path', {
        d: dAttr, fill: 'none', stroke: s.color, 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      });
      if (s.dash) path.setAttribute('stroke-dasharray', s.dash);
      svg.appendChild(path);
      svg.appendChild(el('circle', {
        cx: x(s.values.length - 1), cy: y(s.values[s.values.length - 1]),
        r: 3.5, fill: s.color
      }));
    });

    // hover layer: crosshair + tooltip
    var hover = el('g', { 'class': 'chart-hover', style: 'display:none' });
    var cross = el('line', { y1: pad.top, y2: pad.top + ih, 'class': 'chart-crosshair' });
    hover.appendChild(cross);
    var dots = series.map(function (s) {
      var c = el('circle', { r: 4.5, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 });
      hover.appendChild(c);
      return c;
    });
    svg.appendChild(hover);

    var tip = document.createElement('div');
    tip.className = 'chart-tooltip';
    tip.style.display = 'none';
    container.style.position = 'relative';
    container.appendChild(svg);
    container.appendChild(tip);

    var overlay = el('rect', {
      x: pad.left, y: pad.top, width: iw, height: ih, fill: 'transparent'
    });
    svg.appendChild(overlay);

    function onMove(evt) {
      var rect = svg.getBoundingClientRect();
      var clientX = (evt.touches ? evt.touches[0].clientX : evt.clientX);
      var px = (clientX - rect.left) * (W / rect.width);
      var m = Math.round(((px - pad.left) / iw) * maxX);
      m = Math.max(0, Math.min(maxX, m));
      var cx = x(m);
      hover.style.display = '';
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);

      var rows = '';
      series.forEach(function (s, si) {
        var has = m < s.values.length;
        var v = has ? s.values[m] : 0;
        dots[si].setAttribute('cx', cx);
        dots[si].setAttribute('cy', y(has ? v : 0));
        rows += '<div class="tip-row"><span class="tip-swatch" style="background:' + s.color + '"></span>' +
          '<span class="tip-name">' + s.name + '</span><span class="tip-val">' + fmtMoney(v) + '</span></div>';
      });
      tip.innerHTML = '<div class="tip-title">' +
        (opts.monthLabel ? opts.monthLabel(m) : 'Month ' + m) + '</div>' + rows;
      tip.style.display = 'block';
      var tipX = (cx / W) * rect.width;
      var flip = tipX > rect.width * 0.62;
      tip.style.left = flip ? 'auto' : (tipX + 14) + 'px';
      tip.style.right = flip ? (rect.width - tipX + 14) + 'px' : 'auto';
      tip.style.top = '18px';
    }
    function onLeave() {
      hover.style.display = 'none';
      tip.style.display = 'none';
    }
    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('touchstart', onMove, { passive: true });
    overlay.addEventListener('touchmove', onMove, { passive: true });
    overlay.addEventListener('mouseleave', onLeave);
    overlay.addEventListener('touchend', onLeave);
  }

  root.Charts = { lineChart: lineChart };
})(typeof self !== 'undefined' ? self : this);
