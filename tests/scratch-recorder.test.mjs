import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('the actual worklet retains the latest two seconds in order, never echoes it, and discards paused audio', () => {
  let Recorder;
  const messages = [];
  const sandbox = {
    sampleRate: 8000, Float32Array,
    AudioWorkletProcessor: class { port = { onmessage: null, postMessage: data => messages.push(data) }; },
    registerProcessor(name, type) { assert.equal(name, 'earth-scratch-recorder'); Recorder = type; },
  };
  vm.runInNewContext(readFileSync(new URL('../public/audio/scratch-recorder.js', import.meta.url), 'utf8'), sandbox);
  const recorder = new Recorder();
  for (let block = 0; block < 400; block++) {
    const input = Float32Array.from({ length: 128 }, (_, i) => block * 128 + i);
    const output = [new Float32Array(128).fill(1)];
    recorder.process([[input]], [output]);
    assert.ok(output[0].every(sample => sample === 0));
  }
  recorder.port.onmessage({ data: { type: 'snapshot' } });
  const clip = messages.at(-1).channels;
  assert.equal(clip[0].length, 16000);
  assert.equal(clip[0][0], 400 * 128 - 16000);
  assert.equal(clip[0][15999], 400 * 128 - 1);
  assert.deepEqual(clip[1], clip[0]);
  assert.ok(messages.some(message => message.type === 'ready'));
  assert.equal(recorder.rings[0].length, 16000);
  recorder.port.onmessage({ data: { type: 'enabled', value: false } });
  const count = messages.length;
  recorder.process([[new Float32Array(128).fill(1)]], [[new Float32Array(128)]]);
  recorder.port.onmessage({ data: { type: 'snapshot' } });
  assert.equal(messages.length, count);
  assert.equal(recorder.count, 0);
});
