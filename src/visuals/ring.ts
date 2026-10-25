import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
} from '@iwsdk/core';
import type { Palette } from './palette.js';

/**
 * The focus ring: a bead circle on the desk around the plant. It is the drop
 * target for cards and fills bead by bead as the block progresses.
 */
export class FocusRing {
  static readonly RADIUS = 0.115;
  static readonly BEADS = 48;
  readonly root = new Group();
  private beads: InstancedMesh;
  private halo: Mesh;
  private haloMat: MeshBasicMaterial;
  private lit = -1;
  private mode = '';
  private tmp = new Color();
  private t = 0;
  calm = false;

  constructor() {
    this.root.name = 'Focus Ring';
    const mat = new MeshStandardMaterial({ roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.35 });
    this.beads = new InstancedMesh(new SphereGeometry(0.0055, 10, 8), mat, FocusRing.BEADS);
    const m = new Matrix4();
    for (let i = 0; i < FocusRing.BEADS; i++) {
      // Start at 12 o'clock (far side) and run clockwise as seen from above.
      const a = -Math.PI / 2 + (i / FocusRing.BEADS) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * FocusRing.RADIUS, 0.006, Math.sin(a) * FocusRing.RADIUS);
      this.beads.setMatrixAt(i, m);
      this.beads.setColorAt(i, new Color(0x3c4a44));
    }
    this.haloMat = new MeshBasicMaterial({ color: 0xb6ffd6, transparent: true, opacity: 0, depthWrite: false });
    this.halo = new Mesh(new RingGeometry(FocusRing.RADIUS - 0.012, FocusRing.RADIUS + 0.012, 64), this.haloMat);
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.002;
    this.root.add(this.beads, this.halo);
  }

  /**
   * @param progress 0..1 of the focus block
   * @param state 'idle' | 'target' (a card is held) | 'focus' | 'paused' | 'complete'
   */
  update(dt: number, progress: number, state: string, pal: Palette) {
    this.t += dt;
    const lit = Math.round(progress * FocusRing.BEADS);
    const modeKey = `${state}:${pal.accent}`;
    if (lit !== this.lit || modeKey !== this.mode) {
      this.lit = lit;
      this.mode = modeKey;
      const on = state === 'paused' ? pal.paused : pal.accent;
      for (let i = 0; i < FocusRing.BEADS; i++) {
        let c: number = pal.ringIdle;
        if (state === 'target') c = pal.ringTarget;
        else if (state === 'complete') c = pal.accent;
        else if (i < lit) c = on;
        else if (state === 'focus' || state === 'paused') c = pal.accentDim;
        this.beads.setColorAt(i, this.tmp.setHex(c));
      }
      if (this.beads.instanceColor) this.beads.instanceColor.needsUpdate = true;
      this.haloMat.color.setHex(pal.ringTarget);
    }
    // The halo pulses while a card is held, showing where to drop it.
    const pulse = this.calm ? 0.5 : 0.5 + 0.5 * Math.sin(this.t * 5);
    const target = state === 'target' ? 0.25 + 0.35 * pulse : state === 'complete' ? 0.25 : 0;
    this.haloMat.opacity += (target - this.haloMat.opacity) * Math.min(1, dt * 8);
    this.halo.visible = this.haloMat.opacity > 0.01;
  }
}
