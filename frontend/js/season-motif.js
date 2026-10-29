// 把 season-ritual 里的音符交给已有的 WebAudio 合成。没有外部音频文件。
import { motifEvents } from './season-ritual.js';
import { seasonIndex } from './rules.js';
import { TUNING } from './tuning.js';

/** @type {number|null} */
let motifDue = null;
/** @type {number|null} */
let motifAt = null;

/**
 * @param {{ready:boolean, ctx?:{state?:string}}} sound
 */
function canHear(sound) {
  if (!sound.ready) return false;
  if (sound.ctx && sound.ctx.state && sound.ctx.state !== 'running') return false;
  return true;
}

/**
 * @param {{log:(name:string)=>void, _now:()=>number, _tone:(type:string, f0:number, f1:number, t0:number, dur:number, vol:number, dest:unknown, attack?:number)=>void}} sound
 * @param {number} id
 */
function playNow(sound, id) {
  const t0 = sound._now() + 0.05;
  const gain = TUNING.ritualMotifVol;
  for (const ev of motifEvents(id)) {
    sound._tone(ev.wave, ev.f0, ev.f1, t0 + ev.t, ev.dur, ev.vol * gain, null, 0.012);
  }
}

/**
 * 换季字幕出现时叫一次。听不见就先记下，等下一次盖子动了再放。
 * 不在这里 resume，锁屏解开本身不是页面手势。
 * @param {{ready:boolean, ctx?:{state?:string}, log:(name:string)=>void, _now:()=>number, _tone:(type:string, f0:number, f1:number, t0:number, dur:number, vol:number, dest:unknown, attack?:number)=>void}} sound
 * @param {number} season 扫向的那一季
 */
export function playSeasonMotif(sound, season) {
  const id = seasonIndex(season);
  sound.log(`motif-${id}`);
  if (!canHear(sound)) {
    motifDue = id;
    motifAt = null;
    return;
  }
  motifDue = null;
  motifAt = null;
  playNow(sound, id);
}

/** 补播被合盖打断时，没播成的那句也不要在下次轻轻一动时补上。 */
export function dropDeferredMotif() {
  motifDue = null;
  motifAt = null;
}

/**
 * 盖子相对记下动机时的角度动了，并且现在听得见，才补放。
 * @param {{ready:boolean, ctx?:{state?:string}, log:(name:string)=>void, _now:()=>number, _tone:(type:string, f0:number, f1:number, t0:number, dur:number, vol:number, dest:unknown, attack?:number)=>void}} sound
 * @param {number} angle
 */
export function releaseDeferredMotif(sound, angle) {
  if (motifDue == null) return false;
  if (motifAt == null) {
    motifAt = angle;
    return false;
  }
  if (Math.abs(angle - motifAt) < 0.35) return false;
  if (!canHear(sound)) return false;
  const id = motifDue;
  motifDue = null;
  motifAt = null;
  sound.log(`motif-${id}`);
  playNow(sound, id);
  return true;
}
