// Natura2000 areas from the PDOK Natura2000 WFS (RVO), dissolved per area name and simplified.
import { wfsAll, mapshaper, writeOut } from './lib.mjs';

export async function buildNatura2000() {
  console.log('Natura2000');
  const fc = await wfsAll('https://service.pdok.nl/rvo/natura2000/wfs/v1_0', 'natura2000:natura2000', {
    pageSize: 50,
    cacheName: 'natura2000.json',
  });
  const input = {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({ type: 'Feature', properties: { name: f.properties.naamN2K.trim(), nr: f.properties.nr }, geometry: f.geometry })),
  };
  const out = await mapshaper(
    '-i in.json -dissolve2 fields=name copy-fields=nr -simplify interval=120 keep-shapes -filter-slivers min-area=0.05km2 -clean -o out.json format=geojson',
    { 'in.json': input },
  );
  const result = JSON.parse(out['out.json']);
  const features = result.features
    .filter((f) => f.geometry)
    .map((f) => ({ properties: { id: `n2k-${f.properties.nr}`, name: f.properties.name }, geometry: f.geometry }))
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'nl'));
  await writeOut('natura2000.json', features);
}

if (import.meta.url === `file://${process.argv[1]}`) await buildNatura2000();
