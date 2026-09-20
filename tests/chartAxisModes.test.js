const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../public/homeDataLoader.js'), 'utf8');
const start = source.indexOf('  const N = Math.max(1, visibleSeriesList[0].data.length);');
const end = source.indexOf('  const yFor =', start);

function axisFor(checked, times) {
  assert.ok(start >= 0 && end > start, 'Chart axis code must be present');
  const context = {
    visibleSeriesList: [{ data: times.map((time) => ({ time, value: 1 })) }],
    padding: { left: 0 },
    plotWidth: 100,
    qs: () => ({ checked }),
    SELECTORS: { chartShowGaps: '#chart-show-gaps' },
  };
  return vm.runInNewContext(`${source.slice(start, end)}\n({ xFor, hasLargeTimeGap, useTimeAxis })`, context);
}

const day = 24 * 60 * 60 * 1000;
const points = [Date.UTC(2026, 6, 13), Date.UTC(2026, 6, 14), Date.UTC(2026, 8, 20)];

test('checked: positions use actual elapsed time and long gaps break lines', () => {
  const axis = axisFor(true, points);
  assert.equal(axis.useTimeAxis, true);
  assert.ok(axis.xFor(1) < 5, 'one day must be close to the first point');
  assert.equal(axis.xFor(2), 100);
  assert.equal(axis.hasLargeTimeGap(0, 1), false);
  assert.equal(axis.hasLargeTimeGap(1, 2), true);
});

test('unchecked: compact mode uses equally spaced samples and connects gaps', () => {
  const axis = axisFor(false, points);
  assert.equal(axis.useTimeAxis, false);
  assert.equal(axis.xFor(0), 0);
  assert.equal(axis.xFor(1), 50);
  assert.equal(axis.xFor(2), 100);
  assert.equal(axis.hasLargeTimeGap(1, 2), false);
});

test('checked: a normal weekend remains connected; a five-day gap does not', () => {
  const axis = axisFor(true, [0, 3 * day, 8 * day]);
  assert.equal(axis.hasLargeTimeGap(0, 1), false);
  assert.equal(axis.hasLargeTimeGap(1, 2), true);
});

test('toggle is enabled by default and is wired to redraw the cached series', () => {
  const html = fs.readFileSync(path.join(__dirname, '../views/index.html'), 'utf8');
  assert.match(html, /id="chart-show-gaps"[^>]*type="checkbox"[^>]*checked/);
  assert.match(source, /gapToggle\.addEventListener\('change',[\s\S]*?drawRangeChart\(chartLastSeries, chartLastPair\)/);
});
