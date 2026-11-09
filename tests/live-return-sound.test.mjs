import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderLiveReturnSound, LIVE_RETURN_SOUND_SECONDS} from '../lib/live-return-sound.ts';
import {liveReturnView} from '../lib/live-return.ts';
const rms=data=>Math.sqrt(data.reduce((sum,value)=>sum+value*value,0)/data.length);
function energy(data,rate,frequency,start,end){
 let re=0,im=0;
 for(let i=Math.floor(start*rate);i<Math.floor(end*rate);i++){
  re+=data[i]*Math.cos(2*Math.PI*frequency*i/rate);im-=data[i]*Math.sin(2*Math.PI*frequency*i/rate);
 }
 return re*re+im*im;
}
function pitch(data,rate,start,end){
 let strongest=0,result=0;
 for(let frequency=35;frequency<=120;frequency++){
  const value=energy(data,rate,frequency,start,end);if(value>strongest){strongest=value;result=frequency;}
 }
 return result;
}

test('gravity cue has a soft attack, bounded finite audio and a silent fading tail at common sample rates',()=>{
 for(const rate of [8000,44100,48000]){
  const data=renderLiveReturnSound(rate);
  assert.equal(data.length,Math.ceil(rate*LIVE_RETURN_SOUND_SECONDS));
  assert.equal(data[0],0);assert.equal(Math.abs(data.at(-1)),0);
  assert.ok(data.every(value=>Number.isFinite(value)&&Math.abs(value)<=.85));
  const body=rms(data.slice(Math.round(rate*.6),Math.round(rate*1.2)));
  assert.ok(body>.1);
  assert.ok(rms(data.slice(0,Math.round(rate*.1)))<body*.1);
  assert.ok(rms(data.slice(-Math.round(rate*.2)))<body*.01);
 }
 for(const bad of [NaN,0,-1,1000,Infinity])assert.throws(()=>renderLiveReturnSound(bad),RangeError);
});

test('the cue descends into low tones and keeps bright sweep energy out of the foreground',()=>{
 const rate=8000,data=renderLiveReturnSound(rate);
 const early=pitch(data,rate,.7,1.2),late=pitch(data,rate,2.6,3.1);
 assert.ok(early>=65&&early<=85,`early: ${early}`);
 assert.ok(late>=45&&late<=60&&early-late>=10,`late: ${late}`);
 let low=0,high=0;
 for(let f=35;f<=350;f+=5)low+=energy(data,rate,f,.7,2.7);
 for(let f=800;f<=3000;f+=5)high+=energy(data,rate,f,.7,2.7);
 assert.ok(low>high*100);
});

test('the return starts gently, accelerates through the middle and settles gently at LIVE',()=>{
 const from={latitude:0,longitude:0},to={latitude:0,longitude:100};
 assert.ok(liveReturnView(from,to,.01).longitude<.01);
 assert.ok(liveReturnView(from,to,.25).longitude<20);
 assert.equal(liveReturnView(from,to,.5).longitude,50);
 assert.ok(liveReturnView(from,to,.75).longitude>80);
 assert.ok(liveReturnView(from,to,.99).longitude>99.99);
});
