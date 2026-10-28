// 把 season-ritual 里的音符交给已有的 WebAudio 合成。没有外部音频文件。
import { motifEvents } from './season-ritual.js';
import { seasonIndex } from './rules.js';
import { TUNING } from './tuning.js';

/**
 * 换季字幕出现时叫一次。AudioContext 还没解锁就只记名字。
 * @param {{ready:boolean, log:(name:string)=>void, _now:()=>number, _tone:(type:string, f0:number, f1:number, t0:number, dur:number, vol:number, dest:unknown, attack?:number)=>void}} sound
 * @param {number} season 扫向的那一季
 */
export function playSeasonMotif(sound, season) {
  const id = seasonIndex(season);
  sound.log(`motif-${id}`);
  if (!sound.ready) return;
  const t0 = sound._now() + 0.05;
  const gain = TUNING.ritualMotifVol;
  for (const ev of motifEvents(id)) {
    sound._tone(ev.wave, ev.f0, ev.f1, t0 + ev.t, ev.dur, ev.vol * gain, null, 0.012);
  }
}
