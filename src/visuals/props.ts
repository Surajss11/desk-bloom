import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Palette } from './palette.js';

/** Felt desk mat: frames the kit on a real desk and on the virtual one. */
export function createMat(width = 0.62, depth = 0.4) {
  const mat = new MeshStandardMaterial({ color: 0x23302a, roughness: 1, transparent: true, opacity: 0.82 });
  const mesh = new Mesh(new PlaneGeometry(width, depth), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0015;
  mesh.receiveShadow = true;
  mesh.name = 'Desk Mat';
  return { mesh, mat };
}

/** Glass jar where finished cards go. */
export function createJar() {
  const g = new Group();
  g.name = 'Done Jar';
  const glass = new Mesh(
    new CylinderGeometry(0.05, 0.046, 0.075, 28, 1, true),
    new MeshStandardMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.28, roughness: 0.1, side: 2 }),
  );
  glass.position.y = 0.0375;
  const base = new Mesh(
    new CylinderGeometry(0.046, 0.046, 0.004, 28),
    new MeshStandardMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.5 }),
  );
  base.position.y = 0.002;
  const rimMat = new MeshStandardMaterial({ color: 0x7be0a6, emissive: 0x7be0a6, emissiveIntensity: 0.2 });
  const rim = new Mesh(new CylinderGeometry(0.051, 0.051, 0.005, 28, 1, true), rimMat);
  rim.position.y = 0.075;
  g.add(glass, base, rim);
  return { group: g, rimMat };
}

/**
 * Seven pebbles = the last seven days. Brighter = more focus that day;
 * today's pebble sits slightly raised. A glance tells you your streak.
 */
export class WeekStones {
  readonly root = new Group();
  private mesh: InstancedMesh;
  private key = '';
  private c = new Color();

  constructor() {
    this.root.name = 'Week Stones';
    this.mesh = new InstancedMesh(
      new SphereGeometry(0.011, 14, 10),
      new MeshStandardMaterial({ roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.15 }),
      7,
    );
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3(1, 0.55, 1);
    for (let i = 0; i < 7; i++) {
      m.compose(new Vector3((i - 3) * 0.028, 0.006 + (i === 6 ? 0.004 : 0), 0), q, s);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, this.c.setHex(0x55605a));
    }
    this.root.add(this.mesh);
  }

  update(minutes: number[], pal: Palette) {
    const key = `${minutes.join(',')}|${pal.accent}`;
    if (key === this.key) return;
    this.key = key;
    const off = new Color(0x55605a);
    const on = new Color(pal.accent);
    minutes.forEach((min, i) => {
      const t = min <= 0 ? 0 : Math.min(1, 0.35 + min / 60);
      this.mesh.setColorAt(i, this.c.copy(off).lerp(on, t));
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Breathing orb for the wind-down break. */
export function createOrb() {
  const mat = new MeshStandardMaterial({
    color: 0x9fd8ff,
    emissive: 0x5fb4ff,
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2,
  });
  const orb = new Mesh(new SphereGeometry(1, 32, 20), mat);
  orb.name = 'Breath Orb';
  orb.visible = false;
  return { orb, mat };
}

/** Petal burst that celebrates a finished block. */
export class PetalBurst {
  static readonly COUNT = 28;
  readonly mesh: InstancedMesh;
  private vel: Vector3[] = [];
  private pos: Vector3[] = [];
  private age = 99;
  private m = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3();
  private mat: MeshBasicMaterial;

  constructor() {
    this.mat = new MeshBasicMaterial({
      color: 0xffb3c7,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: 2,
    });
    this.mesh = new InstancedMesh(new PlaneGeometry(0.012, 0.008), this.mat, PetalBurst.COUNT);
    this.mesh.name = 'Petal Burst';
    this.mesh.frustumCulled = false;
    for (let i = 0; i < PetalBurst.COUNT; i++) {
      this.vel.push(new Vector3());
      this.pos.push(new Vector3());
    }
    this.mesh.visible = false;
  }

  fire(originY: number, pal: Palette) {
    this.age = 0;
    this.mat.color.setHex(pal.cardBg === '#000000' ? pal.accent : 0xffb3c7);
    for (let i = 0; i < PetalBurst.COUNT; i++) {
      const a = (i / PetalBurst.COUNT) * Math.PI * 2;
      const r = 0.12 + ((i * 37) % 10) / 40;
      this.vel[i].set(Math.cos(a) * r * 0.5, 0.35 + ((i * 13) % 7) / 20, Math.sin(a) * r * 0.5);
      this.pos[i].set(0, originY, 0);
    }
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.age > 2.2) {
      this.mesh.visible = false;
      return;
    }
    this.age += dt;
    this.mat.opacity = Math.max(0, 1 - this.age / 2.2);
    for (let i = 0; i < PetalBurst.COUNT; i++) {
      this.vel[i].y -= dt * 0.45;
      this.vel[i].multiplyScalar(1 - dt * 0.9);
      this.pos[i].addScaledVector(this.vel[i], dt);
      this.q.setFromAxisAngle(this.s.set(0.3, 1, 0.2).normalize(), this.age * 6 + i);
      this.m.compose(this.pos[i], this.q, this.s.set(1, 1, 1));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
