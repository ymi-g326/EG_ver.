import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {moduleUrl} from './helpers/load-typescript.mjs';
const {scratchControl}=await import(moduleUrl(new URL('../lib/scratch-control.ts',import.meta.url)));
const rate=8000;
function player(){
 let Player;vm.runInNewContext(readFileSync(new URL('../public/audio/scratch-player.js',import.meta.url),'utf8'),{
  sampleRate:rate,Float32Array,AudioWorkletProcessor:class{port={onmessage:null};},
  registerProcessor(name,type){assert.equal(name,'earth-scratch-player');Player=type;}
 });return new Player();
}
function message(p,data){p.port.onmessage({data});}
function signal(){return Float32Array.from({length:rate*2},(_,i)=>Math.sin(2*Math.PI*220*i/rate)*.3);}
function render(p,seconds){const out=[];for(let i=0;i<Math.ceil(seconds*rate/128);i++){const block=[new Float32Array(128),new Float32Array(128)];p.process([], [block]);out.push(...block[0]);}return out;}
function frequency(data){let count=0;for(let i=1;i<data.length;i++)if(data[i-1]<=0&&data[i]>0)count++;return count*rate/data.length;}

test('signed speed has no forced minimum; inertia brings normal music back before full rest without changing base BPM',()=>{
 assert.equal(scratchControl(0,1,true).rate,0);assert.equal(scratchControl(.5,1,true).rate,1.6);assert.equal(scratchControl(-.5,1,true).rate,-1.6);
 assert.equal(scratchControl(.01,1,true).rate,.032);assert.equal(scratchControl(.5,1,true).musicGain,0);
 let previous=0;for(const strength of [1,.7,.5,.4,.3,.2,.1,.01]){const control=scratchControl(-.6*strength,strength,false);assert.ok(control.blend>=previous);previous=control.blend;assert.ok(Math.abs(control.musicGain**2+control.scratchGain**2-1)<1e-9);}
 const tail=scratchControl(-.01,.08,false);assert.equal(tail.rate,1);assert.equal(tail.musicGain,1);assert.ok(tail.scratchGain<1e-9);
});

test('actual worklet continuously reads forward / backward; faster motion raises pitch rather than retriggering short grains',()=>{
 for(const speed of [1,2,-1]){
  const p=player();message(p,{type:'begin',channels:[signal()],rate:speed,weight:1,held:false});
  const initial=p.cursor;const first=render(p,.06);assert.ok(first.every(Number.isFinite));
  assert.equal(p.cursor>initial,speed>0);
  const audio=render(p,.25);assert.ok(Math.abs(frequency(audio)-220*Math.abs(speed))<12);
  assert.ok(audio.every(v=>Number.isFinite(v)&&Math.abs(v)<=.301));
 }
});

test('stationary hold becomes silent, finite buffer wrap stays bounded, and release fade / reset clears old sound',()=>{
 const p=player();message(p,{type:'begin',channels:[signal()],rate:2,weight:1,held:true});
 const stopped=render(p,.6);assert.ok(stopped.slice(-800).every(v=>Math.abs(v)<1e-5));
 message(p,{type:'control',rate:-3.2,weight:1,held:false});const looping=render(p,2.5);
 assert.ok(looping.every(v=>Number.isFinite(v)&&Math.abs(v)<.301));assert.ok(p.cursor>=0&&p.cursor<rate*2);
 message(p,{type:'end',seconds:.68});const ending=render(p,.8);assert.ok(ending.slice(-500).every(v=>v===0));assert.equal(p.clip,null);
 message(p,{type:'begin',channels:[signal()],rate:1,weight:1,held:false});assert.ok(render(p,.1).some(v=>Math.abs(v)>.1),'a new touch must work after an earlier fade');
 message(p,{type:'reset'});assert.ok(render(p,.1).every(v=>v===0));
});

test('the read head advances by audio samples independently of control message frequency',()=>{
 const run=blocks=>{const p=player();message(p,{type:'begin',channels:[signal()],rate:.8,weight:1,held:false});for(let i=0;i<30;i++){if(i%blocks===0)message(p,{type:'control',rate:.8,weight:1,held:false});render(p,.016);}return p.cursor;};
 assert.ok(Math.abs(run(1)-run(4))<1e-9);
});
