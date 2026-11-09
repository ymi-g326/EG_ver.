import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/load-typescript.mjs';
import { fakeAudio } from './helpers/fake-audio.mjs';
const { projectGlobe, clipHorizon, scratchVelocity } = await import(moduleUrl(new URL('../lib/globe-geometry.ts', import.meta.url)));
const { EarthAudioEngine } = await import(moduleUrl(new URL('../lib/audio-engine.ts', import.meta.url)));
const { LocalJourney } = await import(moduleUrl(new URL('../lib/local-journey.ts', import.meta.url)));
const { localFeatures } = await import(moduleUrl(new URL('../lib/local-journey.ts', import.meta.url)));

test('the actual engine applies style-specific wind tempo while paused and playing without restarting the transport',()=>{
 const fake=fakeAudio(),saved={AudioContext:globalThis.AudioContext,Audio:globalThis.Audio,window:globalThis.window};
 Object.assign(globalThis,fake);
 let wind=20;
 const engine=new EarthAudioEngine(()=>({...localFeatures('forest-clear'),wind}),undefined,true);
 try{
  engine.setListeningMode('ambient');assert.equal(engine.getTempoStatus().bpm,100);
  engine.start();fake.advance(.5);assert.equal(engine.getTempoStatus().bpm,100);
  const clock=engine.getPlaybackSeconds();
  engine.setListeningMode('groove');assert.equal(engine.getTempoStatus().targetBpm,150);assert.equal(engine.getTempoStatus().bpm,100);
  fake.advance(5.2);assert.equal(engine.getTempoStatus().bpm,150);assert.ok(engine.getPlaybackSeconds()>clock+5);
  engine.setListeningMode('ambient');assert.equal(engine.getTempoStatus().targetBpm,100);
  fake.advance(5.2);assert.equal(engine.getTempoStatus().bpm,100);
  engine.stop();wind=6;
  assert.ok(Math.abs(engine.getTempoStatus().bpm-88.5714285714)<1e-8,'paused preview reflects the active style and latest wind');
  engine.setListeningMode('groove');assert.equal(engine.getTempoStatus().bpm,110);
  engine.setTempo({mode:'manual',manualBpm:140});engine.setListeningMode('ambient');assert.equal(engine.getTempoStatus().bpm,140);
  engine.setTempo({mode:'auto',manualBpm:140});assert.ok(engine.getTempoStatus().bpm<100);
 }finally{engine.destroy();Object.assign(globalThis,saved);}
});

