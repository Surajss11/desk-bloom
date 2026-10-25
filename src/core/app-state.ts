/**
 * Desk Bloom application model. Everything the user can do is a pure action
 * on this state, so hands, gaze+pinch, controllers, poke and the 2D page all
 * share one tested code path.
 */
import * as G from './garden.js';
import * as S from './session.js';
import * as T from './tasks.js';

export interface Settings {
  highContrast: boolean;
  calmMotion: boolean;
  durationMin: number;
}

export interface AppState {
  session: S.SessionState;
  garden: G.GardenState;
  deck: T.Task[];
  settings: Settings;
  /** Card currently held in a hand, if any (transient, not persisted). */
  holding: string | null;
  /** Minutes earned by the last finished block (for the celebration). */
  lastReward: number;
  /** Did the last reward move the plant to a new stage? */
  lastStageUp: boolean;
}

export type AppEvent =
  | { type: 'focus-started'; taskId: string | null }
  | { type: 'focus-complete'; minutes: number; stageUp: boolean; stage: string }
  | { type: 'task-done'; taskId: string }
  | { type: 'break-started' }
  | { type: 'break-complete' }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'ended' }
  | { type: 'rejected'; reason: string };

export interface Step {
  state: AppState;
  events: AppEvent[];
}

const step = (state: AppState, ...events: AppEvent[]): Step => ({ state, events });

export function createApp(partial: Partial<AppState> = {}): AppState {
  const settings: Settings = { highContrast: false, calmMotion: false, durationMin: 25, ...partial.settings };
  const garden = partial.garden ?? G.createGarden();
  // First-ever run defaults to the 1-minute taster so the payoff lands
  // before the user takes the headset off.
  if (!partial.settings && !garden.onboarded) settings.durationMin = 1;
  return {
    session: partial.session ?? S.createSession(settings.durationMin),
    garden,
    deck: partial.deck ?? T.createDeck(),
    settings,
    holding: null,
    lastReward: 0,
    lastStageUp: false,
  };
}

export function chooseDuration(a: AppState, minutes: number): Step {
  if (a.session.phase === 'focus' || a.session.phase === 'paused') {
    return step(a, { type: 'rejected', reason: 'Finish or end this block first' });
  }
  const session = S.setDuration(a.session.phase === 'complete' ? S.cancel(a.session) : a.session, minutes);
  return step({ ...a, session, settings: { ...a.settings, durationMin: minutes } });
}

export function grabCard(a: AppState, id: string): AppState {
  return { ...a, holding: id };
}

export function releaseCard(a: AppState): AppState {
  return { ...a, holding: null };
}

/** A card was dropped into the focus ring (or tapped with gaze/ray). */
export function focusCard(a: AppState, id: string): Step {
  const task = a.deck.find((t) => t.id === id);
  if (!task) return step(a, { type: 'rejected', reason: 'Unknown card' });
  if (task.status === 'done') return step(a, { type: 'rejected', reason: 'That card is already done' });
  if (a.session.phase === 'break') return step(a, { type: 'rejected', reason: 'Finish your breather first' });
  let session = a.session;
  if (session.phase === 'complete') session = S.cancel(session);
  if (session.phase === 'idle') session = S.setDuration(session, a.settings.durationMin);
  session = S.startFocus(session, id);
  return step(
    { ...a, deck: T.focusTask(a.deck, id), session, holding: null },
    { type: 'focus-started', taskId: id },
  );
}

/** Primary button: start with the next card / pause / resume / next. */
export function primary(a: AppState): Step {
  const ph = a.session.phase;
  if (ph === 'focus') return step({ ...a, session: S.pause(a.session) }, { type: 'paused' });
  if (ph === 'paused') return step({ ...a, session: S.resume(a.session) }, { type: 'resumed' });
  if (ph === 'break') return endBlock(a);
  const focused = T.focusedTask(a.deck);
  const next = focused ?? T.nextTodo(a.deck);
  if (!next) return step(a, { type: 'rejected', reason: 'All cards are done. Add new ones on the page.' });
  return focusCard(a, next.id);
}

export function primaryLabel(a: AppState): string {
  switch (a.session.phase) {
    case 'focus':
      return 'Pause';
    case 'paused':
      return 'Resume';
    case 'break':
      return 'Skip break';
    default:
      return T.nextTodo(a.deck) || T.focusedTask(a.deck) ? 'Start focus' : 'All done';
  }
}

/** End the current block or break early (no reward), card stays on desk. */
export function endBlock(a: AppState): Step {
  if (a.session.phase === 'idle') return step(a);
  return step({ ...a, session: S.cancel(a.session), deck: T.releaseFocus(a.deck) }, { type: 'ended' });
}

/** Mark a card done (dropped in the done jar, or "Done" button). */
export function completeCard(a: AppState, id: string): Step {
  const task = a.deck.find((t) => t.id === id);
  if (!task || task.status === 'done') return step(a, { type: 'rejected', reason: 'Nothing to complete' });
  let session = a.session;
  if (a.session.taskId === id && (session.phase === 'focus' || session.phase === 'paused')) {
    // Finishing early still counts the minutes actually worked.
    const worked = Math.floor(session.elapsedSec / 60);
    let next = { ...a, session: S.cancel(session), deck: T.completeTask(T.addMinutes(a.deck, id, worked), id) };
    if (worked > 0) next = reward(next, worked).state;
    return step(next, { type: 'task-done', taskId: id });
  }
  if (session.phase === 'complete' && session.taskId === id) session = S.cancel(session);
  return step({ ...a, session, deck: T.completeTask(a.deck, id) }, { type: 'task-done', taskId: id });
}

