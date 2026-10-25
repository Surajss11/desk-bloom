import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera } from 'three';
import * as F from '../src/core/fov';

describe('FoV-aware layout', () => {
  it('recovers symmetric FoV from a three.js projection matrix', () => {
    const cam = new PerspectiveCamera(90, 1, 0.1, 100);
    const f = F.fovFromProjection(cam.projectionMatrix.elements);
    expect(f.up).toBeCloseTo(45, 4);
    expect(f.left).toBeCloseTo(45, 4);
  });

  it('recovers asymmetric (per-eye) FoV', () => {
    const n = 0.1;
    const t = (deg: number) => Math.tan((deg * Math.PI) / 180) * n;
    const m = new Matrix4().makePerspective(-t(40), t(50), t(30), -t(45), n, 100);
    const f = F.fovFromProjection(m.elements);
    expect(f.left).toBeCloseTo(40, 3);
    expect(f.right).toBeCloseTo(50, 3);
    expect(f.up).toBeCloseTo(30, 3);
    expect(f.down).toBeCloseTo(45, 3);
  });

  it('comfort zone shrinks for narrow devices (Meta VR Glasses-like)', () => {
    const quest = F.comfortZone({ left: 48, right: 48, up: 48, down: 50 });
    const glasses = F.comfortZone({ left: 37, right: 37, up: 25, down: 43 });
    expect(quest.halfH).toBe(30);
    expect(glasses.halfH).toBeCloseTo(29.6, 5);
    expect(glasses.up).toBe(15);
    const tiny = F.comfortZone({ left: 20, right: 20, up: 10, down: 10 });
    expect(tiny.halfH).toBe(16);
    expect(tiny.up).toBe(8);
  });

  it('arc layout keeps every item inside the comfort zone', () => {
    const zone = F.comfortZone({ left: 37, right: 37, up: 25, down: 43 });
    const items = F.arcLayout(4, 0.45, zone.halfH);
    expect(items).toHaveLength(4);
    for (const it of items) {
      expect(F.inComfortZone({ x: it.x, y: -0.3, z: it.z }, zone)).toBe(true);
    }
    expect(F.arcLayout(1, 1, 30)).toEqual([{ x: 0, z: -1, yaw: 0 }]);
    expect(F.arcLayout(0, 1, 30)).toEqual([]);
  });

  it('width and angle helpers are inverse', () => {
    const w = F.maxWidthFor(15, 0.7);
    expect(F.angularHalfWidth(w, 0.7)).toBeCloseTo(15, 6);
  });

  it('rejects points behind the user', () => {
    expect(F.inComfortZone({ x: 0, y: 0, z: 1 }, F.ERGONOMIC)).toBe(false);
  });
});
