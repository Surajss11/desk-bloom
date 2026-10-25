import type { World } from '@iwsdk/core';
import type { AppState } from './core/app-state.js';
import { statsLine } from './core/app-state.js';
import { MAX_TASKS } from './core/tasks.js';
import type { DeskBloomApi } from './systems/bloom-system.js';

/**
 * The 2D landing page shown before entering mixed reality: edit today's
 * cards (typing is easier here than in-headset), see progress, then enter.
 */
export function mountPage(world: World) {
  const el = document.getElementById('page');
  const api = (window as unknown as { deskBloom?: DeskBloomApi }).deskBloom;
  if (!el || !api) return;

  const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input[data-task]'));
  const enter = el.querySelector<HTMLButtonElement>('#enter')!;
  const save = el.querySelector<HTMLButtonElement>('#save')!;
  const stats = el.querySelector<HTMLElement>('#page-stats')!;
  const support = el.querySelector<HTMLElement>('#xr-support')!;
  const toggle = el.querySelector<HTMLButtonElement>('#toggle')!;

  const fill = (s: AppState) => {
    inputs.forEach((input, i) => {
      if (document.activeElement !== input) input.value = s.deck[i]?.title ?? '';
    });
    stats.textContent = statsLine(s);
  };
  api.subscribe(fill);
  inputs.forEach((i) => (i.maxLength = 28));

  // On the emulator build, swap the "try the emulator" link for usage tips.
  const emuNote = el.querySelector<HTMLElement>('#emu-note');
  if (emuNote && /\/emulator\/?/.test(location.pathname)) {
    emuNote.textContent =
      'Emulator build: press Enter mixed reality, then use the emulator panel to move your hands or controllers. Pinch a card and drop it into the ring.';
  }

  save.addEventListener('click', () => {
    const titles = inputs.map((i) => i.value).filter((v) => v.trim()).slice(0, MAX_TASKS);
    api.setTitles(titles.length ? titles : ['Plan my day']);
    save.textContent = 'Saved';
    setTimeout(() => (save.textContent = 'Save cards'), 1200);
  });

  enter.addEventListener('click', () => {
    world.launchXR();
  });

  toggle.addEventListener('click', () => {
    el.classList.toggle('collapsed');
    toggle.textContent = el.classList.contains('collapsed') ? 'Show panel' : 'Hide panel';
  });

  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) {
    support.textContent =
      'WebXR is not available in this browser. Open this page in the Meta Quest Browser, or use the emulator link below.';
    enter.disabled = true;
  } else {
    xr.isSessionSupported('immersive-ar')
      .then((ok) => {
        support.textContent = ok
          ? 'Ready: put the headset on, sit at your desk, then enter.'
          : 'Mixed reality is not supported here. Use a Meta Quest browser or the emulator link below.';
        enter.disabled = !ok;
      })
      .catch(() => (support.textContent = 'Could not check XR support.'));
  }
}
