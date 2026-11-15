import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderQuality } from '../lib/render-quality.ts';
import { startupProgress } from '../lib/startup-progress.ts';

test('touch rendering bounds Retina pixels and avoids full-page refraction without changing desktop quality', () => {
  const phone = renderQuality(true, 3), desktop = renderQuality(false, 3);
  assert.equal(phone.refract, false);
  assert.equal(desktop.refract, true);
  assert.ok(phone.pixelRatio ** 2 < desktop.pixelRatio ** 2 * .6);
  assert.ok(phone.cloudSize ** 2 / phone.cloudInterval < desktop.cloudSize ** 2 / desktop.cloudInterval * .25);
  assert.ok(phone.waveLimit * phone.waveSegments < desktop.waveLimit * desktop.waveSegments / 4);
  for (const ratio of [NaN, Infinity, -1, 0, 1, 1.25, 3]) {
    const actual = renderQuality(true, ratio).pixelRatio;
    assert.ok(Number.isFinite(actual) && actual > 0 && actual <= 1.5);
  }
});

test('an image arriving before the orbit never reports that the satellite is ready', () => {
  const state = startupProgress({ orbit:'connecting', positionReady:false, imagery:'ready' });
  assert.equal(state.ready, false);
  assert.equal(state.title, 'てんこう2の位置を取得中');
  assert.deepEqual(state.steps.map(step => step.state), ['active','waiting','done']);
});

test('orbital elements, computed position and imagery finish independently', () => {
  const calculating = startupProgress({ orbit:'live', positionReady:false, imagery:'pending' });
  assert.equal(calculating.title, 'てんこう2の現在位置を計算中');
  const imaging = startupProgress({ orbit:'live', positionReady:true, imagery:'pending' });
  assert.equal(imaging.ready, false);
  assert.deepEqual(imaging.steps.map(step => step.state), ['done','done','active']);
  const ready = startupProgress({ orbit:'live', positionReady:true, imagery:'ready' });
  assert.equal(ready.ready, true);
});

test('failed sources report a failure while retries keep their completed position', () => {
  const orbitFailure = startupProgress({ orbit:'degraded', positionReady:false, imagery:'ready' });
  assert.equal(orbitFailure.failed, true);
  assert.equal(orbitFailure.ready, false);
  assert.match(orbitFailure.title, /軌道を取得できません/);
  const retry = startupProgress({ orbit:'live', positionReady:true, imagery:'retrying' });
  assert.equal(retry.failed, false);
  assert.match(retry.title, /位置は取得済み.*再取得中/);
  const failed = startupProgress({ orbit:'live', positionReady:true, imagery:'error' });
  assert.equal(failed.failed, true);
  assert.equal(failed.steps[1].state, 'done');
});

test('saved orbit elements remain explicitly distinguished from newly fetched ones', () => {
  const state = startupProgress({ orbit:'reference', positionReady:true, imagery:'pending' });
  assert.equal(state.steps[0].name, '保存した軌道');
  assert.equal(state.steps[0].state, 'done');
});
