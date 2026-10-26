// 把场景搭起来。rnd() 的调用顺序由各个 build* 的先后决定，不要打乱。
import * as THREE from '../vendor/three.module.js';
import { S, frame } from './state.js';
import { createGfx } from './gfx.js';
import { buildGround } from './build-ground.js';
import { buildSky } from './build-sky.js';
import { buildForest } from './build-forest.js';
import { buildCabin } from './build-cabin.js';
import { buildCritters } from './build-critters.js';
import { SKY, createSeason } from './season.js';

export function createWorld(stageEl) {
  const gfx = createGfx(stageEl);
  const book = new THREE.Group();
  gfx.scene.add(book);
  const W = {
    gfx,
    scene: gfx.scene,
    camera: gfx.camera,
    book,
    S,
    frame,
    SKY,
    tmp: {
      v: new THREE.Vector3(),
      v2: new THREE.Vector3(),
      b: new THREE.Vector3(),
      m4: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      sv: new THREE.Vector3(),
      p: new THREE.Vector3(),
      col: new THREE.Color(),
      c1: new THREE.Color(),
      c2: new THREE.Color(),
      c3: new THREE.Color(),
    },
    net: { connects: 0, coalesced: 0 },
  };
  buildGround(W);
  buildSky(W);
  buildForest(W);
  buildCabin(W);
  buildCritters(W);
  createSeason(W);
  return W;
}
