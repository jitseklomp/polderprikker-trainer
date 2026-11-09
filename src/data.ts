import type { TargetGeometry } from './geo.ts';

declare const __BUILD_ID__: string;
import type { TargetKind } from './scoring.ts';

export interface CategoryDef {
  id: string;
  label: string;
  /** Short label for chips. */
  short: string;
  description: string;
  files: string[];
  area: boolean;
}

/** Town levels are cumulative: "gemiddeld" includes the big cities as well. */
export const CATEGORIES: CategoryDef[] = [
  { id: 'stations', label: 'Treinstations', short: 'Station', description: '420 stations, ook museumlijnen', files: ['stations.json'], area: false },
  { id: 'stadiums', label: 'Eredivisiestadions', short: 'Stadion', description: 'Seizoen 2026/27, 18 clubs', files: ['stadiums.json'], area: false },
  { id: 'natura2000', label: 'Natura 2000', short: 'Natura 2000', description: '162 beschermde gebieden', files: ['natura2000.json'], area: true },
  { id: 'towns-1', label: 'Plaatsen', short: 'Plaats', description: 'Vanaf 50.000 inwoners', files: ['towns-1.json'], area: true },
  { id: 'towns-2', label: 'Plaatsen', short: 'Plaats', description: 'Vanaf 10.000 inwoners', files: ['towns-1.json', 'towns-2.json'], area: true },
  { id: 'towns-3', label: 'Plaatsen', short: 'Plaats', description: 'Vanaf 2.000 inwoners', files: ['towns-1.json', 'towns-2.json', 'towns-3.json'], area: true },
  { id: 'water', label: 'Water en havens', short: 'Water', description: 'Havens, meren en polders', files: ['water.json'], area: false },
];

export const TOWN_LEVELS = [
  { id: 'towns-1', label: 'Makkelijk' },
  { id: 'towns-2', label: 'Gemiddeld' },
  { id: 'towns-3', label: 'Moeilijk' },
];

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id)!;

export interface Target {
  id: string;
  name: string;
  hint?: string;
  /** Province(s) the target lies in, largest share first (Natura 2000, lakes, polders). */
  prov?: string[];
  /** Equivalent radius in km for point targets that are really areas (lakes, polders). */
  r?: number;
  kind?: string;
  category: string;
  geometry: TargetGeometry;
}

interface RawFeature {
  properties: { id: string; name: string; hint?: string; prov?: string[]; r?: number; kind?: string };
  geometry: TargetGeometry;
}

const fileCache = new Map<string, Promise<RawFeature[]>>();

function loadFile(file: string): Promise<RawFeature[]> {
  let p = fileCache.get(file);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${file}?v=${__BUILD_ID__}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return r.json();
      })
      .then((fc) => fc.features as RawFeature[]);
    p.catch(() => fileCache.delete(file));
    fileCache.set(file, p);
  }
  return p;
}

export async function loadCategory(id: string): Promise<Target[]> {
  const def = categoryById(id);
  const parts = await Promise.all(def.files.map(loadFile));
  return parts.flat().map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    hint: f.properties.hint,
    prov: f.properties.prov,
    r: f.properties.r,
    kind: f.properties.kind,
    category: id,
    geometry: f.geometry,
  }));
}

/** "in provincie Gelderland", "in de provincies Gelderland en Overijssel", ... */
export function provinceText(t: Target): string | null {
  const p = t.prov;
  if (!p) return null;
  if (p.length === 0) return t.category === 'natura2000' ? 'in de Noordzee' : null;
  if (p.length === 1) return `in provincie ${p[0]}`;
  if (p.length > 3) return 'in meerdere provincies';
  return `in de provincies ${p.slice(0, -1).join(', ')} en ${p[p.length - 1]}`;
}

/**
 * Which scoring curve a target uses. Stations, stadiums and harbours are exact spots ("point").
 * Towns and Natura 2000 are polygons, and lakes/polders are areas even when Wikidata only gives
 * a rough centre point, so those all use the "area" curve.
 */
export function targetKind(t: Target): TargetKind {
  if (t.geometry.type !== 'Point') return 'area';
  if ((t.r ?? 0) > 0 || t.kind === 'meer' || t.kind === 'polder') return 'area';
  return 'point';
}