test('the camera rotates the view without modifying the geographic position; rear markers stay behind the globe', () => {
  const satellite = { latitude: 35, longitude: 140 };
  const before = { ...satellite };
  const front = projectGlobe(satellite, 140, 35);
  assert.ok(Math.abs(front.x) < 1e-10 && Math.abs(front.y) < 1e-10);
  assert.ok(front.z > .999);
  assert.ok(projectGlobe(satellite, -40, -35).z < -.999);
  assert.deepEqual(satellite, before);
  const clipped = clipHorizon([{ x: -.5, y: .5, z: -.5 }, { x: .5, y: .5, z: .5 }, { x: 0, y: -.5, z: .5 }]);
  assert.ok(clipped.length >= 3);
  assert.ok(clipped.every(p => p.z >= 0 && Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.equal(scratchVelocity(2000, 1), 1);
  assert.equal(scratchVelocity(-2000, 1), -1);
  assert.equal(scratchVelocity(Infinity, 1), 0);
});

function withAudio(run) {
  const fake = fakeAudio();
  const saved = { AudioContext: globalThis.AudioContext, Audio: globalThis.Audio, window: globalThis.window };
  Object.assign(globalThis, fake);
  const journey = new LocalJourney(() => .3);
  let scene = journey.next();
  const engine = new EarthAudioEngine(() => scene.features, undefined, true);
  try { run({ fake, engine, next: () => { scene = journey.next(); } }); }
  finally { engine.destroy(); Object.assign(globalThis, saved); }
}

test('ambient leaves space between melodies; groove adds soft percussion without restarting playback', () => withAudio(({ fake, engine }) => {
  engine.setListeningMode('ambient'); engine.start(); fake.advance(12);
  let d = engine.getDiagnostics();
  assert.equal(d.listeningMode, 'ambient');
  assert.equal(d.events.filter(e => e.layer === 'pulse').length, 0);
  assert.ok(d.events.some(e => e.instrument === 'NATURAL BED'));
  assert.ok(d.events.filter(e => e.layer === 'motif').length < 10);
  const clock = engine.getPlaybackSeconds();
  engine.setListeningMode('groove'); fake.advance(4);
  d = engine.getDiagnostics();
  assert.ok(d.transport.playedSeconds > clock);
  assert.equal(d.listeningMode, 'groove');
  assert.ok(d.events.some(e => e.instrument === 'SOFT BRUSH'));
}));

test('forward and reverse scratch are bounded, keep the transport moving, and do nothing while paused', () => withAudio(({ fake, engine }) => {
  engine.setListeningMode('ambient'); engine.start(); fake.advance(1);
  for (let i = 0; i < 300; i++) { engine.scratch(i % 2 ? .7 : -.7); fake.advance(.01); }
  const d = engine.getDiagnostics();
  assert.ok(d.transport.playedSeconds > 3.9);
  assert.ok(d.events.some(e => e.instrument === 'SCRATCH / PREVIEW back'));
  assert.ok(d.events.some(e => e.instrument === 'SCRATCH / PREVIEW forward'));
  assert.ok(d.transport.activeSources < 40);
  assert.ok(d.transport.themeBuffers <= 48);
  engine.stop(); fake.advance(1);
  const count = fake.sourceCount;
  engine.scratch(.8); engine.scratch(NaN);
  assert.equal(fake.sourceCount, count);
}));

test('two virtual hours of V2 styles and landscape changes keep resources bounded', () => withAudio(({ fake, engine, next }) => {
  engine.setListeningMode('ambient'); engine.start();
  let peakSources = 0, peakConnections = 0;
  for (let second = 0; second < 7200; second++) {
    if (second % 60 === 0) engine.queueSceneChange(next);
    if (second % 300 === 0) engine.setListeningMode(second % 600 === 0 ? 'ambient' : 'groove');
    fake.advance(1, .05);
    const d = engine.getDiagnostics();
    peakSources = Math.max(peakSources, d.transport.activeSources);
    peakConnections = Math.max(peakConnections, fake.connectionCount);
    assert.ok(d.transport.activeSources < 60);
    assert.ok(d.transport.themeBuffers <= 48);
    assert.ok(fake.connectionCount < 240);
  }
  assert.ok(engine.getPlaybackSeconds() > 7199);
  console.log(JSON.stringify({ v2VirtualSeconds: engine.getPlaybackSeconds(), peakSources, peakConnections }));
}));


test('the live audio snapshot is scrubbed in both directions and releasing restores the background', async () => {
  const fake = fakeAudio();
  const saved = { AudioContext: globalThis.AudioContext, Audio: globalThis.Audio, window: globalThis.window, AudioWorkletNode: globalThis.AudioWorkletNode };
  let snapshots = 0;
  fake.AudioContext.prototype.audioWorklet = { addModule: async path => assert.ok(['/audio/scratch-recorder.js','/audio/scratch-player.js'].includes(path)) };
  class Recorder {
    port = {
      onmessage: null,
      close() {},
      postMessage: data => {
        if (data.type === 'enabled' && data.value) queueMicrotask(() => this.port.onmessage?.({ data: { type: 'ready' } }));
        if (data.type === 'snapshot') {
          snapshots++;
          const samples = Float32Array.from({ length: 8000 }, (_, i) => Math.sin(i * .2) * .03);
          queueMicrotask(() => this.port.onmessage?.({ data: { type: 'snapshot', channels: [samples, samples] } }));
        }
      },
    };
    connect(target) { return target; }
    disconnect() {}
  }
  Object.assign(globalThis, fake, { AudioWorkletNode: Recorder });
  const journey = new LocalJourney(() => .3), scene = journey.next();
  const engine = new EarthAudioEngine(() => scene.features, undefined, true);
  try {
    engine.setListeningMode('ambient'); engine.start();
    await Promise.resolve(); await Promise.resolve();
    fake.advance(1);
    assert.equal(engine.getDiagnostics().scratch.ready, true);
    engine.beginScratch(); await Promise.resolve();
    assert.equal(engine.getDiagnostics().scratch.capturedSeconds, 1);
    engine.scratch(.8); fake.advance(.08); engine.scratch(-.8); fake.advance(.02);
    const d = engine.getDiagnostics();
    assert.ok(d.events.some(e => e.instrument === 'SCRATCH / LIVE forward'));
    assert.ok(d.events.some(e => e.instrument === 'SCRATCH / LIVE back'));
    assert.equal(snapshots, 1, 'the held clip must not be replaced by the ducked background during one gesture');
    fake.advance(.3);
    assert.equal(engine.getDiagnostics().scratch.active, false, 'lost pointer-up cannot leave the background ducked');
    engine.setNatureLevel(0);
    assert.equal(engine.getDiagnostics().natureLevel, 0);
    engine.setNatureLevel(NaN);
    assert.equal(engine.getDiagnostics().natureLevel, 0);
    engine.stop(); assert.equal(engine.getDiagnostics().scratch.ready, false);
    engine.start(); await Promise.resolve(); fake.advance(.3);
    assert.equal(engine.getDiagnostics().scratch.ready, true);
  } finally { engine.destroy(); Object.assign(globalThis, saved); }
});
