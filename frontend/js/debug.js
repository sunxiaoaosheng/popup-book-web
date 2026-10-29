// 自动化测试用的 window.__popup。字段在 v6 的基础上多了 net.dropped 和 net.link。
import { Sound } from './audio.js';
import { createFeelState, stepHingeFeel } from './hinge-feel.js';
import { lerp } from './math.js';
import { step } from './sim.js';
import { ritualFront, ritualIntensity, ritualKind } from './season-ritual.js';
import { eyeReadGain } from './eye-read.js';

function packEye(g) {
  if (!g) return null;
  const halo = g.userData && g.userData.halo;
  return {
    sx: +g.scale.x.toFixed(3),
    sy: +g.scale.y.toFixed(3),
    z: +g.position.z.toFixed(3),
    tilt: +g.rotation.x.toFixed(3),
    rim: halo ? +halo.material.opacity.toFixed(3) : 0,
  };
}

/** 合页上核对用：小猫左眼和缝里的左眼。 */
function eyeSample(W) {
  const seam = W.seamEyes && W.seamEyes.userData.eyes && W.seamEyes.userData.eyes[0];
  return {
    kitten: packEye(W.K && W.K.eyes && W.K.eyes[0]),
    kittenOn: !!(W.kitten && W.kitten.visible),
    seam: packEye(seam && seam.g),
    seamOn: !!(W.seamEyes && W.seamEyes.visible),
  };
}

