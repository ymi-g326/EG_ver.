import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/load-typescript.mjs';
import { fakeAudio } from './helpers/fake-audio.mjs';
const { EarthAudioEngine } = await import(moduleUrl(new URL('../lib/audio-engine.ts', import.meta.url)));
const { localFeatures } = await import(moduleUrl(new URL('../lib/local-journey.ts', import.meta.url)));

test('stone samples are quieter independently; coastal ratios and other nature sounds retain their balance', () => {
  for (const [profile, landFraction, expected] of [
    ['mixed', 1, { mixed: .25 }],
    ['mixed', .5, { mixed: .125, ocean: .5 }],
    ['vegetated', 1, { vegetated: 1 }],
    ['ocean', 0, { ocean: 1 }],
  ]) {
    const fake = fakeAudio();
    const saved = { AudioContext: globalThis.AudioContext, Audio: globalThis.Audio, window: globalThis.window };
    Object.assign(globalThis, fake);
    const features = { ...localFeatures('mixed-clear'), earthProfile: profile, landProfile: profile === 'ocean' ? 'mixed' : profile, landFraction };
    const engine = new EarthAudioEngine(() => features, undefined, true);
    try {
      engine.setListeningMode('ambient'); engine.start(); fake.advance(2);
      const samples = engine.getDiagnostics().samples;
      assert.equal(samples.reduce((sum,s) => sum + s.weight, 0), 1);
      for (const [name, gain] of Object.entries(expected)) {
        const sample = samples.find(s => s.profile === name);
        assert.ok(sample, name);
        assert.ok(Math.abs(sample.appliedGain - gain) < 1e-8, `${name}: ${sample.appliedGain}`);
      }
    } finally { engine.destroy(); Object.assign(globalThis, saved); }
  }
});
