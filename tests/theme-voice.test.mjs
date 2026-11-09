import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderThemeVoice, themeForProfile, motifInstrument} from '../lib/theme-voice.ts';

const rms = data => Math.sqrt(data.reduce((sum, v) => sum + v*v, 0) / data.length);
function magnitude(samples, hz, rate, start=.09, end=.25) {
  let re=0,im=0;
  for(let i=Math.round(start*rate);i<Math.round(end*rate);i++) {
    re+=samples[i]*Math.cos(2*Math.PI*hz*i/rate);
    im-=samples[i]*Math.sin(2*Math.PI*hz*i/rate);
  }
  return Math.hypot(re,im);
}

test('theme notes have bounded finite output and silent endpoints at common browser sample rates',()=>{
  for(const theme of ['harp','water']) for(const rate of [44100,48000]) for(const hz of [196,440,1568]) {
    const data=renderThemeVoice(theme,hz,.6,rate);
    assert.equal(data.length,Math.ceil(.6*rate));
    assert.equal(Math.abs(data[0]),0); assert.equal(Math.abs(data.at(-1)),0);
    assert.ok(data.every(v=>Number.isFinite(v)&&Math.abs(v)<=.951));
    assert.ok(rms(data)>.03);
    assert.ok(rms(data.slice(-Math.round(rate*.05)))<rms(data.slice(0,Math.round(rate*.05)))*.05);
  }
  for(const bad of [[0,1,48000],[NaN,1,48000],[440,0,48000],[440,1,0],[24000,1,48000]])
    assert.throws(()=>renderThemeVoice('harp',...bad),RangeError);
});

test('harp and water settle on the requested musical pitch but have distinct deterministic attacks',()=>{
  const rate=48000, hz=440;
  const harp=renderThemeVoice('harp',hz,.7,rate),water=renderThemeVoice('water',hz,.7,rate);
  for(const data of [harp,water]) {
    const fundamental=magnitude(data,hz,rate);
    assert.ok(fundamental>magnitude(data,hz*2**(1/12),rate)*4,'target note dominates the adjacent semitone');
    assert.ok(fundamental>magnitude(data,hz/2**(1/12),rate)*4);
  }
  assert.deepEqual(harp,renderThemeVoice('harp',hz,.7,rate));
  assert.deepEqual(water,renderThemeVoice('water',hz,.7,rate));
  const difference=harp.slice(0,4800).map((v,i)=>v-water[i]);
  assert.ok(rms(difference)>.2,'different instrument attacks remain distinct at the same pitch');
  for(const theme of ['harp','water']) {
    const short=renderThemeVoice(theme,hz,.3,rate),long=renderThemeVoice(theme,hz,1.05,rate);
    assert.ok(rms(long.slice(9600,12000))>rms(short.slice(9600,12000))*4,'cloudy articulation rings longer');
  }
});

test('the first prototype maps only forest and ocean, with an identifiable original comparison',()=>{
  assert.equal(themeForProfile('vegetated'),'harp'); assert.equal(themeForProfile('ocean'),'water');
  for(const profile of ['arid','mixed','cloud'])assert.equal(themeForProfile(profile),null);
  assert.match(motifInstrument('vegetated'),/ハープ/);assert.match(motifInstrument('ocean'),/水滴/);
  assert.equal(motifInstrument('vegetated','original'),motifInstrument('ocean','original'));
});