export function attachDebug(W, input) {
  const { S } = W;
  const v = W.tmp.v;
  const cv = W.gfx.renderer.domElement;

  function renderNow() {
    W.gfx.forceShadow();
    W.gfx.renderer.render(W.gfx.scene, W.gfx.camera);
  }

  const projectTo = (obj, dy = 0) => {
    obj.getWorldPosition(v);
    v.y += dy;
    v.project(W.camera);
    const r = cv.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top };
  };

  async function audioProbe() {
    const res = {};
    const render = async (name, fn) => {
      const c = new OfflineAudioContext(1, 44100 * 3, 44100);
      const s = new Sound();
      s.attach(c);
      fn(s);
      const buf = await c.startRendering();
      const d = buf.getChannelData(0);
      let pk = 0, sq = 0;
      for (let i = 0; i < d.length; i++) {
        const x = Math.abs(d[i]);
        if (x > pk) pk = x;
        sq += d[i] * d[i];
      }
      res[name] = { peak: +pk.toFixed(4), rms: +Math.sqrt(sq / d.length).toFixed(4) };
    };
    await render('ambience+rustle', (s) => { s.setEnv({ amb: 1, night: 0, season: 0, speed: 90, wind: 1 }, 1); });
    await render('meow', (s) => s.meow());
    await render('mew', (s) => s.mew());
    await render('purr', (s) => s.purr(true));
    await render('hoot', (s) => s.hoot());
    await render('flap', (s) => s.flap());
    await render('chime', (s) => s.chime());
    await render('shake', (s) => s.shake(0));
    await render('thud', (s) => s.thud());
    await render('lullaby', (s) => s.lullaby(3));
    const st = createFeelState();
    stepHingeFeel(st, { angle: 70, speed: 0, dt: 0.016, time: 0, level: 'normal' });
    const loud = stepHingeFeel(st, { angle: 100, speed: 100, dt: 0.05, time: 0.2, level: 'normal' });
    await render('hinge-foley', (s) => { s.stepHinge(loud, 0.2); });
    await render('hinge-muted', (s) => { s.setMuted(true); s.stepHinge(loud, 0.2); });
    return res;
  }

  /** @type {any} */ (window).__popup = {
    setAngle: input.setAngle,
    S,
    store: W.store,
    sound: W.sound,
    ui: W.ui,
    audioProbe,
    settle(sec = 4) {
      const n = sec * 60;
      for (let i = 0; i < n; i++) step(W, 1 / 60);
      renderNow();
      input.refreshHud();
    },
    sweep(from, to, sec) {
      const n = Math.max(1, Math.round(sec * 60));
      for (let i = 0; i <= n; i++) {
        input.setAngle(lerp(from, to, i / n));
        step(W, 1 / 60);
      }
      renderNow();
    },
    wiggle(center, amp, freq, sec) {
      const n = Math.round(sec * 60);
      for (let i = 0; i <= n; i++) {
        input.setAngle(center + amp * Math.sin(2 * Math.PI * freq * i / 60));
        step(W, 1 / 60);
      }
      input.setAngle(center);
      renderNow();
    },
    forceSeason(i) { W.setSeason(i, true); },
    beginSeason(i) { W.setSeason(i, false); },
    render() { renderNow(); },
    project(name) {
      const o = {
        kitten: [W.kitten, 0.35],
        owl: [W.owl, 0.3],
        tree: [W.owlTree.g, W.owlTree.h * 0.4],
      }[name];
      return projectTo(o[0], o[1]);
    },
    dbg() {
      const sun = W.gfx.sun;
      const SEASON = W.SEASON;
      return {
        A: +S.filtered.toFixed(2), sp: +S.sp.toFixed(1), season: S.season, shy: +S.shy.toFixed(2),
        napP: +S.napP.toFixed(2), chaseP: +S.chaseP.toFixed(2), flutT: +S.flutT.toFixed(2),
        burstT: +S.burstT.toFixed(2), owl: W.O.state, owlVisible: W.owl.visible, kittenVisible: W.kitten.visible,
        act: { ...S.act }, seamEye: +(S.seamEye || 0).toFixed(2),
        eyeRead: +eyeReadGain(S.filtered).toFixed(2),
        eyes: eyeSample(W),
        holdT: +S.hold.t.toFixed(2), holdBand: S.hold.band, found: W.store.foundCount(), cycles: W.store.cycles,
        petE: +S.petE.toFixed(2), ending: S.endMode,
        sunU: +S.dayU.toFixed(3), sunVisible: W.paperSun.visible,
        sunPos: W.paperSun.position.toArray().map((x) => +x.toFixed(2)),
        light: sun.position.toArray().map((x) => +x.toFixed(2)),
        sunI: +sun.intensity.toFixed(2), tod: S.tod, sky: '#' + W.skyMat.color.getHexString(),
        horizon: +W.horizonMat.opacity.toFixed(2),
        run: { ...S.run, t0: undefined, dur: +S.run.dur.toFixed(2) },
        conP: +S.conP.toFixed(2), conVisible: W.catStars.visible,
        watchW: +S.watchW.toFixed(2), noonW: +S.noonW.toFixed(2), sneezes: S.sneezes,
        sneeze: +(S.sneeze || 0).toFixed(2), lookX: +S.lookX.toFixed(2), lookY: +S.lookY.toFixed(2), caption: S.cap,
        dawnStretch: +S.dawnW.toFixed(2), dawnPose: +(S.dawnStretch || 0).toFixed(2),
        dawnHeld: !!S.dawnHeld, dawnSaid: !!S.dawnSaid, period: S.tod,
        kittenMode: S.kittenMode,
        mood: S.kittenMood.mood, moodAct: S.kittenMood.act, asleep: !!S.kittenMood.asleep,
        moodCap: S.moodCap || '', greet: S.kittenMood.greetKind || '',
        seasonFrom: SEASON.from, seasonTo: SEASON.to, seasonT: +SEASON.t.toFixed(3),
        seasonMorphing: SEASON.t < 1 && SEASON.from !== SEASON.to, seasonMorphSaid: !!S.seasonMorphSaid,
        seasonCatchup: !!S.seasonCatchup, revealOpen: !!S.revealOpen,
        ritual: (SEASON.from !== SEASON.to && SEASON.t < 1) ? ritualKind(SEASON.to) : '',
        ritualAmp: +ritualIntensity(SEASON.t).toFixed(3),
        ritualFront: +ritualFront(SEASON.t).toFixed(3),
        kittenPos: W.kitten.position.toArray().map((x) => +x.toFixed(2)), hover: S.hover,
        feel: W.store.feel,
        ambient: W.ambient ? W.ambient.snapshot(!!W.store.ambient, performance.now()) : null,
        camFov: +W.camera.fov.toFixed(3),
        hinge: W.feelState ? {
          creak: +W.feelState.out.creakGain.toFixed(3),
          fov: +W.feelState.out.fov.toFixed(3),
          shake: +Math.hypot(W.feelState.out.shakeX, W.feelState.out.shakeY).toFixed(4),
        } : null,
        stage: stageDbg(W),
        events: W.sound.events.slice(-14),
        trees: W.trees.map((t) => ({ row: t.row, q: +t.q.toFixed(3), phi: +(t.phi / (Math.PI / 2)).toFixed(3) })),
        net: { connects: W.net.connects, coalesced: W.net.coalesced, dropped: W.net.dropped, link: W.net.link },
      };
    },
  };
}

/** @param {any} W */
function stageDbg(W) {
  const snap = W.stageSnap;
  if (!snap) return null;
  return {
    beat: snap.beat,
    mode: snap.mode,
    vignette: +snap.vignette.toFixed(3),
    slit: +snap.slit.toFixed(3),
    dim: +snap.dim.toFixed(3),
    sweep: +snap.sweepGlow.toFixed(3),
    flash: +snap.flash.toFixed(3),
    bow: +snap.bow.toFixed(3),
    premiered: !!snap.premiered,
    closeStyle: snap.closeStyle || '',
    ground: +snap.layers.ground.toFixed(3),
    kitten: +snap.layers.kitten.toFixed(3),
  };
}
