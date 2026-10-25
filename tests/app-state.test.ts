import { describe, expect, it } from 'vitest';
import * as A from '../src/core/app-state';

const now = new Date('2026-11-02T09:00:00');

function run(a: A.AppState, seconds: number) {
  let s = a;
  const events: A.AppEvent[] = [];
  for (let i = 0; i < seconds; i++) {
    const r = A.tick(s, 1, now);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}

describe('Desk Bloom app flow', () => {
  it('first run: 1-minute taster, coach teaches pinch then drop, payoff sprouts the seed', () => {
    let a = A.createApp();
    expect(a.settings.durationMin).toBe(1);
    expect(A.coach(a, now).title).toBe('Pinch a card');
    a = A.grabCard(a, 't2');
    expect(A.coach(a, now).title).toBe('Drop it in the ring');
    const r = A.focusCard(a, 't2');
    expect(r.events).toEqual([{ type: 'focus-started', taskId: 't2' }]);
    a = r.state;
    expect(a.holding).toBeNull();
    expect(A.coach(a, now).title).toBe('Deep work block');
    const { s, events } = run(a, 61);
    expect(events).toContainEqual({ type: 'focus-complete', minutes: 1, stageUp: true, stage: 'Sprout' });
    expect(s.garden.onboarded).toBe(true);
    expect(s.deck.find((t) => t.id === 't2')?.minutes).toBe(1);
    expect(A.coach(s, now).title).toBe('Block complete');
  });

  it('primary button cycles focus next -> pause -> resume', () => {
    let a = A.createApp({ settings: { durationMin: 10, highContrast: false, calmMotion: false } });
    expect(A.primaryLabel(a)).toBe('Start focus');
    a = A.primary(a).state;
    expect(a.session).toMatchObject({ phase: 'focus', taskId: 't1' });
    expect(A.primaryLabel(a)).toBe('Pause');
    a = A.primary(a).state;
    expect(a.session.phase).toBe('paused');
    a = A.primary(a).state;
    expect(a.session.phase).toBe('focus');
  });

  it('auto-pauses on headset blur', () => {
    const a = A.primary(A.createApp()).state;
    const r = A.onBlur(a);
    expect(r.state.session.phase).toBe('paused');
    expect(r.events).toEqual([{ type: 'paused' }]);
  });

  it('rejects focusing a done card and duration changes mid-block', () => {
    let a = A.completeCard(A.createApp(), 't1').state;
    expect(A.focusCard(a, 't1').events[0].type).toBe('rejected');
    a = A.focusCard(a, 't2').state;
    expect(A.chooseDuration(a, 25).events[0].type).toBe('rejected');
  });

  it('finishing a card early credits the whole minutes worked', () => {
    let a = A.createApp({ settings: { durationMin: 25, highContrast: false, calmMotion: false } });
    a = A.focusCard(a, 't3').state;
    a = run(a, 125).s;
    const r = A.completeCard(a, 't3');
    expect(r.state.garden.totalMinutes).toBe(2);
    expect(r.state.session.phase).toBe('idle');
    expect(r.state.deck[2]).toMatchObject({ status: 'done', minutes: 2 });
  });

  it('break then back to idle; ending early gives no reward', () => {
    let a = A.createApp();
    a = A.startBreak(a).state;
    expect(a.session.phase).toBe('break');
    expect(A.coach(a).title).toBe('Breathe with the orb');
    const { s, events } = run(a, 70);
    expect(events).toContainEqual({ type: 'break-complete' });
    expect(s.session.phase).toBe('idle');
    let b = A.focusCard(s, 't1').state;
    b = run(b, 30).s;
    b = A.endBlock(b).state;
    expect(b.garden.totalMinutes).toBe(0);
    expect(b.deck[0].status).toBe('todo');
  });

  it('desk cleared message when all cards are done', () => {
    let a = A.createApp();
    for (const t of a.deck) a = A.completeCard(a, t.id).state;
    expect(A.coach(a).title).toBe('Desk cleared');
    expect(A.primary(a).events[0].type).toBe('rejected');
  });

  it('persists and revives, resuming a running block as paused', () => {
    let a = A.focusCard(A.createApp(), 't1').state;
    a = run(a, 20).s;
    const back = A.revive(JSON.parse(JSON.stringify(A.snapshot(a))));
    expect(back.session).toMatchObject({ phase: 'paused', taskId: 't1', elapsedSec: 20 });
    expect(back.deck[0].status).toBe('focus');
    expect(A.revive('garbage').deck).toHaveLength(4);
  });

  it('streak reminder for returning users', () => {
    let a = A.createApp();
    a = run(A.focusCard(a, 't1').state, 61).s; // 2026-11-02
    const tomorrow = new Date('2026-11-03T08:00:00');
    expect(A.coach(A.endBlock(a).state, tomorrow).title).toBe('Keep your 1-day streak');
    expect(A.statsLine(a, now)).toContain('1-day streak');
  });

  it('edits the deck from the 2D page', () => {
    const a = A.setDeckTitles(A.createApp(), ['Write report', 'Call mom']);
    expect(a.deck.map((t) => t.title)).toEqual(['Write report', 'Call mom']);
  });
});
