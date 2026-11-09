// Shared helpers for the data build scripts.
// Every network call goes to one of: service.pdok.nl, query.wikidata.org.
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = join(ROOT, 'public', 'data');
export const CACHE_DIR = join(ROOT, 'scripts', '.cache');

const UA = 'speldwerk-build/0.1 (https://github.com/jitseklomp/speldwerk)';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** fetch with retries and exponential backoff; throws a clear error naming the host. */
export async function fetchRetry(url, opts = {}, tries = 5) {
  const host = new URL(url).host;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(2000 * 2 ** i);
    }
  }
  throw new Error(`Kan ${host} niet bereiken (${lastErr?.message}). Deze host is nodig voor de build; data wordt niet verzonnen.`);
}

/** Run a SPARQL query against query.wikidata.org and return bindings flattened to {var: value}. */
export async function sparql(query, tries = 4, method = 'GET') {
  // POST for long queries (big VALUES lists), which would exceed the URL length limit.
  const post = method === 'POST';
  const url = post ? 'https://query.wikidata.org/sparql' : 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query);
  for (let i = 0; ; i++) {
    let text = '';
    try {
      const res = await fetchRetry(url, {
        method,
        body: post ? new URLSearchParams({ query }) : undefined,
        headers: { Accept: 'application/sparql-results+json' },
      });
      text = await res.text();
      const json = JSON.parse(text);
      return json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
    } catch {
      // Wikidata ends the stream mid-response when a query hits its 60 s limit.
      if (i >= tries - 1) throw new Error(`Wikidata gaf onvolledige JSON terug (timeout): ${text.slice(0, 80)}...`);
      console.warn('  Wikidata timeout, opnieuw proberen...');
      await sleep(5000 * (i + 1));
    }
  }
}

export const qid = (uri) => uri.replace('http://www.wikidata.org/entity/', '');

/** Parse "Point(lon lat)" from Wikidata. */
export function parsePoint(wkt) {
  const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(wkt);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Download all features of a WFS layer as GeoJSON (EPSG:4326), paging through results. Cached on disk. */
export async function wfsAll(base, typeName, { pageSize = 1000, propertyName, cacheName } = {}) {
  const cacheFile = cacheName ? join(CACHE_DIR, cacheName) : null;
  if (cacheFile) {
    try {
      await stat(cacheFile);
      console.log(`  cache: ${cacheName}`);
      return JSON.parse(await readFile(cacheFile, 'utf8'));
    } catch {}
  }
  const features = [];
  for (let start = 0; ; start += pageSize) {
    const p = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: typeName,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      count: String(pageSize),
      startIndex: String(start),
    });
    if (propertyName) p.set('propertyName', propertyName);
    const res = await fetchRetry(`${base}?${p}`);
    const page = await res.json();
    features.push(...page.features);
    process.stdout.write(`\r  ${typeName}: ${features.length}`);
    if (page.features.length < pageSize) break;
  }
  process.stdout.write('\n');
  const fc = { type: 'FeatureCollection', features };
  if (cacheFile) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile, JSON.stringify(fc));
  }
  return fc;
}

/** Round coordinates to 5 decimals (about 1 m) to keep files small. */
export function roundCoords(geom) {
  const r = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5] : c.map(r));
  return { ...geom, coordinates: r(geom.coordinates) };
}

export async function writeOut(name, features) {
  await mkdir(OUT_DIR, { recursive: true });
  const fc = {
    type: 'FeatureCollection',
    generated: new Date().toISOString().slice(0, 10),
    features: features.map((f) => ({ type: 'Feature', properties: f.properties, geometry: roundCoords(f.geometry) })),
  };
  const body = JSON.stringify(fc);
  await writeFile(join(OUT_DIR, name), body);
  console.log(`  -> public/data/${name}: ${features.length} doelen, ${(body.length / 1024).toFixed(0)} KB`);
}

export const point = (lon, lat, properties) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: [lon, lat] },
});

/** Rough bounding box of the Netherlands (incl. Wadden and Zeeland), used to drop stray items. */
export const NL_BBOX = [3.2, 50.7, 7.3, 53.6];
export const inNL = ([lon, lat]) => lon >= NL_BBOX[0] && lon <= NL_BBOX[2] && lat >= NL_BBOX[1] && lat <= NL_BBOX[3];

/** Run mapshaper commands with in-memory input/output. */
export async function mapshaper(commands, inputs) {
  const ms = (await import('mapshaper')).default;
  const asText = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return ms.applyCommands(commands, asText);
}
