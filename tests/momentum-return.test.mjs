import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
const {planMomentumReturn,momentumReturnView,momentumReturnMotion}=await import(moduleUrl(new URL('../lib/momentum-return.ts',import.meta.url)));
const {longitudeDelta,liveReturnView,LIVE_RETURN_GLIDE_MS}=await import(moduleUrl(new URL('../lib/live-return.ts',import.meta.url)));
const {advanceGlobeMomentum}=await import(moduleUrl(new URL('../lib/globe-motion.ts',import.meta.url)));

const duration=LIVE_RETURN_GLIDE_MS;

test('scratch audio follows the landing tangent continuously and reaches zero speed at arrival',()=>{
 for(const sign of [-1,1]){
  const target={longitude:-175,latitude:-10},plan=planMomentumReturn({longitude:170,latitude:15},target,{longitude:sign*400,latitude:35});
  assert.deepEqual(momentumReturnMotion(plan,target,0),plan.motion);
  for(let t=8;t<duration-8;t+=16){
   const velocity=momentumReturnMotion(plan,target,t);
   assert.ok(Number.isFinite(velocity.longitude)&&Number.isFinite(velocity.latitude));
   const a=momentumReturnView(plan,target,t-1),b=momentumReturnView(plan,target,t+1);
   assert.ok(Math.abs(velocity.longitude-longitudeDelta(a.longitude,b.longitude)/.002)<.1);
  }
  assert.deepEqual(momentumReturnMotion(plan,target,duration),{longitude:0,latitude:0});
 }
});

test('return entry retains the outgoing angular velocity instead of restarting at rest',()=>{
 for(const sign of [-1,1]){
  const from={longitude:170,latitude:15},target={longitude:-175,latitude:-10},motion={longitude:sign*400,latitude:sign*35};
  const plan=planMomentumReturn(from,target,motion);
  assert.deepEqual(momentumReturnView(plan,target,0),from);
  const first=momentumReturnView(plan,target,.1);
  assert.ok(Math.abs(longitudeDelta(from.longitude,first.longitude)/.0001-motion.longitude)<.1);
  assert.ok(Math.abs((first.latitude-from.latitude)/.0001-motion.latitude)<.02);
  const expected=advanceGlobeMomentum(from,motion,16).view,frame=momentumReturnView(plan,target,16);
  assert.ok(Math.abs(longitudeDelta(expected.longitude,frame.longitude))<.002);
  assert.ok(Math.abs(expected.latitude-frame.latitude)<.002);
  assert.ok(Math.abs(longitudeDelta(from.longitude,frame.longitude))>6,'the first painted return frame must keep moving');
 }
});

test('fast throws keep their direction across a landing lap and settle exactly on LIVE',()=>{
 for(const sign of [-1,1])for(const start of [-179,0,179])for(const end of [-179,-90,0,90,179]){
  const from={longitude:start,latitude:20},target={longitude:end,latitude:-12};
  const plan=planMomentumReturn(from,target,{longitude:sign*480,latitude:0});
  let previous=from,total=0;
  for(let time=16;time<=duration;time+=16){
   const next=momentumReturnView(plan,target,time),step=longitudeDelta(previous.longitude,next.longitude);
   assert.ok(sign*step>=-1e-7,'a fast return must not abruptly reverse to the short arc');
   assert.ok(Math.abs(step)<9,'the path must not jump between longitude wraps');
   total+=step;previous=next;
  }
  assert.ok(Math.abs(total-plan.longitudeTravel)<1e-7);
  assert.deepEqual(previous,target);
 }
});

test('zero momentum keeps the existing paused/manual glide, and a light throw starts in its own direction',()=>{
 const from={longitude:179,latitude:20},target={longitude:-179,latitude:-10};
 const plan=planMomentumReturn(from,target,{longitude:0,latitude:0});
 for(const t of [0,.01,.25,.5,.75,.99,1]){
  const expected=liveReturnView(from,target,t),actual=momentumReturnView(plan,target,t*duration);
  assert.ok(Math.abs(longitudeDelta(expected.longitude,actual.longitude))<1e-9);
  assert.ok(Math.abs(expected.latitude-actual.latitude)<1e-9);
 }
 const light=planMomentumReturn({longitude:0,latitude:0},{longitude:-30,latitude:0},{longitude:8,latitude:0});
 assert.equal(light.longitudeTravel,-30,'a light gesture should not force an extra global lap');
 assert.ok(momentumReturnView(light,{longitude:-30,latitude:0},1).longitude>0);
});

test('vertical momentum remains finite and inside the polar camera bounds throughout a return',()=>{
 for(const start of [-75,-74.9,0,74.9,75])for(const speed of [-300,300])for(const end of [-90,90]){
  const target={longitude:-179,latitude:end};
  const plan=planMomentumReturn({longitude:179,latitude:start},target,{longitude:350,latitude:speed});
  for(let time=0;time<=duration;time+=8){
   const view=momentumReturnView(plan,target,time);
   assert.ok(Number.isFinite(view.longitude)&&Number.isFinite(view.latitude));
   assert.ok(view.longitude>=-180&&view.longitude<=180);
   assert.ok(view.latitude>=-75&&view.latitude<=75);
  }
  assert.equal(momentumReturnView(plan,target,duration).latitude,Math.sign(end)*75);
 }
});

test('the landing follows a moving satellite across the date line without changing its chosen lap',()=>{
 const target={longitude:179.98,latitude:5};
 const plan=planMomentumReturn({longitude:-170,latitude:10},target,{longitude:480,latitude:20});
 let previous=plan.from;
 for(let time=16;time<=duration;time+=16){
  const latest={longitude:((179.98+time/1000*.05+180)%360)-180,latitude:5+time/1000*.01};
  const view=momentumReturnView(plan,latest,time);
  assert.ok(Math.abs(longitudeDelta(previous.longitude,view.longitude))<9);
  if(time===duration)assert.deepEqual(view,latest);
  previous=view;
 }
});

test('return plans snapshot mutable camera/target values and sample by elapsed time independently of frame rate',()=>{
 const from={longitude:10,latitude:20},target={longitude:-50,latitude:-10},motion={longitude:420,latitude:50};
 const plan=planMomentumReturn(from,target,motion);
 from.longitude=100;target.longitude=90;motion.longitude=-480;
 assert.deepEqual(momentumReturnView(plan,plan.target,0),{longitude:10,latitude:20});
 for(const step of [8,16,32,100]){
  let time=0;
  while(time<duration){time=Math.min(duration,time+step);const view=momentumReturnView(plan,plan.target,time);assert.ok(Number.isFinite(view.longitude));}
  assert.deepEqual(momentumReturnView(plan,plan.target,time),{longitude:-50,latitude:-10});
 }
 const bad=planMomentumReturn({longitude:NaN,latitude:Infinity},{longitude:Infinity,latitude:0},{longitude:NaN,latitude:Infinity});
 assert.deepEqual(bad.motion,{longitude:0,latitude:0});
 for(const time of [NaN,-1,0,1000,Infinity]){
  const view=momentumReturnView(bad,{longitude:NaN,latitude:NaN},time);
  assert.ok(Number.isFinite(view.longitude)&&Number.isFinite(view.latitude));
 }
});
