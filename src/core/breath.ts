/** Box breathing (4-4-4-4) used for the wind-down break between blocks. */

export interface BreathFrame {
  label: 'Breathe in' | 'Hold' | 'Breathe out' | 'Rest';
  /** 0 = empty lungs, 1 = full; drives the orb scale. */
  fullness: number;
  /** 0..1 progress within the current phase. */
  phaseProgress: number;
  cycle: number;
}

export const BOX = [4, 4, 4, 4] as const;

const smooth = (x: number) => x * x * (3 - 2 * x);

export function breathAt(tSec: number, pattern: readonly number[] = BOX): BreathFrame {
  const total = pattern.reduce((a, b) => a + b, 0);
  const t = Math.max(0, tSec);
  const cycle = Math.floor(t / total);
  let local = t - cycle * total;
  const labels: BreathFrame['label'][] = ['Breathe in', 'Hold', 'Breathe out', 'Rest'];
  for (let i = 0; i < 4; i++) {
    const len = pattern[i];
    if (local < len || i === 3) {
      const p = len > 0 ? Math.min(1, local / len) : 1;
      const fullness = i === 0 ? smooth(p) : i === 1 ? 1 : i === 2 ? 1 - smooth(p) : 0;
      return { label: labels[i], fullness, phaseProgress: p, cycle };
    }
    local -= len;
  }
  /* c8 ignore next */
  return { label: 'Rest', fullness: 0, phaseProgress: 1, cycle };
}
