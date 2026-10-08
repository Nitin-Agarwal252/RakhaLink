import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCrashSequence, demoCrashTraces } from './crashDetector.mjs';

test('a single impact spike does not trigger a crash sequence', () => {
  assert.equal(detectCrashSequence(demoCrashTraces.singleSpike), null);
});

test('speed context, impact, and sudden stop produce a replay signal', () => {
  const signal = detectCrashSequence(demoCrashTraces.impactAndSuddenStop);
  assert.equal(signal.peak_g, 8.4);
  assert.equal(signal.pre_impact_kmh, 72);
});

test('an impact without speed context is ignored', () => {
  assert.equal(detectCrashSequence(demoCrashTraces.impactWithoutSpeedContext), null);
});
