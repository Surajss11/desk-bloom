import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { BloomSystem } from './systems/bloom-system.js';
import { mountPage } from './page.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(BloomSystem, { priority: 30 });
  mountPage(world);
});
