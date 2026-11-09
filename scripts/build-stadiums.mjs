// Eredivisie stadiums for the current season. Coordinates come from Wikidata (P625 of the venue).
//
// Club list verified on 2026-11-01 against the "Stadiums and locations" table of
// https://en.wikipedia.org/wiki/2026%E2%80%9327_Eredivisie (18 clubs; promoted: ADO Den Haag,
// Cambuur, Willem II; relegated: Heracles Almelo, NAC Breda, Volendam).
// Update this list at the start of every season.
import { sparql, qid, parsePoint, point, writeOut } from './lib.mjs';

export const SEASON = '2026/27';
const CLUBS = [
  { club: 'ADO Den Haag', stadium: 'Werktalent Stadion', venue: 'Q720978' },
  { club: 'Ajax', stadium: 'Johan Cruijff ArenA', venue: 'Q207109' },
  { club: 'AZ', stadium: 'AFAS Stadion', venue: 'Q291590' },
  { club: 'Cambuur', stadium: 'Kooi Stadion', venue: 'Q122459692' },
  { club: 'Excelsior', stadium: 'Van Donge & De Roo Stadion', venue: 'Q2298643' },
  { club: 'Feyenoord', stadium: 'De Kuip', venue: 'Q330298' },
  { club: 'Fortuna Sittard', stadium: 'Fortuna Sittard Stadion', venue: 'Q1569222' },
  { club: 'Go Ahead Eagles', stadium: 'De Adelaarshorst', venue: 'Q777926' },
  { club: 'FC Groningen', stadium: 'Euroborg', venue: 'Q1374804' },
  { club: 'sc Heerenveen', stadium: 'Abe Lenstra Stadion', venue: 'Q318125' },
  { club: 'NEC', stadium: 'Goffertstadion', venue: 'Q720983' },
  { club: 'PEC Zwolle', stadium: 'MAC³PARK stadion', venue: 'Q1141104' },
  { club: 'PSV', stadium: 'Philips Stadion', venue: 'Q500972' },
  { club: 'Sparta Rotterdam', stadium: 'Sparta-Stadion Het Kasteel', venue: 'Q668094' },
  { club: 'Telstar', stadium: 'BUKO Stadion', venue: 'Q1851894' },
  { club: 'FC Twente', stadium: 'De Grolsch Veste', venue: 'Q727389' },
  { club: 'FC Utrecht', stadium: 'Stadion Galgenwaard', venue: 'Q1675996' },
  { club: 'Willem II', stadium: 'Koning Willem II Stadion', venue: 'Q1408176' },
];

export async function buildStadiums() {
  console.log(`Stadions (Eredivisie ${SEASON})`);
  const values = CLUBS.map((c) => `wd:${c.venue}`).join(' ');
  const rows = await sparql(`SELECT ?v ?coord WHERE { VALUES ?v { ${values} } ?v wdt:P625 ?coord }`);
  const coords = new Map(rows.map((r) => [qid(r.v), parsePoint(r.coord)]));
  const features = CLUBS.map((c) => {
    const ll = coords.get(c.venue);
    if (!ll) throw new Error(`Geen coordinaat op Wikidata voor ${c.stadium} (${c.venue})`);
    return point(ll[0], ll[1], { id: `fb-${c.venue}`, name: c.stadium, hint: c.club });
  });
  await writeOut('stadiums.json', features);
}

if (import.meta.url === `file://${process.argv[1]}`) await buildStadiums();
