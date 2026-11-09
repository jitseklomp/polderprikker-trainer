// Waterways (rivers, canals, tidal channels) as lines.
//
// Geometry: NWB Vaarwegen "vaarwegvakken" (Rijkswaterstaat, via PDOK): every navigable waterway in
// the Netherlands as line sections with a name. Small non-navigable rivers are not in it.
// Classification: NWB names say nothing about what a waterway is, so names are matched against
// Wikidata (river / canal / channel). Names Wikidata does not know are kept when they are clearly a
// tidal channel ("-gat", "-stroom", "-geul", ...). Everything else (harbours, lakes, North Sea
// shipping routes, streets that happen to share a name) is dropped, as are sections outside the
// Dutch provinces (Belgian and German canals, the open sea).
import { wfsAll, mapshaper, writeOut, sparql } from './lib.mjs';
import { loadProvinces, provincesOfLine } from './provinces.mjs';

const KINDS = {
  rivier: ['Q4022', 'Q591942', 'Q2357987', 'Q47521'], // river, distributary, stroom, stream
  kanaal: ['Q12284', 'Q2438381', 'Q355304', 'Q1267889', 'Q523166'], // canal, trekvaart, watergang, vaarweg, gracht
  vaargeul: ['Q41982239', 'Q1210950', 'Q37901'], // vaargeul, natural channel, strait
};
const PRIORITY = ['rivier', 'kanaal', 'vaargeul'];

// NWB names whose Wikidata label differs, or that Wikidata types badly. [display name, kind]
const ALIASES = {
  'Neder-Rijn': ['Nederrijn', 'rivier'],
  'Geldersche IJssel': ['IJssel', 'rivier'],
  'Gekanaliseerde Hollandsche IJssel': ['Hollandse IJssel', 'rivier'],
  'Hollandsche IJssel': ['Hollandse IJssel', 'rivier'],
  'Kuinder of Tjonger': ['Tjonger', 'rivier'],
  'De Tsjonger of De Kuunder': ['Tjonger', 'rivier'],
  'Hollandsch Diep': ['Hollandsch Diep', 'rivier'],
  'Westerschelde': ['Westerschelde', 'vaargeul'],
  'Oosterschelde': ['Oosterschelde', 'vaargeul'],
  'Marsdiep': ['Marsdiep', 'vaargeul'],
  'Gekanaliseerde Dieze': ['Dieze', 'rivier'],
  'Bijlandsch Kanaal, Boven-Rijn': ['Boven-Rijn', 'rivier'],
  'Afgesloten-IJ, Binnen-IJ of IJ': ['IJ', 'rivier'],
  "Marsdiep - 't Horntje": ['Marsdiep', 'vaargeul'],
  Calandkanaal: ['Calandkanaal', 'kanaal'],
};

const SEA = /VSS|Voorzorgsgebied|Scheep[s]?vaart(zone|route)|Route|Junction|Pass Route|Windfarm|Noordzeekust|Two way|Ankergebied|Diepwater|\(NCP\)|noordzee$/i;
const CHANNEL = /(gat|stroom|geul|balg|rak|slenk|vlije|wad|zeegat|vaarwater|kom)\b/i;
const MIN_KM = 3;

/** Variants of an NWB name to look up: without "(...)", before a comma, both halves of "X of Y", old spelling. */
function variants(name) {
  const out = new Set();
  const base = cleanName(name);
  for (const part of [base, ...base.split(/ of /)]) {
    const p = part.trim();
    if (!p) continue;
    out.add(p);
    out.add(p.replace(/sche\b/g, 'se').replace(/sch\b/g, 's'));
  }
  return [...out];
}

// "Texelstroom oost", "Vliestroom noord", "Doove Balg midden" are parts of one channel
const DIRECTION = /\s+(noord|zuid|oost|west|midden|midd noord)$/i;
const cleanName = (n) => n.replace(/\s*\(.*?\)\s*/g, ' ').split(',')[0].trim().replace(DIRECTION, '');

async function classifyNames(names) {
  const lookup = new Map(); // variant -> NWB names
  for (const n of names) for (const v of variants(n)) lookup.set(v, [...(lookup.get(v) || []), n]);
  const classOf = new Map(Object.entries(KINDS).flatMap(([k, qs]) => qs.map((q) => [q, k])));
  const found = new Map(); // variant -> best kind
  const vals = [...lookup.keys()];
  for (let i = 0; i < vals.length; i += 250) {
    const v = vals.slice(i, i + 250).map((s) => `${JSON.stringify(s)}@nl`).join(' ');
    const rows = await sparql(`SELECT DISTINCT ?l ?c WHERE { VALUES ?l { ${v} } ?s rdfs:label ?l; wdt:P17 wd:Q55; wdt:P31 ?c. }`, 4, 'POST');
    for (const r of rows) {
      const kind = classOf.get(r.c.split('/').pop());
      if (!kind) continue;
      const prev = found.get(r.l);
      if (!prev || PRIORITY.indexOf(kind) < PRIORITY.indexOf(prev)) found.set(r.l, kind);
    }
  }
  const result = new Map(); // NWB name -> { name, kind }
  for (const n of names) {
    if (ALIASES[n]) {
      result.set(n, { name: ALIASES[n][0], kind: ALIASES[n][1] });
      continue;
    }
    let best = null;
    for (const v of variants(n)) {
      const k = found.get(v);
      if (k && (!best || PRIORITY.indexOf(k) < PRIORITY.indexOf(best.kind))) best = { name: v, kind: k };
    }
    if (!best && CHANNEL.test(cleanName(n))) best = { name: cleanName(n), kind: 'vaargeul' };
    if (best) result.set(n, best);
  }
  return result;
}

