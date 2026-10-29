/**
 * 小猫的心情。四种：calm 平常，excited 你常来，shy 最近被猛地合上，sleepy 闲久了打盹。
 * 打盹时盖子轻轻抖一下会醒。醒着的小动作走洗牌袋，相邻两次不重复。
 * 不碰网格，不碰存档。午觉 / 追萤火虫那些秘密仍由原来的状态机管。
 */
import { TUNING } from './tuning.js';
import { greetingKind, moodFromMemory, normalizeKittenMemory } from './kitten-memory.js';
import { GREETINGS, lineFor } from './kitten-lines.js';

export const IDLE_ACTS = ['blink', 'ear', 'tilt', 'tail', 'look', 'lick', 'yawn'];

const EMPTY = [];

/** @typedef {ReturnType<typeof createKittenMood>} KittenMood */

export function createKittenMood() {
  return {
    /** @type {'calm'|'excited'|'shy'|'sleepy'} */
    mood: 'calm',
    /** @type {'calm'|'excited'|'shy'} */
    base: 'calm',
    asleep: false,
    idleSec: 0,
    wakeHold: 0,
    wakeLeft: 0,
    wakeDur: 0,
    greeted: false,
    /** @type {string} */
    greetKind: '',
    phase: 'gap',
    phaseLeft: 0.15,
    actDur: 0.5,
    /** @type {string} */
    act: 'still',
    /** @type {string[]} */
    bag: [],
    lastAct: '',
    lookSign: 1,
    lineCd: 2.5,
    seenAcc: 0,
    shut: true,
    jitter: 0,
    /** @type {number|null} */
    prevAngle: null,
    wantSleepLine: false,
  };
}

/**
 * 进页面时先看旧记性，再由外面把 seenAt 更新成现在。
 * @param {KittenMood} M
 * @param {object|null|undefined} memory
 * @param {number} now
 * @param {typeof TUNING.kitten} [t]
 */
export function prepareGreeting(M, memory, now, t = TUNING.kitten) {
  const prev = normalizeKittenMemory(memory);
  M.greetKind = greetingKind(prev, now, t);
  syncBase(M, prev, now, t);
  return prev;
}

/** @param {KittenMood} M @param {object|null|undefined} memory @param {number} now @param {typeof TUNING.kitten} [t] */
export function syncBase(M, memory, now, t = TUNING.kitten) {
  M.base = moodFromMemory(memory, now, t);
  if (!M.asleep) M.mood = M.base;
}

/** 猛地合上。害羞盖过兴奋，打盹也被惊醒，不再走「轻轻叫醒」那句。 */
export function onSlammed(M) {
  M.base = 'shy';
  M.asleep = false;
  M.mood = 'shy';
  M.idleSec = 0;
  M.jitter = 0;
  M.wakeLeft = 0;
  M.wakeHold = 0;
  M.wantSleepLine = false;
  M.act = 'still';
  M.phase = 'gap';
  M.phaseLeft = 0.4;
  M.actDur = 0.4;
}

/** @param {KittenMood} M @param {() => number} rng */
function refill(M, rng) {
  const pool = IDLE_ACTS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  if (pool[0] === M.lastAct && pool.length > 1) {
    const j = 1 + Math.min(pool.length - 2, Math.floor(rng() * (pool.length - 1)));
    const tmp = pool[0];
    pool[0] = pool[j];
    pool[j] = tmp;
  }
  M.bag = pool;
}

/** 下一只小动作。洗牌袋抽完才重洗，袋口不和上一只相同。 */
export function takeIdle(M, rng) {
  if (!M.bag.length) refill(M, rng);
  const id = M.bag.shift() || 'blink';
  M.lastAct = id;
  if (id === 'look') M.lookSign = rng() < 0.5 ? -1 : 1;
  return id;
}

function span(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}

/**
 * @param {KittenMood} M
 * @param {{dt:number, angle:number, speed:number, visible:boolean, mode:string, captionBusy:boolean, distracted:boolean, rng:() => number}} input
 * @param {typeof TUNING.kitten} [tuning]
 */
