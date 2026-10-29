// 运行时状态。测试钩子 `__popup.S` 指向同一对象。
import { Spring } from './math.js';
import { createKittenMood } from './kitten-mood.js';
import { createTapState } from './tap-machine.js';
import { createPetInput, createPetStick } from './trackpad-pet.js';

export const MAX_ANGLE = 130;
export const PW = 10;
export const PH = 6.2;
export const FONT = '"PingFang SC","Hiragino Sans GB","Songti SC","Microsoft YaHei","Noto Serif CJK SC","Noto Sans CJK SC",sans-serif';

/** @type {Array<[number, number, string]>} */
export const CAPTIONS = [
  [0, 15, '合上的书 · 一道暖光从缝里漏出来'],
  [15, 40, '地面折起 · 纸松树一排排立起来'],
  [40, 70, '小木屋翻身立起 · 窗亮了，烟囱冒烟'],
  [70, 100, '小猫探出头 · 蹲到窗台上，尾巴轻摆'],
  [100, 131, '月亮升起 · 星星和萤火虫出来了'],
];

export const S = {
  target: 0, filtered: 0,
  hinge: new Spring(140, 0.6, 0),
  lit: new Spring(18, 1, 0), night: new Spring(10, 1, 0), moonUp: new Spring(24, 0.8, 0), sunU: new Spring(60, 0.5, 0),
  dayU: 0, tod: '',
  door: null, cabin: null,
  peek: new Spring(80, 0.6, 0), hop: new Spring(70, 0.75, 0),
  egg: new Spring(140, 0.55, 0), sleepy: new Spring(22, 1, 0), yawn: 0, yawnT: 99,
  lastDir: 1, vel: 0, prevFiltered: 0, time: 0, sp: 0,
  eyeOpen: 0.4, blinkT: 3,
  season: 0,
  shy: 0, duck: 0, flutT: 0, flutCool: 0, startled: 0, burstT: 0, lastShake: -99,
  napP: 0, chaseP: 0, petE: 0, petT: 0, petDown: false, purring: false, purrHold: 0, napLock: 0,
  pet: createPetStick(), petIn: createPetInput(), petSquint: 0,
  sw: { dir: 0, ext: 0, swings: [] },
  hold: { anchor: 0, t: 0, band: '', fired: false },
  act: { seam: false, nap: false, chase: false },
  armed: false, closing: false, closeMax: 0, lidShut: false, ending: 0, slamT: 0,
  eggT: 0, lookX: 0, lookY: 0, mouseT: -99, mouseX: 0, mouseY: 0, hover: '', nudgeT: 0,
  run: { on: false, t0: 0, max: 0, bad: '', done: false, dur: 0 },
  conP: 0, watchW: 0, noonW: 0, sneezeT: 0, sneezes: 0, sneezeSaid: false, sunsetT: 0, sunsetSaid: false,
  dawnW: 0, dawnHeld: false, dawnSaid: false, dawnPhase: 0, seasonMorphSaid: false,
  pageHidden: false, revealOpen: false, seasonCatchup: false, poseLatch: null,
  journalNear: [],
  tap: createTapState(),
  kittenMode: 'hidden', kittenMood: createKittenMood(), holdRing: -1, _heartOn: false,
  beats: { springSaid: false, winterSaid: false, springT: 0 },
  cap: '', capUntil: 0, moodCap: '', moodUntil: 0, moodKind: '', kx: 0, kz: 1.5, kvx: 0, leafT: 0, flyAt: 0, prevHop: 0, prevPeek: 0, soundKick: 0, shakeN: 0,
  owlPend: 0, seamEye: 0, conBurst: 0, dawnStretch: 0, heartCd: 0, sneeze: 0, endMode: undefined,
  fx: 0, fy: 0, fz: 0,
};

/** 跨模块的本帧派生量。对象复用，避免每帧分配。 */
export const frame = {
  flut: 0, hingeA: 0, nightP: 0, moonP: 0, litP: 0, doorP: 0, cabinP: 0,
  peekP: 0, hopP: 0, eggP: 0, sleepyP: 0,
  th: 0, lidY: 0, tanTh: 0, cabinE: 0, showK: false, goldP: 0,
};
