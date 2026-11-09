// "Water en havens": harbours, lakes and polders from Wikidata (points).
// Wikidata only has a point per item; where an area (P2046) is known, it is stored as an
// equivalent radius `r` in km so a pin anywhere inside a big lake or polder is not punished.
import { sparql, qid, parsePoint, point, writeOut, inNL } from './lib.mjs';
import { loadProvinces, provinceOfPoint } from './provinces.mjs';

const GROUPS = [
  {
    kind: 'haven',
    // haven, binnenhaven, zeehaven, vluchthaven, getijhaven, rivierhaven
    classes: ['Q44782', 'Q863915', 'Q15310171', 'Q1755007', 'Q2837192', 'Q25516778'],
    needWiki: false,
  },
  { kind: 'meer', classes: ['Q23397', 'Q131681'], needWiki: true },
  { kind: 'polder', classes: ['Q106259'], needWiki: true },
];

export async function buildWater() {
  console.log('Water en havens');
  const out = new Map();
  for (const g of GROUPS) {
    const values = g.classes.map((c) => `wd:${c}`).join(' ');
    const wiki = g.needWiki ? '?w schema:about ?s; schema:isPartOf <https://nl.wikipedia.org/> .' : '';
    const rows = await sparql(`
      SELECT DISTINCT ?s ?l ?coord WHERE {
        VALUES ?c { ${values} }
        ?s wdt:P31 ?c; wdt:P17 wd:Q55; wdt:P625 ?coord; rdfs:label ?l. FILTER(lang(?l)="nl")
        ${wiki}
        FILTER NOT EXISTS { ?s wdt:P576 [] }
      }`);
    // Areas in a second, cheap query (joining them in the first one times out on Wikidata).
    const areas = new Map();
    const ids = [...new Set(rows.map((r) => qid(r.s)))];
    for (let i = 0; i < ids.length; i += 300) {
      const vals = ids.slice(i, i + 300).map((q) => `wd:${q}`).join(' ');
      const ar = await sparql(`SELECT ?s (MAX(?a) AS ?area) WHERE { VALUES ?s { ${vals} } ?s p:P2046/psn:P2046/wikibase:quantityAmount ?a } GROUP BY ?s`);
      for (const r of ar) areas.set(qid(r.s), r.area);
    }
    for (const r of rows) r.area = areas.get(qid(r.s));
    let n = 0;
    for (const r of rows) {
      const id = qid(r.s);
      if (out.has(id)) continue;
      const ll = parsePoint(r.coord);
      if (!ll || !inNL(ll)) continue;
      const name = r.l.trim();
      if (/^Q\d+$/.test(name)) continue;
      const areaKm2 = r.area ? Number(r.area) / 1e6 : 0; // normalized to m²
      const radius = areaKm2 > 0 ? Math.min(25, Math.sqrt(areaKm2 / Math.PI)) : 0;
      out.set(id, point(ll[0], ll[1], { id: `wa-${id}`, name, kind: g.kind, r: radius ? Math.round(radius * 100) / 100 : undefined }));
      n++;
    }
    console.log(`  ${g.kind}: ${n}`);
  }

  // Ambiguous names (five "Buitenhaven"s, two "Beatrixhaven"s): add the municipality as a hint.
  const byName = new Map();
  for (const [id, f] of out) byName.set(f.properties.name, [...(byName.get(f.properties.name) || []), id]);
  const dupIds = [...byName.values()].filter((l) => l.length > 1).flat();
  if (dupIds.length) {
    const vals = dupIds.map((q) => `wd:${q}`).join(' ');
    const rows = await sparql(`SELECT ?s (SAMPLE(?pl) AS ?place) WHERE { VALUES ?s { ${vals} } ?s wdt:P131 ?p. ?p rdfs:label ?pl. FILTER(lang(?pl)="nl") } GROUP BY ?s`);
    for (const r of rows) out.get(qid(r.s)).properties.hint = r.place.replace(/^gemeente\s+/i, '');
  }

  // Province for lakes and polders (not harbours: those are tied to a city anyway).
  const provs = await loadProvinces();
  for (const f of out.values()) {
    if (f.properties.kind === 'haven') continue;
    const name = provinceOfPoint(provs, f.geometry.coordinates);
    if (name) f.properties.prov = [name];
    // a duplicate hint that only repeats the province adds nothing
    if (f.properties.hint && f.properties.hint === name) delete f.properties.hint;
  }

  const features = [...out.values()].sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'nl'));
  await writeOut('water.json', features);
}

if (import.meta.url === `file://${process.argv[1]}`) await buildWater();
