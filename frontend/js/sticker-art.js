/**
 * 八张手绘贴纸。纯 SVG 字符串，不引图片。
 */
const INK = '#6a4324';

/** @param {string} [extra] */
function ink(extra = '') {
  return `fill="none" stroke="${INK}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"${extra ? ` ${extra}` : ''}`;
}

/** @param {string} body */
function wrap(body) {
  return `<svg viewBox="0 0 80 80" class="stk-svg" aria-hidden="true">${body}</svg>`;
}

/** @type {Record<string, () => string>} */
const DRAW = {
  seam() {
    return `
      <path d="M40 6 C43 16 36 26 41 38 C37 50 44 62 39 74" ${ink()}/>
      <ellipse cx="28" cy="38" rx="8" ry="5.5" fill="#fffaf2" ${ink()}/>
      <ellipse cx="52" cy="37" rx="8" ry="5.5" fill="#fffaf2" ${ink()}/>
      <circle cx="29" cy="38" r="2.1" fill="${INK}"/>
      <circle cx="51" cy="37" r="2.1" fill="${INK}"/>`;
  },
  nap() {
    return `
      <rect x="48" y="16" width="8" height="16" rx="1" fill="#d7b48a" ${ink()}/>
      <path d="M46 16 H58" ${ink()}/>
      <path d="M16 54 C16 40 28 36 40 40 C52 34 68 42 64 54 C60 62 20 64 16 54 Z" fill="#f2a24a" ${ink()}/>
      <path d="M30 48 q2 2 0 4" ${ink()}/>
      <path d="M58 28 l4 -6" ${ink('stroke-width="1.6"')}/>
      <path d="M66 24 l3 -5" ${ink('stroke-width="1.4"')}/>`;
  },
  heart() {
    return `
      <path d="M40 64 C16 48 12 30 24 22 C32 16 40 24 40 24 C40 24 48 16 56 22 C68 30 64 48 40 64 Z" fill="#e15b55" ${ink()}/>
      <path d="M22 18 l-4 -6 M58 16 l6 -4" ${ink('stroke-width="1.5"')}/>`;
  },
  owl() {
    return `
      <path d="M27 34 L22 16 L34 30" fill="#e6d3a8" ${ink()}/>
      <path d="M53 34 L58 16 L46 30" fill="#e6d3a8" ${ink()}/>
      <ellipse cx="40" cy="46" rx="18" ry="16" fill="#e6d3a8" ${ink()}/>
      <circle cx="32" cy="44" r="6.2" fill="#fffaf2" ${ink()}/>
      <circle cx="48" cy="44" r="6.2" fill="#fffaf2" ${ink()}/>
      <circle cx="33" cy="45" r="2.3" fill="${INK}"/>
      <circle cx="49" cy="45" r="2.3" fill="${INK}"/>
      <path d="M37 54 l3 6 l3 -6 Z" fill="#c47a3a" ${ink('stroke-width="1.3"')}/>
      <path d="M18 50 Q10 42 16 36" ${ink()}/>
      <path d="M62 50 Q70 42 64 36" ${ink()}/>`;
  },
  shake() {
    return `
      <path d="M40 62 V34" ${ink()}/>
      <path d="M40 40 L24 58 H56 Z" fill="#7d9a62" ${ink()}/>
      <path d="M18 22 q6 2 4 8 M62 18 q-2 8 6 8 M30 16 q4 6 -2 8" ${ink('stroke="#c45a3a"')}/>`;
  },
  chase() {
    return `
      <circle cx="22" cy="24" r="3.2" fill="#e7f29a" ${ink('stroke-width="1.4"')}/>
      <circle cx="58" cy="18" r="2.4" fill="#e7f29a" ${ink('stroke-width="1.3"')}/>
      <circle cx="68" cy="36" r="2.8" fill="#e7f29a" ${ink('stroke-width="1.3"')}/>
      <path d="M14 58 C22 44 34 46 40 52 C46 44 58 48 62 40" ${ink()}/>
      <circle cx="40" cy="50" r="4" fill="#f2a24a" ${ink()}/>
      <path d="M36 46 l-4 -6 M44 46 l5 -5" ${ink('stroke-width="1.6"')}/>`;
  },
  fullday() {
    const pts = [[40, 12], [28, 22], [52, 22], [22, 36], [40, 32], [58, 36], [30, 52], [50, 52], [40, 66]];
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
    const dots = pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#ffe7a8" stroke="${INK}" stroke-width="1"/>`).join('');
    return `<path d="${d}" ${ink('stroke="#e2c27a" stroke-dasharray="2.5 3.5" stroke-width="1.3"')}/>${dots}`;
  },
  goodnight() {
    return `
      <path d="M58 18 A16 16 0 1 0 58 50 A12 12 0 1 1 58 18 Z" fill="#f3e2a4" ${ink()}/>
      <path d="M14 58 H40 V68 H14 Z" fill="#f7efe0" ${ink()}/>
      <path d="M18 58 V52 H36 V58" ${ink()}/>`;
  },
};

/** @param {string} id */
export function stickerMarkup(id) {
  const draw = DRAW[id];
  return wrap(draw ? draw() : '');
}

export function stickerArtIds() {
  return Object.keys(DRAW);
}
