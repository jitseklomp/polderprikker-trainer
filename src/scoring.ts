// Score = 1000 * exp(-max(0, d - 0.1) / 10), d in km.
// Full marks within 100 m, ~910 at 1 km, ~610 at 5 km, ~370 at 10 km, under 10 at 50 km.

export const MAX_SCORE = 1000;
export const GRACE_KM = 0.1;
export const DECAY_KM = 10;

export function scoreForDistance(km: number): number {
  const d = Math.max(0, km - GRACE_KM);
  return Math.round(MAX_SCORE * Math.exp(-d / DECAY_KM));
}

export function formatKm(km: number): string {
  if (km === 0) return 'raak';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/** Short Dutch verdict for the result panel. */
export function verdict(score: number): string {
  if (score >= 990) return 'Midden in de roos';
  if (score >= 900) return 'Heel dichtbij';
  if (score >= 700) return 'Goed gemikt';
  if (score >= 400) return 'In de buurt';
  if (score >= 100) return 'Verkeerde hoek';
  return 'Ver mis';
}
