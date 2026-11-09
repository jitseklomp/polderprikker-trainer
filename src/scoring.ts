// Two curves, both of the form 1000 / (1 + (d / half)^steepness), d in km.
//
// area  (towns, Natura 2000, lakes, polders; d = distance to the edge, 0 inside):
//   flat near the top, half at 15 km, then a long gentle taper.
//   1 km 999 · 2 km 994 · 5 km 940 · 10 km 734 · 15 km 500 · 30 km 150 · 50 km 47
// point (stations, stadiums, harbours; d = distance to the exact spot):
//   starts dropping right away, so only ~50 m scores 1000; half at 8 km.
//   100 m 999 · 500 m 985 · 700 m 975 · 1 km 958 · 2 km 889 · 5 km 669 · 10 km 417 · 50 km 60

export type TargetKind = 'area' | 'point';

export const MAX_SCORE = 1000;
export const CURVES: Record<TargetKind, { halfKm: number; steepness: number }> = {
  area: { halfKm: 15, steepness: 2.5 },
  point: { halfKm: 8, steepness: 1.5 },
};

export function scoreForDistance(km: number, kind: TargetKind = 'area'): number {
  const { halfKm, steepness } = CURVES[kind];
  const d = Math.max(0, km);
  return Math.round(MAX_SCORE / (1 + (d / halfKm) ** steepness));
}

export function formatKm(km: number): string {
  if (km === 0) return 'raak';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

// Distance thresholds (km) for the verdict texts; points demand more precision than areas.
const VERDICTS: Record<TargetKind, number[]> = {
  area: [0.5, 2, 7, 20, 50],
  point: [0.1, 1, 5, 15, 40],
};
const VERDICT_TEXT = ['Midden in de roos', 'Heel dichtbij', 'Goed gemikt', 'In de buurt', 'Verkeerde hoek', 'Ver mis'];

/** Short Dutch verdict for the result panel, based on distance. */
export function verdict(km: number, kind: TargetKind = 'area'): string {
  const i = VERDICTS[kind].findIndex((limit) => km < limit);
  return VERDICT_TEXT[i === -1 ? VERDICT_TEXT.length - 1 : i];
}
