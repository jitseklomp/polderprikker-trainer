// Province lookup for build scripts, using the official province boundaries
// (Kadaster Bestuurlijke Gebieden via PDOK). Reuses the app's geometry code.
import { wfsAll, mapshaper } from './lib.mjs';
import { inPolygon, measure, bboxOf } from '../src/geo.ts';

let cache = null;

/** Load and simplify the 12 provinces once. Returns [{ name, polys, bbox }]. */
export async function loadProvinces() {
  if (cache) return cache;
  const raw = await wfsAll('https://service.pdok.nl/kadaster/bestuurlijkegebieden/wfs/v1_0', 'bestuurlijkegebieden:Provinciegebied', {
    cacheName: 'provincies.json',
  });
  const out = await mapshaper('-i in.json -simplify interval=80 keep-shapes -o out.json format=geojson', { 'in.json': raw });
  cache = JSON.parse(out['out.json']).features.map((f) => ({
    name: f.properties.naam,
    geometry: f.geometry,
    polys: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
    bbox: bboxOf(f.geometry),
  }));
  if (cache.length !== 12) throw new Error(`Verwacht 12 provincies, kreeg ${cache.length}`);
  return cache;
}

const inBox = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

function containing(provs, p) {
  for (const pr of provs) if (inBox(p, pr.bbox) && pr.polys.some((poly) => inPolygon(p, poly))) return pr.name;
  return null;
}

/** Province a point lies in; points just offshore or on a border get the nearest province. */
export function provinceOfPoint(provs, p) {
  const hit = containing(provs, p);
  if (hit) return hit;
  let best = null;
  for (const pr of provs) {
    const d = measure(p, pr.geometry).km;
    if (!best || d < best.d) best = { d, name: pr.name };
  }
  return best.d <= 25 ? best.name : null;
}

/**
 * Provinces an area lies in, largest share first. Samples a grid of points inside the polygon;
 * a province is listed when it holds at least `minShare` of the samples.
 */
export function provincesOfArea(provs, geometry, minShare = 0.1) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const [minX, minY, maxX, maxY] = bboxOf(geometry);
  const steps = 40;
  const dx = (maxX - minX) / steps;
  const dy = (maxY - minY) / steps;
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = [minX + dx * (i + 0.5), minY + dy * (j + 0.5)];
      if (polys.some((poly) => inPolygon(p, poly))) samples.push(p);
    }
  }
  // very thin shapes: fall back to the outline vertices
  if (samples.length < 10) for (const poly of polys) samples.push(...poly[0]);

  const counts = new Map();
  let total = 0;
  for (const p of samples) {
    const name = containing(provs, p);
    if (!name) continue; // open sea outside every province
    counts.set(name, (counts.get(name) || 0) + 1);
    total++;
  }
  if (!total) {
    const c = [(minX + maxX) / 2, (minY + maxY) / 2];
    const name = provinceOfPoint(provs, c);
    return name ? [name] : [];
  }
  return [...counts.entries()]
    .filter(([, n]) => n / total >= minShare)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}