const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const km = (a, b) => {
  const kx = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180)) * 111.32;
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.57);
};

/** Split sections with the same name into connected groups (end points within 10 km, bridging locks and short gaps). */
function clusters(sections) {
  const parent = sections.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ends = sections.map((s) => lines(s.geometry).flatMap((l) => [l[0], l[l.length - 1]]));
  for (let i = 0; i < sections.length; i++)
    for (let j = i + 1; j < sections.length; j++)
      if (ends[i].some((a) => ends[j].some((b) => km(a, b) < 10))) parent[find(i)] = find(j);
  const groups = new Map();
  sections.forEach((s, i) => groups.set(find(i), [...(groups.get(find(i)) || []), s]));
  return [...groups.values()];
}

export async function buildWaterways() {
  console.log('Waterwegen');
  const fc = await wfsAll('https://service.pdok.nl/rws/nwbvaarwegen/wfs/v1_0', 'nwbvaarwegen:vaarwegvakken', {
    pageSize: 1000,
    cacheName: 'nwbvaarwegen.json',
  });
  const seen = new Set();
  const sections = fc.features.filter((f) => {
    const id = f.properties.objectid;
    if (seen.has(id) || !f.geometry) return false;
    seen.add(id);
    const n = f.properties.vwgNaam;
    return n && !SEA.test(n);
  });
  console.log(`  ${sections.length} vaarwegvakken met een naam`);

  const provs = await loadProvinces();
  // keep only sections whose middle lies in a Dutch province (drops Belgium, Germany, open sea)
  const inNL = sections.filter((f) => {
    const l = lines(f.geometry).flat();
    return provincesOfLine(provs, [l[Math.floor(l.length / 2)]], 1).length > 0;
  });
  console.log(`  ${inNL.length} in Nederland`);

  const names = [...new Set(inNL.map((f) => f.properties.vwgNaam))];
  const cls = await classifyNames(names);
  const byName = new Map();
  for (const f of inNL) {
    const c = cls.get(f.properties.vwgNaam);
    if (!c) continue;
    const key = `${c.name}|${c.kind}`;
    byName.set(key, [...(byName.get(key) || []), f]);
  }

  const targets = [];
  for (const [key, secs] of byName) {
    const [name, kind] = key.split('|');
    for (const group of clusters(secs)) {
      const len = group.reduce((s, f) => s + (f.properties.stLengthshape || 0) / 1000, 0);
      if (len < MIN_KM) continue;
      const geometry = { type: 'MultiLineString', coordinates: group.flatMap((f) => lines(f.geometry)) };
      targets.push({ name, kind, len, geometry });
    }
  }

  // simplify all lines in one go (keeps shared end points aligned)
  const input = {
    type: 'FeatureCollection',
    features: targets.map((t, i) => ({ type: 'Feature', properties: { i }, geometry: t.geometry })),
  };
  const out = await mapshaper('-i in.json -simplify interval=40 keep-shapes -o out.json format=geojson', { 'in.json': input });
  const simplified = new Map(JSON.parse(out['out.json']).features.map((f) => [f.properties.i, f.geometry]));

  const features = targets
    .map((t, i) => {
      const geometry = simplified.get(i);
      if (!geometry) return null;
      const pts = lines(geometry).flat();
      const prov = provincesOfLine(provs, pts.filter((_, k) => k % 3 === 0));
      return { properties: { id: '', name: t.name, kind: t.kind, prov, len: Math.round(t.len) }, geometry };
    })
    .filter(Boolean);

  // Same name in more than one place (two Vechts): keep them if they lie in different provinces,
  // otherwise only the longest.
  const groups = new Map();
  for (const f of features) groups.set(f.properties.name, [...(groups.get(f.properties.name) || []), f]);
  const kept = [];
  for (const list of groups.values()) {
    list.sort((a, b) => b.properties.len - a.properties.len);
    const usedProv = new Set();
    for (const f of list) {
      const p = f.properties.prov[0] || '';
      if (usedProv.has(p)) continue;
      usedProv.add(p);
      kept.push(f);
    }
  }
  kept.sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'nl'));
  kept.forEach((f, i) => (f.properties.id = `ww-${i}`));
  const count = (k) => kept.filter((f) => f.properties.kind === k).length;
  console.log(`  rivieren ${count('rivier')}, kanalen ${count('kanaal')}, vaargeulen ${count('vaargeul')}`);
  await writeOut('waterways.json', kept);
}

if (import.meta.url === `file://${process.argv[1]}`) await buildWaterways();
