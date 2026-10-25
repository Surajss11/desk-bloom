import { describe, expect, it } from 'vitest';
import * as G from '../src/core/garden';

const d = (s: string) => new Date(`${s}T10:00:00`);

describe('garden progression', () => {
  it('first minute sprouts the seed', () => {
    const g = G.recordSession(G.createGarden(), 1, d('2026-11-01'));
    expect(G.stageFor(g.totalMinutes).name).toBe('Sprout');
    expect(g.streakDays).toBe(1);
  });

  it('builds and breaks streaks by local calendar day', () => {
    let g = G.createGarden();
    g = G.recordSession(g, 25, d('2026-11-01'));
    g = G.recordSession(g, 25, d('2026-11-01'));
    expect(g.streakDays).toBe(1);
    g = G.recordSession(g, 10, d('2026-11-02'));
    g = G.recordSession(g, 10, d('2026-11-03'));
    expect(g.streakDays).toBe(3);
    expect(G.liveStreak(g, d('2026-11-04'))).toBe(3);
    expect(G.liveStreak(g, d('2026-11-05'))).toBe(0);
    g = G.recordSession(g, 10, d('2026-11-06'));
    expect(g.streakDays).toBe(1);
    expect(g.bestStreak).toBe(3);
  });

  it('streak crosses month and year boundaries', () => {
    let g = G.recordSession(G.createGarden(), 5, d('2026-12-31'));
    g = G.recordSession(g, 5, d('2027-01-01'));
    expect(g.streakDays).toBe(2);
  });

  it('stage thresholds and continuous growth', () => {
    expect(G.stageFor(0).name).toBe('Seed');
    expect(G.stageFor(60).name).toBe('Sapling');
    expect(G.stageFor(10_000).name).toBe('Full Bloom');
    expect(G.minutesToNextStage(10_000)).toBeNull();
    expect(G.minutesToNextStage(50)).toBe(10);
    expect(G.growth(40)).toBeCloseTo(2.5, 5);
    expect(G.growth(10_000)).toBe(G.STAGES.length - 1);
  });

  it('seven-day strip is oldest-first and includes today', () => {
    let g = G.recordSession(G.createGarden(), 7, d('2026-11-01'));
    g = G.recordSession(g, 3, d('2026-11-07'));
    expect(G.lastSevenDays(g, d('2026-11-07'))).toEqual([7, 0, 0, 0, 0, 0, 3]);
    expect(G.minutesToday(g, d('2026-11-07'))).toBe(3);
  });

  it('prunes old history', () => {
    let g = G.recordSession(G.createGarden(), 7, d('2026-01-01'));
    g = G.recordSession(g, 1, d('2026-06-01'));
    expect(Object.keys(g.history)).toEqual(['2026-06-01']);
  });

  it('revives safely from corrupted storage', () => {
    const g = G.reviveGarden({ totalMinutes: -5, sessions: 'x', history: { bad: 3, '2026-11-01': 4 }, onboarded: true });
    expect(g.totalMinutes).toBe(0);
    expect(g.sessions).toBe(0);
    expect(g.history).toEqual({ '2026-11-01': 4 });
    expect(g.onboarded).toBe(true);
    expect(G.reviveGarden(null)).toEqual(G.createGarden());
  });
});
