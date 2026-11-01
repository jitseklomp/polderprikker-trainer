import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreForDistance, formatKm } from '../src/scoring.ts';
import { measure, haversineKm, type TargetGeometry } from '../src/geo.ts';

test('score curve', () => {
  assert.equal(scoreForDistance(0), 1000);
  assert.equal(scoreForDistance(0.1), 1000);
  assert.equal(scoreForDistance(0.3), 980);
  assert.equal(scoreForDistance(1), 914);
  assert.equal(scoreForDistance(5), 613);
  assert.equal(scoreForDistance(10), 372);
  assert.ok(scoreForDistance(50) < 10);
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
