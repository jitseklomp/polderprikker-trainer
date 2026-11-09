// Score = 1000 / (1 + (d / 15)^2.5), d in km.
// An S-curve: close to full marks for the first few km, half at 15 km, then a long gentle taper.
//   0.5 km 1000 · 2 km 994 · 5 km 940 · 10 km 734 · 15 km 500 · 20 km 328 · 30 km 150 · 50 km 47 · 100 km 9

export const MAX_SCORE = 1000;
/** Distance in km at which you get half the points. */
export const HALF_KM = 15;
/** Steepness of the taper around HALF_KM; higher is a sharper drop. */
export const STEEPNESS = 2.5;

export function scoreForDistance(km: number): number {
  const d = Math.max(0, km);
  return Math.round(MAX_SCORE / (1 + (d / HALF_KM) ** STEEPNESS));
}

export function formatKm(km: number): string {
  if (km === 0) return 'raak';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/** Short Dutch verdict for the result panel, based on distance (scores are generous near the top). */
export function verdict(km: number): string {
  if (km < 0.5) return 'Midden in de roos';
  if (km < 2) return 'Heel dichtbij';
  if (km < 7) return 'Goed gemikt';
  if (km < 20) return 'In de buurt';
  if (km < 50) return 'Verkeerde hoek';
  return 'Ver mis';
}
