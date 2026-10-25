import {
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector2,
} from '@iwsdk/core';

/**
 * Procedural desk plant. `setGrowth(g)` takes the continuous growth value
 * from the garden model (0 = seed ... 6 = full bloom) so every minute of focus
 * is visible, not only stage jumps.
 */
export class Plant {
  readonly root = new Group();
  private stem: Mesh;
  private seed: Mesh;
  private leaves: Mesh[] = [];
  private flowers: Group[] = [];
  private shown = 0;
  private target = 0;
  private swayT = 0;
  private stemMat: MeshStandardMaterial;
  private leafMat: MeshStandardMaterial;
  calm = false;

  static readonly POT_HEIGHT = 0.062;

  constructor() {
    this.root.name = 'Desk Plant';
    const pts = [
      new Vector2(0.0, 0),
      new Vector2(0.032, 0),
      new Vector2(0.036, 0.004),
      new Vector2(0.043, 0.05),
      new Vector2(0.049, 0.054),
      new Vector2(0.049, 0.062),
      new Vector2(0.044, 0.062),
      new Vector2(0.041, 0.056),
    ];
    const pot = new Mesh(
      new LatheGeometry(pts, 28),
      new MeshStandardMaterial({ color: 0xc8714f, roughness: 0.85 }),
    );
    pot.castShadow = true;
    const soil = new Mesh(
      new CylinderGeometry(0.041, 0.041, 0.004, 24),
      new MeshStandardMaterial({ color: 0x3b2a20, roughness: 1 }),
    );
    soil.position.y = 0.054;
    this.root.add(pot, soil);

    this.seed = new Mesh(
      new SphereGeometry(0.008, 12, 8),
      new MeshStandardMaterial({ color: 0xd9b06a, emissive: 0x4a3510, roughness: 0.6 }),
    );
    this.seed.scale.set(1, 0.7, 1);
    this.seed.position.y = 0.059;
    this.root.add(this.seed);

    this.stemMat = new MeshStandardMaterial({ color: 0x4f9a5b, roughness: 0.7 });
    const stemGeo = new CylinderGeometry(0.0022, 0.0034, 1, 8);
    stemGeo.translate(0, 0.5, 0);
    this.stem = new Mesh(stemGeo, this.stemMat);
    this.stem.position.y = Plant.POT_HEIGHT - 0.006;
    this.stem.scale.set(1, 0.0001, 1);
    this.root.add(this.stem);

    this.leafMat = new MeshStandardMaterial({ color: 0x6cc27a, roughness: 0.6 });
    const leafGeo = new SphereGeometry(1, 12, 8);
    leafGeo.translate(1, 0, 0); // pivot at the leaf base
    for (let i = 0; i < 8; i++) {
      const leaf = new Mesh(leafGeo, this.leafMat);
      leaf.rotation.set(0, (i * 137.5 * Math.PI) / 180, 0.5);
      leaf.scale.setScalar(0.0001);
      this.leaves.push(leaf);
      this.root.add(leaf);
    }

    const petalGeo = new SphereGeometry(1, 10, 6);
    petalGeo.translate(1, 0, 0);
    const petalColors = [0xff9fb5, 0xffc0a3, 0xf6a5ff];
    for (let f = 0; f < 3; f++) {
      const head = new Group();
      const petalMat = new MeshStandardMaterial({ color: petalColors[f], roughness: 0.5 });
      for (let p = 0; p < 6; p++) {
        const petal = new Mesh(petalGeo, petalMat);
        petal.rotation.set(0, (p / 6) * Math.PI * 2, 0.35);
        petal.scale.set(0.018, 0.004, 0.011);
        head.add(petal);
      }
      const center = new Mesh(
        new SphereGeometry(0.007, 10, 8),
        new MeshStandardMaterial({ color: 0xffd257, emissive: 0x553300 }),
      );
      head.add(center);
      head.scale.setScalar(0.0001);
      this.flowers.push(head);
      this.root.add(head);
    }
  }

  setGrowth(g: number, instant = false) {
    this.target = g;
    if (instant) {
      this.shown = g;
      this.apply();
    }
  }

  /** Returns true while still animating. */
  update(dt: number): boolean {
    const diff = this.target - this.shown;
    const animating = Math.abs(diff) > 0.001;
    if (animating) {
      const speed = this.calm ? 0.6 : 1.4;
      this.shown += Math.sign(diff) * Math.min(Math.abs(diff), dt * speed);
    }
    this.swayT += dt;
    this.apply();
    return animating;
  }

  private apply() {
    const g = this.shown;
    // Height grows quickly early, then slows (like a real plant).
    const height = g <= 0 ? 0 : 0.02 + 0.2 * (1 - Math.exp(-g / 2.6));
    this.stem.scale.set(1 + g * 0.18, Math.max(0.0001, height), 1 + g * 0.18);
    this.seed.visible = g < 1.2;
    const sway = this.calm ? 0 : Math.sin(this.swayT * 0.9) * 0.025 * Math.min(1, g);
    this.stem.rotation.z = sway;

    const base = this.stem.position.y;
    this.leaves.forEach((leaf, i) => {
      // Leaves appear one by one from g = 0.6 on, spiralling up the stem.
      const born = Math.min(1, Math.max(0, (g - 0.6 - i * 0.55) / 0.5));
      const size = born * (0.016 + Math.min(g, 5) * 0.003);
      leaf.visible = born > 0;
      leaf.scale.set(Math.max(0.0001, size), Math.max(0.0001, size * 0.18), Math.max(0.0001, size * 0.45));
      const h = height * (0.12 + (i / 8) * 0.7);
      leaf.position.set(-Math.sin(sway) * h, base + h, 0);
    });

    const tipY = this.stem.position.y + height;
    this.flowers.forEach((head, i) => {
      const open = Math.min(1, Math.max(0, (g - 4 - i * 0.7) / 0.8));
      head.scale.setScalar(Math.max(0.0001, open));
      if (i === 0) head.position.set(-Math.sin(sway) * height, tipY + 0.004, 0);
      else {
        const a = i === 1 ? 0.9 : -1.4;
        head.position.set(Math.cos(a) * 0.035, tipY * 0.72, Math.sin(a) * 0.035);
      }
    });
  }

  setContrast(on: boolean) {
    this.leafMat.color.setHex(on ? 0x00ff66 : 0x6cc27a);
    this.stemMat.color.setHex(on ? 0x00cc55 : 0x4f9a5b);
  }
}
