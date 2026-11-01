// Small geometry toolkit: distance from a pin to a point, a circle or a (multi)polygon.
// Uses a local equirectangular projection around the pin; error is negligible at Dutch scales.

export type LonLat = [number, number];
type Ring = LonLat[];
type Polygon = Ring[];

export type TargetGeometry =
  | { type: 'Point'; coordinates: LonLat }
  | { type: 'Polygon'; coordinates: Polygon }
  | { type: 'MultiPolygon'; coordinates: Polygon[] };

export interface Measure {
  /** Distance in km from the pin to the target (0 when inside an area). */
  km: number;
  /** Closest point of the target to the pin, for drawing the miss line. */
  nearest: LonLat;
  inside: boolean;
}

const R = 6371.0088;
const toRad = Math.PI / 180;

export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Ray casting; ring is closed or open, holes handled by the caller via even-odd over all rings. */
function inRing(p: LonLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPolygon(p: LonLat, poly: Polygon): boolean {
  if (!inRing(p, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(p, poly[h])) return false;
  return true;
}

function polygons(g: TargetGeometry): Polygon[] {
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

/** Distance from pin to the nearest edge of any ring, plus the nearest point (lon/lat). */
function nearestOnRings(p: LonLat, polys: Polygon[]): { km: number; nearest: LonLat } {
  const kx = Math.cos(p[1] * toRad) * R * toRad; // km per degree lon
  const ky = R * toRad; // km per degree lat
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const ax = (ring[i][0] - p[0]) * kx;
        const ay = (ring[i][1] - p[1]) * ky;
        const cx = (ring[i + 1][0] - p[0]) * kx;
        const cy = (ring[i + 1][1] - p[1]) * ky;
        const dx = cx - ax;
        const dy = cy - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx;
        const qy = ay + t * dy;
        const d2 = qx * qx + qy * qy;
        if (d2 < best) {
          best = d2;
          bx = qx;
          by = qy;
        }
      }
    }
  }
  return { km: Math.sqrt(best), nearest: [p[0] + bx / kx, p[1] + by / ky] };
}

/**
 * Measure how far the pin is from the target.
 * `radiusKm` turns a point into a disc (used for lakes/polders where only a point plus an area is known).
 */
export function measure(pin: LonLat, g: TargetGeometry, radiusKm = 0): Measure {
  if (g.type === 'Point') {
    const c = g.coordinates;
    const d = haversineKm(pin, c);
    if (d <= radiusKm) return { km: 0, nearest: pin, inside: true };
    if (radiusKm <= 0) return { km: d, nearest: c, inside: false };
    const f = radiusKm / d; // point on the circle towards the pin
    return { km: d - radiusKm, nearest: [c[0] + (pin[0] - c[0]) * f, c[1] + (pin[1] - c[1]) * f], inside: false };
  }
  const polys = polygons(g);
  if (polys.some((poly) => inPolygon(pin, poly))) return { km: 0, nearest: pin, inside: true };
  return { ...nearestOnRings(pin, polys), inside: false };
}

export function bboxOf(g: TargetGeometry): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (c: LonLat) => {
    if (c[0] < minX) minX = c[0];
    if (c[0] > maxX) maxX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[1] > maxY) maxY = c[1];
  };
  if (g.type === 'Point') visit(g.coordinates);
  else for (const poly of polygons(g)) for (const ring of poly) ring.forEach(visit);
  return [minX, minY, maxX, maxY];
}
