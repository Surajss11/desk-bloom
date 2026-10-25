import {
  Box3,
  BoxGeometry,
  createSystem,
  Entity,
  Euler,
  Grabbed,
  Hovered,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OneHandGrabbable,
  PokeInteractable,
  Quaternion,
  RayInteractable,
  UIKit,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import * as A from '../core/app-state.js';
import { breathAt } from '../core/breath.js';
import { chooseDesk, fallbackAnchor, SurfaceCandidate, yawFromForward } from '../core/desk.js';
import { binocularFov, ComfortZone, comfortZone, ERGONOMIC, fovFromProjection, maxWidthFor } from '../core/fov.js';
import { growth, lastSevenDays } from '../core/garden.js';
import { formatClock, progress, remainingSec } from '../core/session.js';
import { loadJSON, safeStorage, saveJSON } from '../core/storage.js';
import { Sound } from '../audio.js';
import { DeskKit, TaskCardTag } from '../components.js';
import { TaskCard, CARD_H } from '../visuals/card.js';
import { PALETTE, Palette } from '../visuals/palette.js';
import { Plant } from '../visuals/plant.js';
import { createJar, createMat, createOrb, PetalBurst, WeekStones } from '../visuals/props.js';
import { FocusRing } from '../visuals/ring.js';

/* Kit-local layout (metres). Origin = point on the desk surface, +Z = toward the user. */
const USER = new Vector3(0, 0.42, 0.45);
const PLANT = new Vector3(0, 0, 0);
const JAR = new Vector3(0.215, 0, -0.1);
const FOCUS_SLOT = new Vector3(0, 0.004 + CARD_H / 2, 0.14);
const PANEL_POS = new Vector3(0, 0.27, -0.25);
const PANEL_NATURAL_W = 4.1;
const RING_DROP_RADIUS = 0.17;
const JAR_DROP_RADIUS = 0.1;
const BROWSER_DESK_TOP = 0.74;

const STORAGE_KEY = 'state';

interface CardRig {
  card: TaskCard;
  entity: Entity;
  home: Vector3;
  homeQ: Quaternion;
}

/** Everything the 2D page and tests can observe/drive. */
export interface DeskBloomApi {
  getState(): A.AppState;
  dispatch(action: string, arg?: string | number): void;
  placement(): { source: string; zone: ComfortZone; head: number[]; surfaces: SurfaceCandidate[] };
  setTitles(titles: string[]): void;
  subscribe(fn: (s: A.AppState) => void): () => void;
  /** World positions of interactive things, for automation and emulators. */
  targets(): Record<string, [number, number, number]>;
}

export class BloomSystem extends createSystem({
  cards: { required: [TaskCardTag] },
  grabbedCards: { required: [TaskCardTag, Grabbed] },
  hoveredCards: { required: [TaskCardTag, Hovered] },
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  private app!: A.AppState;
  private kv = safeStorage();
  private sound = new Sound();
  private kit!: Entity;
  private plant = new Plant();
  private ring = new FocusRing();
  private stones = new WeekStones();
  private burst = new PetalBurst();
  private jar = createJar();
  private mat = createMat();
  private orb = createOrb();
  private browserDesk!: Mesh;
  private rigs = new Map<string, CardRig>();
  private panel: UIKitMLAsset | null = null;
  private panelEntity: Entity | null = null;
  private texts = new Map<string, string>();
  private saveTimer = 0;
  private uiTimer = 0;
  private breathT = 0;
  private lastBreathLabel = '';
  private zone: ComfortZone = { ...ERGONOMIC };
  private placementSource = 'browser';
  private lastSurfaces: SurfaceCandidate[] = [];
  private lastHead: [number, number, number] = [0, 0, 0];
  private placeTimer = -1;
  private autoPlaceUntil = 0;
  private userMoved = false;
  private elapsed = 0;
  private lastWall = -1;
  private listeners = new Set<(s: A.AppState) => void>();
  private toast = '';
  private toastT = 0;
  // scratch
  private v = new Vector3();
  private v2 = new Vector3();
  private q = new Quaternion();
  private e = new Euler(0, 0, 0, 'YXZ');
  private box = new Box3();

  init(): void {
    this.app = A.revive(loadJSON(this.kv, STORAGE_KEY));
    this.buildKit();
    this.buildCards();
    void this.buildPanel();
    this.applySettings(true);

    this.queries.grabbedCards.subscribe('qualify', (e) => this.onGrab(e));
    this.queries.grabbedCards.subscribe('disqualify', (e) => this.onRelease(e));

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((vs) => this.onVisibility(vs)),
    );
    const unlock = () => this.sound.unlock();
    window.addEventListener('pointerdown', unlock);
    this.cleanupFuncs.push(() => window.removeEventListener('pointerdown', unlock));

    const api: DeskBloomApi = {
      getState: () => this.app,
      dispatch: (action, arg) => this.dispatch(action, arg),
      placement: () => ({ source: this.placementSource, zone: this.zone, head: this.lastHead, surfaces: this.lastSurfaces }),
      targets: () => this.targets(),
      setTitles: (titles) => {
        this.commit({ state: A.setDeckTitles(this.app, titles), events: [] });
        this.persist();
        this.buildCards();
      },
      subscribe: (fn) => {
        this.listeners.add(fn);
        fn(this.app);
        return () => this.listeners.delete(fn);
      },
    };
    (window as unknown as { deskBloom: DeskBloomApi }).deskBloom = api;
    window.dispatchEvent(new CustomEvent('deskbloom:ready'));
    this.placeForBrowser();
  }

  /* ------------------------------------------------------------ building */

  private buildKit() {
    const root = new Object3D();
    root.name = 'Desk Kit';
    this.kit = this.world.createTransformEntity(root);
    this.kit.addComponent(DeskKit);

    const add = (o: Object3D) => this.world.createTransformEntity(o, { parent: this.kit });
    this.plant.root.position.copy(PLANT);
    this.ring.root.position.copy(PLANT);
    this.stones.root.position.set(0, 0, -0.155);
    this.jar.group.position.copy(JAR);
    this.burst.mesh.position.copy(PLANT);
    this.orb.orb.position.set(0, 0.19, 0);
    add(this.mat.mesh);
    add(this.plant.root);
    add(this.ring.root);
    add(this.stones.root);
    add(this.jar.group);
    add(this.burst.mesh);
    add(this.orb.orb);

    // Virtual desk shown only in the 2D browser preview (passthrough shows the real one).
    this.browserDesk = new Mesh(
      new BoxGeometry(1.3, 0.04, 0.75),
      new MeshStandardMaterial({ color: 0x8a6a4f, roughness: 0.75 }),
    );
    this.browserDesk.name = 'Preview Desk';
    this.browserDesk.position.set(0, -0.02, -0.1);
    this.browserDesk.receiveShadow = true;
    add(this.browserDesk);
  }

  private buildCards() {
    for (const rig of this.rigs.values()) rig.entity.dispose();
    this.rigs.clear();
    this.app.deck.forEach((task, i) => {
      const card = new TaskCard(task.id, i);
      const entity = this.world.createTransformEntity(card.root, { parent: this.kit });
      entity.addComponent(TaskCardTag, { taskId: task.id });
      entity.addComponent(OneHandGrabbable, { rotate: true, translate: true });
      entity.addComponent(RayInteractable);
      this.rigs.set(task.id, { card, entity, home: new Vector3(), homeQ: new Quaternion() });
    });
    this.layoutCards(true);
  }

  private targets(): Record<string, [number, number, number]> {
    const out: Record<string, [number, number, number]> = {};
    const put = (name: string, o: Object3D | null | undefined) => {
      if (!o) return;
      o.updateWorldMatrix(true, false);
      o.getWorldPosition(this.v);
      out[name] = [this.v.x, this.v.y, this.v.z];
    };
    for (const [id, rig] of this.rigs) put(`card:${id}`, rig.card.root);
    put('ring', this.ring.root);
    put('jar', this.jar.group);
    put('orb', this.orb.orb);
    const panel = this.panel;
    if (panel) {
      put('panel', panel);
      for (const id of ['btn-primary', 'btn-end', 'btn-breathe', 'btn-done', 'btn-contrast', 'btn-calm', 'btn-place', 'btn-exit', 'dur-1', 'dur-10', 'dur-25']) {
        const el = panel.getElementById(id) as unknown as { boundingSphere?: { center: Vector3 } } | undefined;
        if (!el?.boundingSphere) continue;
        panel.updateWorldMatrix(true, false);
        this.v.copy(el.boundingSphere.center).applyMatrix4(panel.matrixWorld);
        out[`ui:${id}`] = [this.v.x, this.v.y, this.v.z];
      }
    }
    return out;
  }

  private async buildPanel() {
    try {
      const panel = await this.world.assets.instantiate<UIKitMLAsset>('focus-panel');
      panel.name = 'Focus Panel';
      this.panel = panel;
      this.panelEntity = this.world.createTransformEntity(panel, { parent: this.kit });
      this.panelEntity.addComponent(RayInteractable);
      this.panelEntity.addComponent(PokeInteractable);
      panel.position.copy(PANEL_POS);
      this.fitPanel();
      const on = (id: string, fn: () => void) => {
        const el = panel.getElementById(id);
        if (!el) return;
        (el as unknown as Object3D).name = id;
        const handler = () => {
          try {
            this.sound.unlock();
            this.sound.tap();
          } catch {
            /* audio is optional */
          }
          fn();
        };
        el.addEventListener('click', handler);
        this.cleanupFuncs.push(() => el.removeEventListener('click', handler));
      };
      on('btn-primary', () => this.dispatch('primary'));
      on('btn-end', () => this.dispatch('end'));
      on('btn-breathe', () => this.dispatch('breathe'));
      on('btn-done', () => this.dispatch('done'));
      on('dur-1', () => this.dispatch('duration', 1));
      on('dur-10', () => this.dispatch('duration', 10));
      on('dur-25', () => this.dispatch('duration', 25));
      on('btn-contrast', () => this.dispatch('contrast'));
      on('btn-calm', () => this.dispatch('calm'));
      on('btn-place', () => this.dispatch('place'));
      on('btn-exit', () => this.world.exitXR());
      this.texts.clear();
      this.refreshPanel();
      this.onVisibility(this.world.visibilityState.peek());
    } catch (err) {
      console.error('[desk-bloom] panel failed to load', err);
    }
  }

  /** Scale the panel so it fits the comfort zone of the current device. */
  private fitPanel() {
    const panel = this.panel;
    if (!panel) return;
    // UIKit units are centimetres: the 380-unit-wide panel is 3.8 m at scale 1.
    const natural = PANEL_NATURAL_W;
    const dist = this.v.copy(PANEL_POS).distanceTo(USER);
    const width = Math.min(0.4, maxWidthFor(this.zone.halfH * 0.72, dist));
    panel.scale.setScalar(width / natural);
    // Tilt the panel so its face points at the seated user's eyes.
    const dy = USER.y - PANEL_POS.y;
    const dz = USER.z - PANEL_POS.z;
    panel.rotation.set(-Math.atan2(dy, dz), 0, 0);
  }

  /** Card home positions on an arc around the user, inside the comfort zone. */
  private layoutCards(snap = false) {
    const todo = this.app.deck.filter((t) => t.status === 'todo');
    const done = this.app.deck.filter((t) => t.status === 'done');
    const radius = 0.42;
    const maxHalf = Math.min(34, this.zone.halfH * 1.05);
    const minHalf = Math.min(22, maxHalf * 0.62);
    const angles: number[] = [];
    if (todo.length === 1) angles.push(-minHalf);
    else if (todo.length === 2) angles.push(-minHalf, minHalf);
    else if (todo.length === 3) angles.push(-maxHalf, -minHalf, minHalf);
    else if (todo.length >= 4) angles.push(-maxHalf, -minHalf, minHalf, maxHalf);
    const slots = angles.map((deg) => {
      const a = (deg * Math.PI) / 180;
      return { x: Math.sin(a) * radius, z: USER.z - Math.cos(a) * radius };
    });
    todo.forEach((t, i) => {
      const rig = this.rigs.get(t.id);
      const s = slots[i];
      if (!rig || !s) return;
      rig.home.set(s.x, 0.004 + CARD_H / 2 - 0.006, s.z);
      const yaw = Math.atan2(USER.x - s.x, USER.z - s.z);
      rig.homeQ.setFromEuler(this.e.set(-0.55, yaw, 0, 'YXZ'));
    });
    const focus = this.app.deck.find((t) => t.status === 'focus');
    if (focus) {
      const rig = this.rigs.get(focus.id);
      rig?.home.copy(FOCUS_SLOT);
      rig?.homeQ.setFromEuler(this.e.set(-0.75, 0, 0, 'YXZ'));
    }
    done.forEach((t, i) => {
      const rig = this.rigs.get(t.id);
      if (!rig) return;
      rig.home.set(JAR.x + (i - 1.5) * 0.006, 0.04 + i * 0.004, JAR.z + (i % 2) * 0.006);
      rig.homeQ.setFromEuler(this.e.set(-0.15, -0.6 + i * 0.35, 0.1 * (i - 1.5), 'YXZ'));
    });
    if (snap) {
      for (const rig of this.rigs.values()) {
        rig.card.root.position.copy(rig.home);
        rig.card.root.quaternion.copy(rig.homeQ);
      }
    }
  }

  /* ------------------------------------------------------------ actions */

  dispatch(action: string, arg?: string | number) {
    const a = this.app;
    switch (action) {
      case 'primary':
        return this.commit(A.primary(a));
      case 'end':
        return this.commit(A.endBlock(a));
      case 'breathe':
        this.breathT = 0;
        return this.commit(A.startBreak(a));
      case 'done': {
        const id = a.session.taskId ?? a.deck.find((t) => t.status === 'focus')?.id;
        if (!id) return this.reject('Drop a card in the ring first');
        return this.commit(A.completeCard(a, id));
      }
      case 'focus':
        return this.commit(A.focusCard(a, String(arg)));
      case 'complete':
        return this.commit(A.completeCard(a, String(arg)));
      case 'duration':
        return this.commit(A.chooseDuration(a, Number(arg)));
      case 'contrast':
        this.app = A.toggleContrast(a);
        this.applySettings();
        return this.persist();
      case 'calm':
        this.app = A.toggleCalm(a);
        this.applySettings();
        return this.persist();
      case 'place':
        this.userMoved = false;
        return this.placeInXR(true);
      case 'tick':
        return this.commit(A.tick(a, Number(arg)));
      default:
        console.warn('[desk-bloom] unknown action', action);
    }
  }

  private reject(reason: string) {
    this.toast = reason;
    this.toastT = 2.5;
    this.sound.reject();
    this.texts.clear();
  }

  private commit(step: A.Step) {
    this.app = step.state;
    for (const ev of step.events) {
      switch (ev.type) {
        case 'focus-started':
          this.sound.drop();
          break;
        case 'focus-complete':
          this.sound.bloom();
          this.burst.fire(0.12, this.pal());
          break;
        case 'task-done':
          this.sound.drop();
          break;
        case 'break-started':
          this.breathT = 0;
          break;
        case 'rejected':
          this.reject(ev.reason);
          break;
        default:
          break;
      }
    }
    this.layoutCards();
    this.plant.setGrowth(growth(this.app.garden.totalMinutes));
    this.texts.clear();
    if (step.events.length) this.persist();
    for (const fn of this.listeners) fn(this.app);
  }

  private persist() {
    saveJSON(this.kv, STORAGE_KEY, A.snapshot(this.app));
    for (const fn of this.listeners) fn(this.app);
  }

  private pal(): Palette {
    return this.app.settings.highContrast ? PALETTE.contrast : PALETTE.normal;
  }

  private applySettings(instant = false) {
    const pal = this.pal();
    const calm = this.app.settings.calmMotion;
    this.plant.calm = calm;
    this.ring.calm = calm;
    this.plant.setContrast(this.app.settings.highContrast);
    this.plant.setGrowth(growth(this.app.garden.totalMinutes), instant);
    this.mat.mat.color.setHex(pal.mat);
    this.mat.mat.opacity = this.app.settings.highContrast ? 0.95 : 0.82;
    this.texts.clear();
  }

  /* ------------------------------------------------------------ grabbing */

  private taskIdOf(e: Entity): string {
    return String(e.getValue(TaskCardTag, 'taskId') ?? '');
  }

  private onGrab(e: Entity) {
    const id = this.taskIdOf(e);
    this.app = A.grabCard(this.app, id);
    this.userMoved = true;
    this.sound.unlock();
    this.sound.pick();
    this.texts.clear();
  }

  private onRelease(e: Entity) {
    const id = this.taskIdOf(e);
    this.app = A.releaseCard(this.app);
    const obj = e.object3D;
    if (!obj) return;
    obj.getWorldPosition(this.v);
    this.kit.object3D!.worldToLocal(this.v);
    const toRing = Math.hypot(this.v.x - PLANT.x, this.v.z - PLANT.z);
    const toJar = Math.hypot(this.v.x - JAR.x, this.v.z - JAR.z);
    const task = this.app.deck.find((t) => t.id === id);
    if (task && this.v.y < 0.4) {
      if (toJar < JAR_DROP_RADIUS && task.status !== 'done') return this.commit(A.completeCard(this.app, id));
      if (toRing < RING_DROP_RADIUS && task.status !== 'focus') return this.commit(A.focusCard(this.app, id));
    }
    // Anywhere else: the card glides back home.
    this.layoutCards();
    this.texts.clear();
  }

  /* ------------------------------------------------------------ placement */

  private onVisibility(vs: VisibilityState) {
    const immersive = vs !== VisibilityState.NonImmersive;
    this.browserDesk.visible = !immersive;
    const exit = this.panel?.getElementById('btn-exit');
    exit?.setProperties({ display: immersive ? 'flex' : 'none' });
    document.body.classList.toggle('in-xr', immersive);
    if (vs === VisibilityState.Visible) {
      if (this.placementSource === 'browser') {
        this.placeTimer = 0.6; // let tracking settle, then place
        this.autoPlaceUntil = this.elapsed + 12;
        this.userMoved = false;
      }
    } else if (vs === VisibilityState.VisibleBlurred || vs === VisibilityState.Hidden) {
      this.commit(A.onBlur(this.app));
    } else if (vs === VisibilityState.NonImmersive) {
      this.commit(A.onBlur(this.app));
      this.placeForBrowser();
    }
  }

  private placeForBrowser() {
    this.placementSource = 'browser';
    const k = this.kit.object3D!;
    k.position.set(0, BROWSER_DESK_TOP, -0.5);
    k.rotation.set(0, 0, 0);
    this.zone = { ...ERGONOMIC };
    this.fitPanel();
    this.layoutCards(true);
  }

  private collectSurfaces(): SurfaceCandidate[] {
    const out: SurfaceCandidate[] = [];
    const push = (kind: 'mesh' | 'plane', e: Entity, label: string, horizontal: boolean) => {
      const o = e.object3D;
      if (!o) return;
      o.updateMatrixWorld(true);
      this.box.setFromObject(o);
      if (this.box.isEmpty()) return;
      out.push({
        kind,
        label,
        horizontal,
        min: [this.box.min.x, this.box.min.y, this.box.min.z],
        max: [this.box.max.x, this.box.max.y, this.box.max.z],
      });
    };
    for (const e of this.queries.meshes.entities) {
      const label = String(e.getValue(XRMesh, 'semanticLabel') ?? '');
      push('mesh', e, label, label === 'table' || label === 'desk');
    }
    for (const e of this.queries.planes.entities) {
      const p = e.getValue(XRPlane, '_plane') as { orientation?: string; semanticLabel?: string } | undefined;
      push('plane', e, p?.semanticLabel ?? '', p?.orientation === 'horizontal');
    }
    return out;
  }

  private measureFov() {
    const cams = this.renderer.xr.getCamera().cameras as { projectionMatrix: { elements: number[] } }[];
    if (!Array.isArray(cams) || cams.length < 1) return;
    const fov = binocularFov(cams.map((c) => fovFromProjection(c.projectionMatrix.elements)));
    this.zone = comfortZone(fov);
  }

  private placeInXR(force = false) {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.placeForBrowser();
      return;
    }
    this.measureFov();
    this.camera.getWorldPosition(this.v);
    this.camera.getWorldDirection(this.v2);
    const head: [number, number, number] = [this.v.x, this.v.y, this.v.z];
    const yaw = yawFromForward(this.v2.x, this.v2.z);
    const surfaces = this.collectSurfaces();
    const anchor = chooseDesk(surfaces, head, yaw);
    this.lastSurfaces = surfaces;
    this.lastHead = head;
    if (!force && anchor.source === 'fallback' && this.placementSource !== 'browser') return;
    const chosen = anchor.source === 'fallback' ? fallbackAnchor(head, yaw) : anchor;
    const k = this.kit.object3D!;
    k.position.set(...chosen.position);
    k.rotation.set(0, chosen.yaw, 0);
    this.placementSource = chosen.source;
    this.fitPanel();
    this.layoutCards(true);
    console.info(`[desk-bloom] placed kit on ${chosen.source} (${surfaces.length} surfaces, head ${head.map((n) => n.toFixed(2)).join(',')}); comfort zone +/-${this.zone.halfH.toFixed(1)} deg`);
  }

  /* ------------------------------------------------------------ frame */

  update(delta: number): void {
    const dt = Math.min(0.1, delta);
    this.elapsed += dt;
    // The focus clock uses wall time so slow frames never stretch a block.
    const nowMs = performance.now();
    const wallDt = this.lastWall < 0 ? dt : Math.min(5, Math.max(0, (nowMs - this.lastWall) / 1000));
    this.lastWall = nowMs;
    const vs = this.world.visibilityState.peek();

    if (this.placeTimer >= 0) {
      this.placeTimer -= dt;
      if (this.placeTimer < 0) this.placeInXR(true);
    } else if (vs === VisibilityState.Visible && !this.userMoved && this.elapsed < this.autoPlaceUntil) {
      // Scene understanding streams in over the first seconds: upgrade a
      // fallback placement to the real table as soon as it is known.
      if (this.placementSource === 'fallback' && Math.floor(this.elapsed * 2) !== Math.floor((this.elapsed - dt) * 2)) {
        this.placeInXR(false);
      }
    }

    // Session clock runs only while the user is actually present.
    if (vs === VisibilityState.Visible || vs === VisibilityState.NonImmersive) {
      const before = this.app.session.phase;
      if (before === 'focus' || before === 'break') this.commit(A.tick(this.app, wallDt));
    }

    const pal = this.pal();
    const s = this.app.session;
    const ringState = this.app.holding
      ? 'target'
      : s.phase === 'focus' || s.phase === 'paused' || s.phase === 'complete'
        ? s.phase
        : 'idle';
    this.ring.update(dt, s.phase === 'idle' || s.phase === 'break' ? 0 : progress(s), ringState, pal);
    this.plant.update(dt);
    this.burst.update(dt);
    this.stones.update(lastSevenDays(this.app.garden, new Date()), pal);
    this.jar.rimMat.emissiveIntensity = this.app.holding ? 0.9 : 0.2;

    // Breathing orb.
    if (s.phase === 'break') {
      this.breathT += dt;
      const b = breathAt(this.breathT);
      const scale = 0.022 + 0.035 * b.fullness;
      this.orb.orb.visible = true;
      this.orb.orb.scale.setScalar(scale);
      if (b.label !== this.lastBreathLabel) {
        this.lastBreathLabel = b.label;
        if (b.label === 'Breathe in' || b.label === 'Breathe out') this.sound.breathCue(b.label === 'Breathe in');
        this.texts.clear();
      }
    } else {
      this.orb.orb.visible = false;
      this.lastBreathLabel = '';
    }

    // Cards glide toward their homes unless held.
    const hovered = this.queries.hoveredCards.entities;
    const follow = Math.min(1, dt * (this.app.settings.calmMotion ? 5 : 10));
    for (const rig of this.rigs.values()) {
      const task = this.app.deck.find((t) => t.id === rig.card.taskId);
      if (!task) continue;
      rig.card.render(task, pal, hovered.has(rig.entity) || this.app.holding === task.id);
      if (rig.entity.hasComponent(Grabbed)) continue;
      const o = rig.card.root;
      o.position.lerp(rig.home, follow);
      o.quaternion.slerp(rig.homeQ, follow);
    }

    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toast = '';
        this.texts.clear();
      }
    }

    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.25;
      this.refreshPanel();
    }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 5;
      if (s.phase === 'focus' || s.phase === 'break') saveJSON(this.kv, STORAGE_KEY, A.snapshot(this.app));
    }
  }

  private setText(id: string, text: string) {
    if (this.texts.get(id) === text || !this.panel) return;
    this.texts.set(id, text);
    const el = this.panel.getElementById<UIKit.Text>(id);
    el?.setProperties({ text });
  }

  private refreshPanel() {
    if (!this.panel) return;
    const a = this.app;
    const s = a.session;
    const c = A.coach(a);
    let title = c.title;
    let hint = c.hint;
    if (s.phase === 'break') {
      const b = breathAt(this.breathT);
      title = b.label;
    }
    if (this.toast) {
      title = 'Not yet';
      hint = this.toast;
    }
    this.setText('title', title);
    this.setText('hint', hint);
    this.setText('clock', formatClock(s.phase === 'idle' ? a.settings.durationMin * 60 : remainingSec(s)));
    const phaseLabel: Record<string, string> = {
      idle: `${a.settings.durationMin} MIN BLOCK`,
      focus: 'FOCUSING',
      paused: 'PAUSED',
      break: 'BREATHER',
      complete: 'COMPLETE',
    };
    this.setText('phase', phaseLabel[s.phase]);
    this.setText('btn-primary-label', A.primaryLabel(a));
    this.setText('stats', A.statsLine(a));
    this.setText('btn-contrast-label', a.settings.highContrast ? 'Contrast on' : 'Contrast');
    this.setText('btn-calm-label', a.settings.calmMotion ? 'Calm on' : 'Calm');
    const key = `${a.settings.durationMin}|${a.settings.highContrast}`;
    if (this.texts.get('__dur') !== key) {
      this.texts.set('__dur', key);
      for (const m of [1, 10, 25]) {
        this.panel.getElementById(`dur-${m}`)?.setProperties({
          variant: a.settings.durationMin === m ? 'primary' : 'secondary',
        } as Record<string, unknown>);
      }
      const root = this.panel.getElementById('root');
      root?.setProperties(
        (a.settings.highContrast
          ? { backgroundColor: '#000000', borderColor: '#ffe600', borderWidth: 4 }
          : { borderWidth: 0 }) as Record<string, unknown>,
      );
    }
  }
}
