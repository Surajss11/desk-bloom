import { describe, expect, it } from 'vitest';
import { breathAt } from '../src/core/breath';
import { loadJSON, MemoryKV, saveJSON } from '../src/core/storage';

describe('box breathing', () => {
  it('follows in-hold-out-rest phases', () => {
    expect(breathAt(0).label).toBe('Breathe in');
    expect(breathAt(2).fullness).toBeCloseTo(0.5);
    expect(breathAt(5)).toMatchObject({ label: 'Hold', fullness: 1 });
    expect(breathAt(10).label).toBe('Breathe out');
    expect(breathAt(13)).toMatchObject({ label: 'Rest', fullness: 0 });
    expect(breathAt(17).cycle).toBe(1);
  });
});

describe('storage', () => {
  it('round-trips and survives corrupt JSON', () => {
    const kv = new MemoryKV();
    expect(saveJSON(kv, 'a', { x: 1 })).toBe(true);
    expect(loadJSON(kv, 'a')).toEqual({ x: 1 });
    kv.setItem('desk-bloom:v1:b', '{oops');
    expect(loadJSON(kv, 'b')).toBeNull();
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(saveJSON(broken, 'a', 1)).toBe(false);
  });
});
