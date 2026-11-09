// Regenerate every dataset in public/data. Run with: npm run data
// Needs: service.pdok.nl and query.wikidata.org. Large PDOK downloads are cached in scripts/.cache.
import { buildStations } from './build-stations.mjs';
import { buildStadiums } from './build-stadiums.mjs';
import { buildNatura2000 } from './build-natura2000.mjs';
import { buildTowns } from './build-towns.mjs';
import { buildWater } from './build-water.mjs';
import { buildWaterways } from './build-waterways.mjs';

const only = process.argv.slice(2);
const steps = { stations: buildStations, stadiums: buildStadiums, natura2000: buildNatura2000, towns: buildTowns, water: buildWater, waterways: buildWaterways };
for (const [name, fn] of Object.entries(steps)) {
  if (only.length && !only.includes(name)) continue;
  await fn();
}
