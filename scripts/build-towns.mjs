// Towns and cities: BAG woonplaatsen (PDOK) with a population estimate from CBS Wijk- en Buurtkaart 2024
// (PDOK). Each buurt's interior point is assigned to the woonplaats polygon that contains it and the
// inhabitants are summed. The result is split into three difficulty files so the app can lazy-load:
//   towns-1.json  >= 50.000 inwoners  (Makkelijk)
//   towns-2.json  10.000 - 50.000     (Gemiddeld adds these)
//   towns-3.json  2.000 - 10.000      (Moeilijk adds these)
import { wfsAll, mapshaper, writeOut } from './lib.mjs';

export const LEVELS = [
  { file: 'towns-1.json', min: 50000, max: Infinity },
  { file: 'towns-2.json', min: 10000, max: 50000 },
  { file: 'towns-3.json', min: 2000, max: 10000 },
];

export async function buildTowns() {
  console.log('Woonplaatsen');
  const wp = await wfsAll('https://service.pdok.nl/lv/bag/wfs/v2_0', 'bag:woonplaats', {
    pageSize: 500,
    cacheName: 'woonplaatsen.json',
  });
  const bu = await wfsAll('https://service.pdok.nl/cbs/wijkenbuurten/2024/wfs/v1_0', 'wijkenbuurten:buurten', {
    pageSize: 1000,
    propertyName: 'buurtcode,gemeentenaam,aantalInwoners,geom',
    cacheName: 'buurten-2024.json',
  });

  const towns = {
    type: 'FeatureCollection',
    features: wp.features.map((f) => ({
      type: 'Feature',
      properties: { wid: f.properties.identificatie, name: f.properties.woonplaats },
      geometry: f.geometry,
    })),
  };
  const buurten = {
    type: 'FeatureCollection',
    features: bu.features
      .filter((f) => f.geometry && f.properties.gemeentenaam !== 'Buitenland')
      .map((f) => ({
        type: 'Feature',
        properties: { inw: Math.max(0, f.properties.aantalInwoners || 0), gem: f.properties.gemeentenaam },
        geometry: f.geometry,
      })),
  };

  console.log('  inwoners per woonplaats berekenen (mapshaper)...');
  const joined = await mapshaper(
    [
      '-i buurten.json name=buurten',
      '-points inner target=buurten',
      '-i towns.json name=towns',
      '-join buurten target=towns calc="inw=sum(inw), gem=mode(gem)"',
      '-filter "inw >= 2000" target=towns',
      '-simplify interval=60 keep-shapes target=towns',
      '-filter-slivers min-area=0.02km2 target=towns',
      '-clean target=towns',
      '-o towns-out.json format=geojson target=towns',
    ].join(' '),
    { 'buurten.json': buurten, 'towns.json': towns },
  );
  const feats = JSON.parse(joined['towns-out.json']).features.filter((f) => f.geometry);

  // Woonplaats names are not unique (two Hengelo's, several Zevenhuizen): add the municipality then.
  const count = new Map();
  for (const f of feats) count.set(f.properties.name, (count.get(f.properties.name) || 0) + 1);

  for (const lvl of LEVELS) {
    const sel = feats
      .filter((f) => f.properties.inw >= lvl.min && f.properties.inw < lvl.max)
      .map((f) => {
        const p = f.properties;
        const dup = count.get(p.name) > 1;
        return {
          properties: { id: `wp-${p.wid}`, name: p.name, hint: dup ? `gemeente ${p.gem}` : undefined, inw: p.inw },
          geometry: f.geometry,
        };
      })
      .sort((a, b) => b.properties.inw - a.properties.inw);
    await writeOut(lvl.file, sel);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await buildTowns();
