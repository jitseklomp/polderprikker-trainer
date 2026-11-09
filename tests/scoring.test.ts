import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreForDistance, formatKm, verdict } from '../src/scoring.ts';
import { measure, haversineKm, type TargetGeometry } from '../src/geo.ts';

test('area curve: flat top, half at 15 km', () => {
  assert.equal(scoreForDistance(0), 1000);
  assert.equal(scoreForDistance(0.5), 1000);
  assert.equal(scoreForDistance(2), 994);
  assert.equal(scoreForDistance(5), 940);
  assert.equal(scoreForDistance(10), 734);
  assert.equal(scoreForDistance(15), 500);
  assert.equal(scoreForDistance(50), 47);
});

test('point curve: drops right away, half at 8 km', () => {
  assert.equal(scoreForDistance(0, 'point'), 1000);
  assert.equal(scoreForDistance(0.04, 'point'), 1000);
  assert.ok(scoreForDistance(0.695, 'point') < 1000, '695 m from a station is not perfect');
  assert.equal(scoreForDistance(0.7, 'point'), 975);
  assert.equal(scoreForDistance(2, 'point'), 889);
  assert.equal(scoreForDistance(8, 'point'), 500);
  assert.equal(scoreForDistance(50, 'point'), 60);
});

test('both curves never increase with distance', () => {
  for (const kind of ['area', 'point'] as const) {
    let prev = 1001;
    for (let d = 0; d <= 200; d += 0.05) {
      const s = scoreForDistance(d, kind);
      assert.ok(s <= prev, `${kind} not monotonic at ${d}`);
      prev = s;
    }
  }
});

test('verdict is based on distance and target kind', () => {
  assert.equal(verdict(0), 'Midden in de roos');
  assert.equal(verdict(0.3), 'Midden in de roos');
  assert.equal(verdict(0.3, 'point'), 'Heel dichtbij');
  assert.equal(verdict(0.05, 'point'), 'Midden in de roos');
  assert.equal(verdict(12), 'In de buurt');
  assert.equal(verdict(80), 'Ver mis');
});

test('haversine Amsterdam - Utrecht is about 35 km', () => {
  const d = haversineKm([4.9003, 52.3789], [5.1101, 52.0894]);
  assert.ok(d > 34 && d < 36, String(d));
});

const square: TargetGeometry = {
  type: 'Polygon',
  coordinates: [[[5, 52], [5.1, 52], [5.1, 52.1], [5, 52.1], [5, 52]]],
};

test('pin inside polygon scores zero distance', () => {
  const m = measure([5.05, 52.05], square);
  assert.equal(m.inside, true);
  assert.equal(m.km, 0);
});

test('pin outside polygon measures to nearest edge', () => {
  const m = measure([5.2, 52.05], square); // 0.1 deg lon east of the east edge
  assert.equal(m.inside, false);
  const expected = haversineKm([5.2, 52.05], [5.1, 52.05]);
  assert.ok(Math.abs(m.km - expected) < 0.05, `${m.km} vs ${expected}`);
  assert.ok(Math.abs(m.nearest[0] - 5.1) < 1e-6);
});

test('hole in polygon counts as outside', () => {
  const donut: TargetGeometry = {
    type: 'Polygon',
    coordinates: [
      [[5, 52], [5.1, 52], [5.1, 52.1], [5, 52.1], [5, 52]],
      [[5.04, 52.04], [5.06, 52.04], [5.06, 52.06], [5.04, 52.06], [5.04, 52.04]],
    ],
  };
  assert.equal(measure([5.05, 52.05], donut).inside, false);
});

test('point with radius acts as a disc', () => {
  const p: TargetGeometry = { type: 'Point', coordinates: [5, 52] };
  assert.equal(measure([5.01, 52], p, 2).km, 0);
  const m = measure([5.1, 52], p, 2);
  assert.ok(Math.abs(m.km - (haversineKm([5.1, 52], [5, 52]) - 2)) < 1e-9);
});

test('formatKm', () => {
  assert.equal(formatKm(0), 'raak');
  assert.equal(formatKm(0.432), '432 m');
  assert.equal(formatKm(3.25), '3,3 km');
  assert.equal(formatKm(42.4), '42 km');
});
