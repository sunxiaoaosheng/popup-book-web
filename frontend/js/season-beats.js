/**
 * 不计入手账的季节小反应。春：在窗台停够两秒，蝴蝶停一下。
 * 冬：第一次站上窗台，缩进围巾。字幕忙着说别的话时让路。
 */

/**
 * @param {{springSaid:boolean, winterSaid:boolean, springT:number}} beats
 * @param {{dt:number, season:number, onSill:boolean, angle:number, captionBusy:boolean}} input
 */
export function stepSeasonBeats(beats, { dt, season, onSill, angle, captionBusy }) {
  /** @type {object[]} */
  const events = [];
  if (angle < 30) {
    beats.springSaid = false;
    beats.winterSaid = false;
    beats.springT = 0;
    return events;
  }
  if (season === 0 && onSill) beats.springT += dt;
  else beats.springT = 0;
  if (!captionBusy && season === 0 && onSill && beats.springT >= 2 && !beats.springSaid) {
    beats.springSaid = true;
    events.push({ type: 'season-beat', id: 'butterfly', text: '春 · 一只蝴蝶在窗台前停了一下' });
  }
  if (!captionBusy && season === 3 && onSill && !beats.winterSaid) {
    beats.winterSaid = true;
    events.push({ type: 'season-beat', id: 'shiver', text: '冬 · 小猫把脖子缩进围巾里' });
  }
  return events;
}
