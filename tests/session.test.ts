import { describe, expect, it } from 'vitest';
import * as S from '../src/core/session';

describe('focus session', () => {
  it('runs a full block and emits exactly one completion', () => {
    let s = S.startFocus(S.createSession(1), 't1');
    expect(s.phase).toBe('focus');
    let events: S.SessionEvent[] = [];
    for (let i = 0; i < 70; i++) {
      const r = S.tick(s, 1);
      s = r.state;
      events = events.concat(r.events);
    }
    expect(s.phase).toBe('complete');
    expect(events).toEqual([{ type: 'focus-complete', taskId: 't1', minutes: 1 }]);
    expect(S.progress(s)).toBe(1);
  });

  it('pause freezes time and resume continues exactly', () => {
    let s = S.startFocus(S.createSession(10), null);
    for (let i = 0; i < 30; i++) s = S.tick(s, 1).state;
    s = S.pause(s);
    s = S.tick(s, 500).state;
    expect(s.elapsedSec).toBe(30);
    s = S.resume(s);
    s = S.tick(s, 2).state;
    expect(s.elapsedSec).toBe(32);
    expect(S.remainingSec(s)).toBe(568);
  });

  it('clamps bad or huge frame deltas (tab sleep, NaN)', () => {
    const s = S.startFocus(S.createSession(10), null);
    expect(S.tick(s, Number.NaN).state.elapsedSec).toBe(0);
    expect(S.tick(s, -3).state.elapsedSec).toBe(0);
    expect(S.tick(s, 999).state.elapsedSec).toBe(5);
  });

  it('cannot change duration mid-block', () => {
    const s = S.startFocus(S.createSession(25), null);
    expect(S.setDuration(s, 1).durationSec).toBe(1500);
    expect(S.setDuration(S.createSession(25), 500).durationSec).toBe(7200);
  });

  it('break counts down and returns to idle', () => {
    let s = S.startBreak(S.createSession(1), 10);
    expect(s.phase).toBe('break');
    const r = S.tick(S.tick(s, 5).state, 5);
    s = r.state;
    expect(s.phase).toBe('idle');
    expect(r.events).toEqual([{ type: 'break-complete' }]);
  });

  it('formats a clock', () => {
    expect(S.formatClock(0)).toBe('00:00');
    expect(S.formatClock(59.2)).toBe('01:00');
    expect(S.formatClock(1500)).toBe('25:00');
  });

  it('revives a running session as paused and rejects junk', () => {
    const r = S.reviveSession({ phase: 'focus', durationSec: 600, elapsedSec: 9999, taskId: 't2' });
    expect(r).toMatchObject({ phase: 'paused', elapsedSec: 600, taskId: 't2' });
    expect(S.reviveSession({ phase: 'party' })).toBeNull();
    expect(S.reviveSession('x')).toBeNull();
  });
});