export function stepKittenMood(M, input, tuning = TUNING.kitten) {
  const { dt, angle, speed, visible, mode, captionBusy, distracted, rng } = input;
  /** @type {object[]|null} */
  let events = null;
  /** @param {object} e */
  const push = (e) => {
    if (!events) events = [];
    events.push(e);
  };
  let spoke = false;

  M.wakeLeft = Math.max(0, M.wakeLeft - dt);
  M.wakeHold = Math.max(0, M.wakeHold - dt);
  M.lineCd = Math.max(0, M.lineCd - dt);
  if (M.act === 'wake' && M.wakeLeft <= 0) {
    M.act = 'still';
    M.phase = 'gap';
    M.phaseLeft = 0.4;
    M.actDur = 0.4;
  }

  M.seenAcc += dt;
  if (M.seenAcc >= tuning.seenEvery) {
    M.seenAcc = 0;
    push({ type: 'kitten-seen' });
  }

  const prev = M.prevAngle;
  M.prevAngle = angle;
  const delta = prev == null ? 0 : angle - prev;

  if (angle < tuning.shutBelow) M.shut = true;
  else if (M.shut && angle >= tuning.openAbove) {
    M.shut = false;
    push({ type: 'kitten-open' });
  }

  const home = visible && (mode === 'play' || mode === 'dawn');
  const canDoze = home && !distracted && mode === 'play';

  if (M.asleep && (distracted || !visible || mode === 'hidden' || mode === 'nap')) {
    M.asleep = false;
    M.jitter = 0;
    M.idleSec = 0;
    M.wantSleepLine = false;
    M.wakeHold = tuning.wakeHoldSec * 0.5;
  } else if (!home) {
    M.idleSec = 0;
    M.jitter = 0;
  }

  if (M.asleep) {
    const ad = Math.abs(delta);
    if (ad >= tuning.jitterFloor) M.jitter += ad;
    else M.jitter *= Math.exp(-dt / tuning.jitterDecay);
    // 猛开的头几帧速度很高，但累积角度还小：先攒着。
    // 停在 1°–8° 里才算轻轻叫醒；一下子超过 8° 就只睁眼，不说那句。
    const gentle = M.jitter >= tuning.wakeJitterDeg && M.jitter <= tuning.wakeJitterMax && speed <= tuning.wakeSpeed;
    const rough = M.jitter > tuning.wakeJitterMax;
    if (gentle || rough) {
      M.asleep = false;
      M.jitter = 0;
      M.idleSec = 0;
      M.wakeHold = tuning.wakeHoldSec;
      M.wantSleepLine = false;
      if (gentle) {
        M.wakeDur = tuning.wakeFlash;
        M.wakeLeft = tuning.wakeFlash;
        M.act = 'wake';
        if (!captionBusy) {
          push({ type: 'kitten-wake', text: lineFor('wake', rng) });
          M.lineCd = tuning.lineGapSec;
          spoke = true;
        }
      } else {
        M.wakeLeft = 0;
        M.act = 'still';
        M.phase = 'gap';
        M.phaseLeft = 0.35;
        M.actDur = 0.35;
      }
    }
  } else if (canDoze && speed < tuning.idleSpeed && M.wakeHold <= 0) {
    M.idleSec += dt;
    if (M.idleSec >= tuning.idleSleepSec) {
      M.asleep = true;
      M.jitter = 0;
      M.act = 'doze';
      M.wantSleepLine = true;
    }
  } else if (speed >= tuning.idleSpeed) {
    M.idleSec = 0;
  }

  if (M.asleep && M.wantSleepLine && !captionBusy && !spoke) {
    M.wantSleepLine = false;
    push({ type: 'kitten-line', kind: 'sleepy', text: lineFor('sleepy', rng) });
    M.lineCd = tuning.lineGapSec;
    spoke = true;
  }

  // 招呼等到它已经出来玩（大约 76° 以后），开到窗台时这句话还在。
  if (!M.greeted && visible && mode === 'play') {
    const kind = M.greetKind;
    if (!kind || kind === 'soon') M.greeted = true;
    else if (!captionBusy && !spoke) {
      M.greeted = true;
      const text = GREETINGS[kind] || GREETINGS.back;
      push({ type: 'kitten-greet', kind, text });
      M.lineCd = tuning.lineGapSec;
      spoke = true;
    }
  }

  const vary = canDoze && !M.asleep && M.wakeLeft <= 0;
  if (M.asleep) M.act = 'doze';
  else if (vary) {
    M.phaseLeft -= dt;
    if (M.phaseLeft <= 0) {
      if (M.phase !== 'act') {
        const id = takeIdle(M, rng);
        const dur = span(rng, tuning.idleMin, tuning.idleMax);
        M.phase = 'act';
        M.act = id;
        M.actDur = dur;
        M.phaseLeft = dur;
        if (!captionBusy && !spoke && M.lineCd <= 0 && rng() < tuning.lineChance) {
          push({ type: 'kitten-line', text: lineFor(M.base, rng, id) });
          M.lineCd = tuning.lineGapSec;
        }
      } else {
        const dur = span(rng, tuning.idleGapMin, tuning.idleGapMax);
        M.phase = 'gap';
        M.act = 'still';
        M.actDur = dur;
        M.phaseLeft = dur;
      }
    }
  }

  M.mood = M.asleep ? 'sleepy' : M.base;
  return events || EMPTY;
}
