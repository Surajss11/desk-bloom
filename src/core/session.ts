/**
 * Focus session state machine. Pure and deterministic: time only advances
 * through `tick`, so it is trivially testable and pause/resume is exact.
 */

export type SessionPhase = 'idle' | 'focus' | 'paused' | 'break' | 'complete';

export interface SessionState {
  phase: SessionPhase;
  /** Planned focus length in seconds. */
  durationSec: number;
  /** Focus seconds already spent (never exceeds durationSec). */
  elapsedSec: number;
  /** Task currently being focused on, if any. */
  taskId: string | null;
  /** Seconds left in the current break (break phase only). */
  breakRemainingSec: number;
}

export type SessionEvent =
  | { type: 'focus-complete'; taskId: string | null; minutes: number }
  | { type: 'break-complete' };

export const DURATION_PRESETS_MIN = [1, 10, 25] as const;
export const DEFAULT_BREAK_SEC = 64; // four 16-second box-breathing cycles

export function createSession(durationMin = 25): SessionState {
  return {
    phase: 'idle',
    durationSec: Math.round(durationMin * 60),
    elapsedSec: 0,
    taskId: null,
    breakRemainingSec: 0,
  };
}

export function setDuration(s: SessionState, durationMin: number): SessionState {
  if (s.phase === 'focus' || s.phase === 'paused') return s;
  const clamped = Math.min(120, Math.max(1, durationMin));
  return { ...s, durationSec: Math.round(clamped * 60), elapsedSec: 0 };
}

export function startFocus(s: SessionState, taskId: string | null): SessionState {
  if (s.phase === 'focus' || s.phase === 'paused') {
    // Swapping the card mid-session keeps the clock running.
    return { ...s, taskId };
  }
  return { ...s, phase: 'focus', elapsedSec: 0, taskId, breakRemainingSec: 0 };
}

export function pause(s: SessionState): SessionState {
  return s.phase === 'focus' ? { ...s, phase: 'paused' } : s;
}

export function resume(s: SessionState): SessionState {
  return s.phase === 'paused' ? { ...s, phase: 'focus' } : s;
}

export function togglePause(s: SessionState): SessionState {
  return s.phase === 'focus' ? pause(s) : resume(s);
}

/** Abandon the current focus/break and return to idle (no reward). */
export function cancel(s: SessionState): SessionState {
  return { ...s, phase: 'idle', elapsedSec: 0, taskId: null, breakRemainingSec: 0 };
}

export function startBreak(s: SessionState, seconds = DEFAULT_BREAK_SEC): SessionState {
  if (s.phase === 'focus' || s.phase === 'paused') return s;
  return { ...s, phase: 'break', breakRemainingSec: seconds };
}

export interface TickResult {
  state: SessionState;
  events: SessionEvent[];
}

export function tick(s: SessionState, dtSec: number): TickResult {
  const dt = Number.isFinite(dtSec) && dtSec > 0 ? Math.min(dtSec, 5) : 0;
  if (dt === 0) return { state: s, events: [] };
  if (s.phase === 'focus') {
    const elapsed = s.elapsedSec + dt;
    if (elapsed >= s.durationSec) {
      return {
        state: { ...s, phase: 'complete', elapsedSec: s.durationSec },
        events: [
          {
            type: 'focus-complete',
            taskId: s.taskId,
            minutes: Math.round(s.durationSec / 60),
          },
        ],
      };
    }
    return { state: { ...s, elapsedSec: elapsed }, events: [] };
  }
  if (s.phase === 'break') {
    const left = s.breakRemainingSec - dt;
    if (left <= 0) {
      return {
        state: { ...s, phase: 'idle', breakRemainingSec: 0, taskId: null, elapsedSec: 0 },
        events: [{ type: 'break-complete' }],
      };
    }
    return { state: { ...s, breakRemainingSec: left }, events: [] };
  }
  return { state: s, events: [] };
}

/** 0..1 progress of the focus block. */
export function progress(s: SessionState): number {
  if (s.durationSec <= 0) return 0;
  if (s.phase === 'complete') return 1;
  return Math.min(1, Math.max(0, s.elapsedSec / s.durationSec));
}

export function remainingSec(s: SessionState): number {
  if (s.phase === 'break') return Math.max(0, s.breakRemainingSec);
  if (s.phase === 'complete') return 0;
  return Math.max(0, s.durationSec - s.elapsedSec);
}

export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** Sanitise an untrusted persisted session (e.g. from localStorage). */
export function reviveSession(raw: unknown): SessionState | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const phases: SessionPhase[] = ['idle', 'focus', 'paused', 'break', 'complete'];
  if (!phases.includes(r.phase as SessionPhase)) return null;
  const num = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d;
  const durationSec = Math.min(7200, Math.max(60, num(r.durationSec, 1500)));
  let phase = r.phase as SessionPhase;
  // A session that was running when the app closed comes back paused:
  // the user gets a clean resume instead of losing (or silently gaining) time.
  if (phase === 'focus') phase = 'paused';
  return {
    phase,
    durationSec,
    elapsedSec: Math.min(durationSec, num(r.elapsedSec, 0)),
    taskId: typeof r.taskId === 'string' ? r.taskId : null,
    breakRemainingSec: num(r.breakRemainingSec, 0),
  };
}
