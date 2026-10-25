/**
 * Choose where Desk Bloom lives: on the user's real table when the headset's
 * scene model knows one, otherwise on a detected horizontal plane, otherwise
 * a comfortable spot in front of a seated user.
 */

export type Vec3 = [number, number, number];

export interface SurfaceCandidate {
  kind: 'mesh' | 'plane';
  /** Semantic label from scene understanding, e.g. "table", "desk", "floor". */
  label: string;
  /** World-space axis-aligned bounds. */
  min: Vec3;
  max: Vec3;
  horizontal: boolean;
}

export interface DeskAnchor {
  position: Vec3;
  /** Yaw (radians) that turns +Z of the desk kit toward the user. */
  yaw: number;
  source: 'table' | 'surface' | 'fallback';
  /** Usable top width/depth (m) when known. */
  size: [number, number];
}

const DESK_LABELS = ['table', 'desk', 'counter'];
const REJECT_LABELS = ['floor', 'ceiling', 'wall', 'door', 'window', 'bed', 'global mesh'];

/** How far below the eyes a seated work surface is expected to sit. */
const MIN_DROP = 0.15;
const MAX_DROP = 0.95;
const MAX_REACH = 1.1;
const INSET = 0.22;

export function fallbackAnchor(head: Vec3, forwardYaw: number): DeskAnchor {
  const dist = 0.5;
  const x = head[0] - Math.sin(forwardYaw) * dist;
  const z = head[2] - Math.cos(forwardYaw) * dist;
  return {
    position: [x, head[1] - 0.42, z],
    yaw: forwardYaw,
    source: 'fallback',
    size: [0.9, 0.5],
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function scoreCandidate(c: SurfaceCandidate, head: Vec3): number | null {
  const label = c.label.toLowerCase();
  if (REJECT_LABELS.includes(label)) return null;
  if (!c.horizontal && !DESK_LABELS.includes(label)) return null;
  const top = c.max[1];
  const drop = head[1] - top;
  if (drop < MIN_DROP || drop > MAX_DROP) return null;
  const w = c.max[0] - c.min[0];
  const d = c.max[2] - c.min[2];
  if (w * d < 0.12 || Math.min(w, d) < 0.25) return null;
  const nx = clamp(head[0], c.min[0], c.max[0]);
  const nz = clamp(head[2], c.min[2], c.max[2]);
  const reach = Math.hypot(nx - head[0], nz - head[2]);
  if (reach > MAX_REACH) return null;
  let score = 10 - reach * 6 - Math.abs(drop - 0.45) * 4;
  if (DESK_LABELS.includes(label)) score += 5;
  if (c.kind === 'mesh') score += 1;
  return score;
}

export function chooseDesk(
  candidates: readonly SurfaceCandidate[],
  head: Vec3,
  forwardYaw: number,
): DeskAnchor {
  let best: SurfaceCandidate | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreCandidate(c, head);
    if (s != null && s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  if (!best) return fallbackAnchor(head, forwardYaw);

  const cx = (best.min[0] + best.max[0]) / 2;
  const cz = (best.min[2] + best.max[2]) / 2;
  // Nearest point of the top to the user, pulled inward so content sits
  // fully on the surface instead of on its edge.
  let px = clamp(head[0], best.min[0], best.max[0]);
  let pz = clamp(head[2], best.min[2], best.max[2]);
  const toCx = cx - px;
  const toCz = cz - pz;
  const len = Math.hypot(toCx, toCz);
  if (len > 1e-4) {
    const step = Math.min(INSET, len);
    px += (toCx / len) * step;
    pz += (toCz / len) * step;
  }
  // If the user sits right above/inside the surface footprint, keep content
  // in front of them rather than in their lap.
  const reach = Math.hypot(px - head[0], pz - head[2]);
  if (reach < 0.3) {
    px = head[0] - Math.sin(forwardYaw) * 0.45;
    pz = head[2] - Math.cos(forwardYaw) * 0.45;
  }
  const yaw = Math.atan2(head[0] - px, head[2] - pz);
  const label = best.label.toLowerCase();
  return {
    position: [px, best.max[1], pz],
    yaw,
    source: DESK_LABELS.includes(label) ? 'table' : 'surface',
    size: [best.max[0] - best.min[0], best.max[2] - best.min[2]],
  };
}

/** Yaw (radians) of a forward vector on the XZ plane; 0 = looking down -Z. */
export function yawFromForward(fx: number, fz: number): number {
  return Math.atan2(-fx, -fz);
}
