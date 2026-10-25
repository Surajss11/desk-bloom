import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import type { Task } from '../core/tasks.js';
import { CARD_TINTS, type Palette } from './palette.js';

export const CARD_W = 0.088;
export const CARD_H = 0.064;

const bodyGeo = new BoxGeometry(CARD_W, CARD_H, 0.005);
const faceGeo = new PlaneGeometry(CARD_W * 0.96, CARD_H * 0.94);

/** A physical task card with a canvas-rendered face. */
export class TaskCard {
  readonly root = new Group();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: CanvasTexture;
  private bodyMat: MeshStandardMaterial;
  private key = '';

  constructor(
    readonly taskId: string,
    private tintIndex: number,
  ) {
    this.root.name = `Task Card ${taskId}`;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 372;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.bodyMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const body = new Mesh(bodyGeo, this.bodyMat);
    body.castShadow = true;
    body.name = `${this.root.name} Body`;
    const face = new Mesh(faceGeo, new MeshStandardMaterial({ map: this.texture, roughness: 0.8 }));
    face.position.z = 0.0027;
    face.name = `${this.root.name} Face`;
    this.root.add(body, face);
  }

  /** Redraws only when something visible changed. */
  render(task: Task, pal: Palette, highlight: boolean) {
    const key = `${task.title}|${task.status}|${task.minutes}|${pal.cardBg}|${highlight}`;
    if (key === this.key) return;
    this.key = key;
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const tint = CARD_TINTS[this.tintIndex % CARD_TINTS.length];
    const contrast = pal.cardBg === '#000000';
    c.clearRect(0, 0, W, H);
    c.fillStyle = task.status === 'done' ? pal.cardDone : pal.cardBg;
    c.fillRect(0, 0, W, H);
    // Colour band identifies the card at a glance (and in peripheral vision).
    c.fillStyle = contrast ? pal.cardSub : tint;
    c.fillRect(0, 0, W, 56);
    if (highlight || task.status === 'focus') {
      c.strokeStyle = pal.cardFocus;
      c.lineWidth = contrast ? 22 : 16;
      c.strokeRect(8, 8, W - 16, H - 16);
    }
    c.fillStyle = contrast ? '#000000' : '#1f2a24';
    c.font = '600 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    c.textBaseline = 'middle';
    const label = task.status === 'done' ? 'DONE' : task.status === 'focus' ? 'IN FOCUS' : 'TO DO';
    c.fillText(label, 26, 30);
    c.fillStyle = pal.cardInk;
    c.font = `700 ${contrast ? 58 : 54}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    wrap(c, task.title, 26, 130, W - 52, 64, 3);
    c.fillStyle = pal.cardSub;
    c.font = '500 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    c.fillText(task.minutes > 0 ? `${task.minutes} min focused` : 'Pinch to pick up', 26, H - 40);
    if (task.status === 'done') {
      c.strokeStyle = contrast ? '#ffffff' : '#2c5a45';
      c.lineWidth = 10;
      c.beginPath();
      c.moveTo(W - 120, H - 70);
      c.lineTo(W - 90, H - 40);
      c.lineTo(W - 36, H - 104);
      c.stroke();
    }
    this.texture.needsUpdate = true;
    this.bodyMat.color.set(task.status === 'done' ? pal.cardDone : pal.cardBg);
  }
}

function wrap(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines: number,
) {
  const words = text.split(' ');
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, x, y + lines * lineH);
      lines++;
      line = words[i];
      if (lines === maxLines - 1) {
        line = words.slice(i).join(' ');
        break;
      }
    } else line = test;
  }
  c.fillText(line, x, y + lines * lineH);
}
