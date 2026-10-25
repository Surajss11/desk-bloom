/**
 * Long-term progression: the desk plant grows with every completed focus
 * block, and a 7-day streak strip gives a visible reason to come back.
 */

export interface GardenState {
  version: 1;
  totalMinutes: number;
  sessions: number;
  streakDays: number;
  bestStreak: number;
  /** Local calendar day (YYYY-MM-DD) of the last completed session. */
  lastDay: string | null;
  /** Minutes focused per local day, pruned to the last 60 days. */
  history: Record<string, number>;
  /** Has the user finished the guided first-run? */
  onboarded: boolean;
}

export interface PlantStage {
  index: number;
  name: string;
  /** Minimum total minutes for this stage. */
  minMinutes: number;
}

export const STAGES: readonly PlantStage[] = [
  { index: 0, name: 'Seed', minMinutes: 0 },
  { index: 1, name: 'Sprout', minMinutes: 1 },
  { index: 2, name: 'Seedling', minMinutes: 20 },
  { index: 3, name: 'Sapling', minMinutes: 60 },
  { index: 4, name: 'Budding', minMinutes: 150 },
  { index: 5, name: 'Bloom', minMinutes: 300 },
  { index: 6, name: 'Full Bloom', minMinutes: 600 },
];

export function createGarden(): GardenState {
  return {
    version: 1,
    totalMinutes: 0,
    sessions: 0,
    streakDays: 0,
    bestStreak: 0,
    lastDay: null,
    history: {},
    onboarded: false,
  };
}

/** Local-time calendar key, e.g. 2026-10-25. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days between two day keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86_400_000);
}

export function recordSession(g: GardenState, minutes: number, now: Date): GardenState {
  const mins = Math.max(0, Math.round(minutes));
  if (mins === 0) return g;
  const today = dayKey(now);
  let streak = g.streakDays;
  if (g.lastDay == null) streak = 1;
  else {
    const gap = daysBetween(g.lastDay, today);
    if (gap === 0) streak = Math.max(1, streak);
    else if (gap === 1) streak = streak + 1;
    else if (gap > 1) streak = 1;
    // gap < 0 (clock moved backwards): keep the streak untouched.
  }
  const history = { ...g.history, [today]: (g.history[today] ?? 0) + mins };
  return {
    ...g,
    totalMinutes: g.totalMinutes + mins,
    sessions: g.sessions + 1,
    streakDays: streak,
    bestStreak: Math.max(g.bestStreak, streak),
    lastDay: g.lastDay != null && daysBetween(g.lastDay, today) < 0 ? g.lastDay : today,
    history: pruneHistory(history, today),
  };
}

/** Streak as the user should see it today: broken if they skipped a day. */
export function liveStreak(g: GardenState, now: Date): number {
  if (g.lastDay == null) return 0;
  const gap = daysBetween(g.lastDay, dayKey(now));
  return gap <= 1 ? g.streakDays : 0;
}

export function pruneHistory(h: Record<string, number>, today: string, keepDays = 60) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(h)) {
    const age = daysBetween(k, today);
    if (age >= 0 && age < keepDays) out[k] = v;
  }
  return out;
}

export function stageFor(totalMinutes: number): PlantStage {
  let current = STAGES[0];
  for (const s of STAGES) if (totalMinutes >= s.minMinutes) current = s;
  return current;
}

/** 0..1 progress from the current stage toward the next one. */
export function stageProgress(totalMinutes: number): number {
  const s = stageFor(totalMinutes);
  const next = STAGES[s.index + 1];
  if (!next) return 1;
  return (totalMinutes - s.minMinutes) / (next.minMinutes - s.minMinutes);
}

export function minutesToNextStage(totalMinutes: number): number | null {
  const s = stageFor(totalMinutes);
  const next = STAGES[s.index + 1];
  return next ? next.minMinutes - totalMinutes : null;
}

/**
 * Continuous growth value used by the renderer: stage index plus the
 * fraction toward the next stage (0 .. STAGES.length - 1).
 */
export function growth(totalMinutes: number): number {
  const s = stageFor(totalMinutes);
  if (s.index === STAGES.length - 1) return s.index;
  return s.index + Math.min(0.999, stageProgress(totalMinutes));
}

/** Minutes for each of the last 7 local days, oldest first. */
export function lastSevenDays(g: GardenState, now: Date): number[] {
  const out: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(g.history[dayKey(d)] ?? 0);
  }
  return out;
}

export function minutesToday(g: GardenState, now: Date): number {
  return g.history[dayKey(now)] ?? 0;
}

/** Sanitise untrusted persisted data; never throws. */
export function reviveGarden(raw: unknown): GardenState {
  const base = createGarden();
  if (raw == null || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const history: Record<string, number> = {};
  if (r.history && typeof r.history === 'object') {
    for (const [k, v] of Object.entries(r.history as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && n(v) > 0) history[k] = n(v);
    }
  }
  return {
    version: 1,
    totalMinutes: n(r.totalMinutes),
    sessions: n(r.sessions),
    streakDays: n(r.streakDays),
    bestStreak: n(r.bestStreak),
    lastDay: typeof r.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastDay) ? r.lastDay : null,
    history,
    onboarded: r.onboarded === true,
  };
}
