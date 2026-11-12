import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/load-typescript.mjs';
import { fakeAudio } from './helpers/fake-audio.mjs';
const { listeningScore } = await import(moduleUrl(new URL('../lib/listening-score.ts', import.meta.url)));
const { EarthAudioEngine } = await import(moduleUrl(new URL('../lib/audio-engine.ts', import.meta.url)));
const { localFeatures } = await import(moduleUrl(new URL('../lib/local-journey.ts', import.meta.url)));

test('ocean and land have a musical floor; their independent texture inputs add bounded ornaments', () => {
  for (const profile of ['ocean', 'vegetated', 'arid', 'mixed']) {
    const calm = { ...localFeatures('sea-clear'), earthProfile: profile, cloudTexture: 0, cloudEdges: 0, groundEdges: 0, groundVariance: 0 };
    const textured = { ...calm, cloudTexture: 1, cloudEdges: 1, groundEdges: 1, groundVariance: 1 };
    assert.equal(listeningScore(calm, false, 0).motifSteps.length, 8);
    assert.equal(listeningScore(calm, false, 0).ornamentSteps.length, 0);
    const score = listeningScore(textured, false, 0);
    assert.equal(score.ornamentSteps.length, 4);
    assert.equal(new Set([...score.motifSteps, ...score.ornamentSteps]).size, 12);
    assert.equal(listeningScore(textured, false, 7).motifSteps.length, 4);
    assert.equal(listeningScore(textured, false, 7).ornamentSteps.length, 0);
    const independent = { ...calm, ...(profile === 'ocean' ? { groundEdges: 1, groundVariance: 1 } : { cloudTexture: 1, cloudEdges: 1 }) };
    assert.equal(listeningScore(independent, false, 0).ornamentSteps.length, 0);
  }
});

test('actual engine renders eight foreground notes, drums and bass in GROOVE; AMBIENT retains space', () => {
  const fake = fakeAudio();
  const saved = { AudioContext: globalThis.AudioContext, Audio: globalThis.Audio, window: globalThis.window };
  Object.assign(globalThis, fake);
  const features = { ...localFeatures('sea-clear'), source: 'live', cloudTexture: 0, cloudEdges: 0 };
  const engine = new EarthAudioEngine(() => features, undefined, true);
  try {
    engine.setListeningMode('groove'); engine.setTempo({ mode: 'manual', manualBpm: 120 });
    engine.start(); fake.advance(2);
    const events = engine.getDiagnostics().events;
    assert.equal(events.filter(e => e.layer === 'motif').length, 8);
    assert.equal(events.filter(e => e.instrument === 'GROOVE BASS').length, 4);
    assert.equal(events.filter(e => e.instrument === 'SOFT KICK').length, 4);
    assert.equal(events.filter(e => e.instrument === 'TEXTURE HAT').length, 8);
    assert.equal(engine.getDiagnostics().frame.detailSource, 'cloud-texture');
    engine.stop(); engine.resetSequence(); engine.setListeningMode('ambient');
    engine.start(); fake.advance(2);
    assert.equal(engine.getDiagnostics().events.filter(e => e.layer === 'pulse').length, 0);
    assert.equal(engine.getDiagnostics().events.filter(e => e.layer === 'motif').length, 1);
  } finally { engine.destroy(); Object.assign(globalThis, saved); }
  assert.equal(fake.sourceCount, 0);
  assert.equal(fake.timerCount, 0);
});
