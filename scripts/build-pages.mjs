#!/usr/bin/env node
/**
 * Builds the GitHub Pages site:
 *   dist/           native WebXR build (Quest Browser, any WebXR browser)
 *   dist/emulator/  same app with the Immersive Web Emulator (IWER) injected,
 *                   so judges without a headset can try it in desktop Chrome.
 *
 * iwsdk.config.json is the IWSDK project authority, so the emulator variant is
 * produced by temporarily enabling `dev.emulator.injectOnBuild` and restoring
 * the original file afterwards (even if the build fails).
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

const CONFIG = 'iwsdk.config.json';
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });

rmSync('dist', { recursive: true, force: true });
console.log('\n> Building native WebXR site -> dist/');
run('npx vite build --outDir dist');

const original = readFileSync(CONFIG, 'utf8');
try {
  const cfg = JSON.parse(original);
  cfg.dev ??= {};
  cfg.dev.emulator = {
    ...(cfg.dev.emulator ?? {}),
    injectOnBuild: true,
    // Activate on any host (github.io), but still step aside on a real Quest.
    activation: 'always',
  };
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
  console.log('\n> Building emulator site -> dist/emulator/');
  run('npx vite build --outDir dist/emulator --emptyOutDir');
} finally {
  writeFileSync(CONFIG, original);
}

writeFileSync('dist/.nojekyll', '');
if (!existsSync('dist/index.html') || !existsSync('dist/emulator/index.html')) {
  throw new Error('Pages build incomplete');
}
console.log('\nPages build ready in dist/ (native) and dist/emulator/ (IWER).');
