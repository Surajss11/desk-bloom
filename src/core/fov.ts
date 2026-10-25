/**
 * FoV-aware layout helpers. The app reads the live projection matrix of the
 * XR view, so the same build fits Quest 3, Quest Pro and narrower devices
 * such as Meta VR Glasses without per-device constants.
 */

export interface FovDeg {
  left: number;
  right: number;
  up: number;
  down: number;
}

const DEG = 180 / Math.PI;

/**
 * Field of view (degrees, each half measured from the view axis) of a
 * column-major perspective projection matrix (three.js `elements` layout).
 */
export function fovFromProjection(m: ArrayLike<number>): FovDeg {
  const m0 = m[0];
  const m5 = m[5];
  const m8 = m[8];
  const m9 = m[9];
  if (!(m0 > 0) || !(m5 > 0)) return { left: 45, right: 45, up: 45, down: 45 };
  return {
    right: Math.atan((1 + m8) / m0) * DEG,
    left: Math.atan((1 - m8) / m0) * DEG,
    up: Math.atan((1 + m9) / m5) * DEG,
    down: Math.atan((1 - m9) / m5) * DEG,
  };
}

/** Field of view visible to both eyes (the stereo overlap). */
export function binocularFov(views: FovDeg[]): FovDeg {
  if (views.length === 0) return { left: 45, right: 45, up: 45, down: 45 };
  return {
    left: Math.min(...views.map((v) => v.left)),
    right: Math.min(...views.map((v) => v.right)),
    up: Math.min(...views.map((v) => v.up)),
    down: Math.min(...views.map((v) => v.down)),
  };
}

export interface ComfortZone {
  /** Half-angle left/right where essential UI may live. */
  halfH: number;
  up: number;
  down: number;
}

/** Ergonomic ceiling for seated, eyes-only reading (no neck turn). */
export const ERGONOMIC: ComfortZone = { halfH: 30, up: 15, down: 35 };

/**
 * Comfortable zone = ergonomic limits, tightened to 80% of whatever the
 * device can actually show.
 */
export function comfortZone(fov: FovDeg, ratio = 0.8): ComfortZone {
  return {
    halfH: Math.min(ERGONOMIC.halfH, Math.min(fov.left, fov.right) * ratio),
    up: Math.min(ERGONOMIC.up, fov.up * ratio),
    down: Math.min(ERGONOMIC.down, fov.down * ratio),
  };
}

/** Angular half-width (deg) of an object `width` metres wide at `distance`. */
export function angularHalfWidth(width: number, distance: number): number {
  return Math.atan(width / 2 / Math.max(1e-3, distance)) * DEG;
}

/** Largest width (m) that stays inside `halfDeg` at `distance`. */
export function maxWidthFor(halfDeg: number, distance: number): number {
  return 2 * distance * Math.tan(halfDeg / DEG);
}

/**
 * Lay `count` items on a horizontal arc centred on the user, spanning at most
 * the comfort zone. Returns local XZ offsets (metres) and yaw (radians) so
 * each item faces the user. Origin = user, -Z = forward.
 */
export function arcLayout(
  count: number,
  radius: number,
  halfSpanDeg: number,
): { x: number; z: number; yaw: number }[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, z: -radius, yaw: 0 }];
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const a = (-halfSpanDeg + 2 * halfSpanDeg * t) / DEG;
    out.push({ x: Math.sin(a) * radius, z: -Math.cos(a) * radius, yaw: -a });
  }
  return out;
}

/** Is a point (relative to the eye, -Z forward) inside the comfort zone? */
export function inComfortZone(
  p: { x: number; y: number; z: number },
  zone: ComfortZone,
): boolean {
  const fwd = -p.z;
  if (fwd <= 0) return false;
  const h = Math.atan2(p.x, fwd) * DEG;
  const v = Math.atan2(p.y, Math.hypot(p.x, fwd)) * DEG;
  return Math.abs(h) <= zone.halfH + 1e-6 && v <= zone.up + 1e-6 && -v <= zone.down + 1e-6;
}
