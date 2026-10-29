import { stepMotion } from './sim-motion.js';
import { stepStage } from './sim-stage.js';
import { stepKitten } from './sim-kitten.js';
import { stepAmbient } from './sim-ambient.js';
import { stepFeel } from './sim-feel.js';
import { stepStageCurtain } from './stage-show-wire.js';

export function step(W, dt) {
  stepMotion(W, dt);
  stepStage(W, dt);
  stepKitten(W, dt);
  stepAmbient(W, dt);
  stepFeel(W, dt);
  stepStageCurtain(W, dt);
  if (W.watchJournal) W.watchJournal(dt);
}
