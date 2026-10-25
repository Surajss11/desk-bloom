import { describe, expect, it } from 'vitest';
import { chooseDesk, fallbackAnchor, SurfaceCandidate, yawFromForward } from '../src/core/desk';

const head: [number, number, number] = [0, 1.2, 0]; // seated eye height

const table: SurfaceCandidate = {
  kind: 'mesh',
  label: 'table',
  min: [-0.6, 0, -1.0],
  max: [0.6, 0.74, -0.4],
  horizontal: true,
};

describe('desk placement', () => {
  it('puts the kit on the real table, inset from the near edge, facing the user', () => {
    const a = chooseDesk([table], head, 0);
    expect(a.source).toBe('table');
    expect(a.position[1]).toBeCloseTo(0.74);
    expect(a.position[2]).toBeLessThan(-0.4);
    expect(a.position[2]).toBeGreaterThan(-0.7);
    expect(Math.abs(a.yaw)).toBeLessThan(0.01); // +Z of kit points at the user
  });

  it('prefers a labelled table over a generic plane', () => {
    const plane: SurfaceCandidate = { ...table, kind: 'plane', label: '', min: [-0.5, 0, -0.7], max: [0.5, 0.7, -0.3] };
    expect(chooseDesk([plane, table], head, 0).source).toBe('table');
    expect(chooseDesk([plane], head, 0).source).toBe('surface');
  });

  it('ignores floors, walls, tiny or far surfaces', () => {
    const floor: SurfaceCandidate = { kind: 'plane', label: 'floor', min: [-3, 0, -3], max: [3, 0, 3], horizontal: true };
    const wall: SurfaceCandidate = { kind: 'plane', label: 'wall', min: [-1, 0, -2], max: [1, 2.5, -2], horizontal: false };
    const tiny: SurfaceCandidate = { ...table, min: [0, 0, -0.5], max: [0.1, 0.74, -0.4] };
    const far: SurfaceCandidate = { ...table, min: [-0.5, 0, -4], max: [0.5, 0.74, -3] };
    const shelf: SurfaceCandidate = { ...table, max: [0.6, 1.15, -0.4] };
    const a = chooseDesk([floor, wall, tiny, far, shelf], head, 0);
    expect(a.source).toBe('fallback');
  });

  it('fallback sits in front of and below the eyes along the gaze yaw', () => {
    const a = fallbackAnchor(head, Math.PI / 2); // looking toward -X
    expect(a.position[0]).toBeCloseTo(-0.5);
    expect(a.position[1]).toBeCloseTo(0.78);
    expect(a.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('yawFromForward matches the fallback convention', () => {
    expect(yawFromForward(0, -1)).toBeCloseTo(0);
    expect(yawFromForward(-1, 0)).toBeCloseTo(Math.PI / 2);
  });
});