function reward(a: AppState, minutes: number, now = new Date()): Step {
  const before = G.stageFor(a.garden.totalMinutes);
  const garden = { ...G.recordSession(a.garden, minutes, now), onboarded: true };
  const after = G.stageFor(garden.totalMinutes);
  const stageUp = after.index > before.index;
  return step(
    { ...a, garden, lastReward: minutes, lastStageUp: stageUp },
    { type: 'focus-complete', minutes, stageUp, stage: after.name },
  );
}

export function startBreak(a: AppState): Step {
  if (a.session.phase === 'focus' || a.session.phase === 'paused') {
    return step(a, { type: 'rejected', reason: 'Pause or end the block first' });
  }
  return step({ ...a, session: S.startBreak(a.session) }, { type: 'break-started' });
}

export function tick(a: AppState, dtSec: number, now = new Date()): Step {
  const r = S.tick(a.session, dtSec);
  if (r.events.length === 0) return r.state === a.session ? step(a) : step({ ...a, session: r.state });
  let next: AppState = { ...a, session: r.state };
  const events: AppEvent[] = [];
  for (const e of r.events) {
    if (e.type === 'focus-complete') {
      next = { ...next, deck: T.addMinutes(next.deck, e.taskId, e.minutes) };
      const rs = reward(next, e.minutes, now);
      next = rs.state;
      events.push(...rs.events);
    } else {
      events.push({ type: 'break-complete' });
    }
  }
  return { state: next, events };
}

/** Pause automatically when the headset is taken off or a system menu opens. */
export function onBlur(a: AppState): Step {
  return a.session.phase === 'focus' ? step({ ...a, session: S.pause(a.session) }, { type: 'paused' }) : step(a);
}

export function toggleContrast(a: AppState): AppState {
  return { ...a, settings: { ...a.settings, highContrast: !a.settings.highContrast } };
}

export function toggleCalm(a: AppState): AppState {
  return { ...a, settings: { ...a.settings, calmMotion: !a.settings.calmMotion } };
}

export function setDeckTitles(a: AppState, titles: string[]): AppState {
  if (a.session.phase === 'focus' || a.session.phase === 'paused') return a;
  return { ...a, deck: T.createDeck(titles), session: S.cancel(a.session) };
}

export interface Coach {
  title: string;
  hint: string;
}

/** Context-aware guidance: teaches the interaction without a wall of text. */
export function coach(a: AppState, now = new Date()): Coach {
  const s = a.session;
  const stage = G.stageFor(a.garden.totalMinutes);
  if (a.holding) return { title: 'Drop it in the ring', hint: 'Release the card over the glowing ring around your plant.' };
  if (s.phase === 'focus') {
    const task = a.deck.find((t) => t.id === s.taskId);
    return { title: task ? task.title : 'Focusing', hint: 'Stay with one thing. Your plant grows when the ring closes.' };
  }
  if (s.phase === 'paused') return { title: 'Paused', hint: 'Pinch Resume when you are ready. Time is safe.' };
  if (s.phase === 'break') return { title: 'Breathe with the orb', hint: 'In as it grows, out as it shrinks. Four slow rounds.' };
  if (s.phase === 'complete') {
    const grew = a.lastStageUp
      ? `Your plant is now a ${stage.name}!`
      : a.lastReward > 0
        ? `+${a.lastReward} min of growth.`
        : `Your ${stage.name} kept growing.`;
    return { title: 'Block complete', hint: `${grew} Drop the card in the jar if it is done, or take a breather.` };
  }
  if (T.allDone(a.deck)) return { title: 'Desk cleared', hint: 'Every card is done. Come back tomorrow to keep your streak.' };
  if (!a.garden.onboarded) return { title: 'Pinch a card', hint: 'Pick up any card on your desk and drop it into the ring.' };
  const streak = G.liveStreak(a.garden, now);
  const today = G.minutesToday(a.garden, now);
  if (today === 0 && streak > 0) return { title: `Keep your ${streak}-day streak`, hint: 'One focus block today keeps it alive.' };
  return { title: 'Pick your next card', hint: 'Drop a card into the ring, or pinch Start focus.' };
}

export function statsLine(a: AppState, now = new Date()): string {
  const stage = G.stageFor(a.garden.totalMinutes);
  const toNext = G.minutesToNextStage(a.garden.totalMinutes);
  const streak = G.liveStreak(a.garden, now);
  const next = G.STAGES[stage.index + 1];
  const parts = [
    toNext == null || !next ? `${stage.name}, fully grown` : `${stage.name}: ${toNext} min to ${next.name}`,
    `${streak}-day streak`,
    `${G.minutesToday(a.garden, now)} min today`,
  ];
  return parts.join(' | ');
}

/** Serializable subset for persistence. */
export function snapshot(a: AppState) {
  return { session: a.session, garden: a.garden, deck: a.deck, settings: a.settings };
}

export function revive(raw: unknown): AppState {
  if (raw == null || typeof raw !== 'object') return createApp();
  const r = raw as Record<string, unknown>;
  const garden = G.reviveGarden(r.garden);
  const deck = T.reviveDeck(r.deck) ?? T.createDeck();
  const rs = (r.settings ?? {}) as Record<string, unknown>;
  const settings: Settings = {
    highContrast: rs.highContrast === true,
    calmMotion: rs.calmMotion === true,
    durationMin:
      typeof rs.durationMin === 'number' && rs.durationMin >= 1 && rs.durationMin <= 120
        ? Math.round(rs.durationMin)
        : garden.onboarded
          ? 25
          : 1,
  };
  let session = S.reviveSession(r.session) ?? S.createSession(settings.durationMin);
  // The deck is the source of truth for which card is in focus.
  if (session.taskId && !deck.some((t) => t.id === session.taskId && t.status === 'focus')) {
    session = S.cancel(session);
  }
  return { ...createApp({ garden, deck, settings, session }), settings };
}
