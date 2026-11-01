// Railway stations: ProRail station layer from PDOK (all passenger stations on the national
// network plus ZLSM and STAR heritage lines), complemented with heritage-line stations from Wikidata.
import { wfsAll, sparql, qid, parsePoint, point, writeOut, inNL } from './lib.mjs';

// Heritage stations that are not on the ProRail layer. Wikidata QIDs, checked by hand.
// VSM (Apeldoorn-Dieren), Stoomtrein Goes-Borsele, Museumstoomtram Hoorn-Medemblik,
// Museum Buurtspoorweg (Haaksbergen-Boekelo).
const HERITAGE = {
  Q5918620: 'VSM',
  Q1813155: 'VSM',
  Q2681641: 'VSM',
  Q129482: 'SGB',
  Q2654663: 'SGB',
  Q17459793: 'SGB',
  Q2651896: 'Museumstoomtram',
  Q2000293: 'Museumstoomtram',
  Q2695961: 'Museumstoomtram',
  Q2108772: 'Museumstoomtram',
  Q2123587: 'MBS',
  Q2936259: 'MBS',
};

const cleanName = (s) => s.replace(/^(station|halte|stopplaats)\s+/i, '').trim();

export async function buildStations() {
  console.log('Stations');
  const pr = await wfsAll('https://service.pdok.nl/prorail/spoorwegen/wfs/v1_0', 'spoorwegen:station');
  const out = new Map();
  for (const f of pr.features) {
    const p = f.properties;
    if (/\((D|B)\)\s*$/.test(p.naam)) continue; // stations across the border
    const [lon, lat] = f.geometry.coordinates;
    if (!inNL([lon, lat])) continue;
    const heritage = /ZLSM|STAR/.test(p.beheerder);
    out.set(p.naam, point(lon, lat, { id: `st-${p.afkorting || p.naam}`, name: `Station ${p.naam}`, heritage }));
  }

  const values = Object.keys(HERITAGE).map((q) => `wd:${q}`).join(' ');
  const rows = await sparql(`SELECT ?s ?l ?coord WHERE { VALUES ?s { ${values} } ?s wdt:P625 ?coord; rdfs:label ?l. FILTER(lang(?l)="nl") }`);
  const found = new Set();
  for (const r of rows) {
    const id = qid(r.s);
    if (found.has(id)) continue;
    found.add(id);
    const name = cleanName(r.l);
    if (out.has(name)) continue;
    const [lon, lat] = parsePoint(r.coord);
    out.set(name, point(lon, lat, { id: `st-${id}`, name: `Station ${name}`, heritage: true, line: HERITAGE[id] }));
  }
  const missing = Object.keys(HERITAGE).filter((q) => !found.has(q));
  if (missing.length) console.warn(`  let op: geen data voor ${missing.join(', ')}`);

  const features = [...out.values()].sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'nl'));
  await writeOut('stations.json', features);
}

if (import.meta.url === `file://${process.argv[1]}`) await buildStations();
