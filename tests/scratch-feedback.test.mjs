import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
const {ScratchWaveTracker,scratchWaveResponse}=await import(moduleUrl(new URL('../lib/scratch-feedback.ts',import.meta.url)));
const {appendStyleWave,activeStyleWaves,sampleStyleWaves,scratchWaveSpec,MAX_STYLE_WAVES,WAVE_DISPLACEMENT_SCALE}=await import(moduleUrl(new URL('../lib/style-waves.ts',import.meta.url)));

test('a wave born after the frame timestamp survives its first frame instead of disappearing until release',()=>{
 const wave={style:'groove',x:200,y:200,reach:300,started:100.5,durationMs:600,strength:.8,kind:'scratch'};
 const first=activeStyleWaves([wave],100);
 assert.equal(first.length,1);assert.equal(first[0].progress,0);
 assert.deepEqual(sampleStyleWaves(first,240,200),{x:0,y:0});
 const next=activeStyleWaves(first,116);
 assert.equal(next.length,1);assert.ok(next[0].progress>0);
 assert.deepEqual(activeStyleWaves(next,701),[]);
});

test('small deliberate movement responds immediately, including accumulated same-timestamp input, while tremor stays quiet',()=>{
 const tracker=new ScratchWaveTracker();
 for(let i=0;i<12;i++){
  const pulse=tracker.move(i%2?-2:2,0,80,.64,i*80);
  assert.ok(pulse);assert.ok(pulse.size>0&&pulse.size<.06);
  assert.ok(pulse.strength>.25&&pulse.strength<.5);
 }
 tracker.reset();assert.ok(tracker.move(2,0,800,.64,2000));
 tracker.reset();assert.equal(tracker.move(2,0,0,.64,10),null);
 assert.ok(tracker.move(0,0,16,0,26),'same-clock movement must accumulate instead of being discarded');
 tracker.reset();
 for(let i=0;i<1000;i++)assert.equal(tracker.move(i%2?.5:-.5,0,16,.16,i*16),null);
 assert.equal(tracker.move(0,0,16,0,18000),null);
 for(const bad of [NaN,Infinity])assert.equal(tracker.move(bad,0,16,2,19000),null);
});

test('held moves continuously update size and strength before any pointer release, without spawning a wave per input event',()=>{
 const tracker=new ScratchWaveTracker();let pool=[],firstSize=0;
 for(let i=1;i<=30;i++){
  const pulse=tracker.move(4,0,8,1.28,i*8);
  assert.ok(pulse);
  if(i===1)firstSize=pulse.size;
  const wave={style:'groove',x:200+i*4,y:300,...scratchWaveSpec('groove',pulse.size,900),started:i*8,strength:pulse.strength,kind:'scratch'};
  const before=pool.length;
  pool=appendStyleWave(pool,wave,pulse.continuation);
  if(pulse.continuation)assert.equal(pool.length,before,'motion between fronts changes the existing wave');
  if(i===25)assert.ok(pulse.size>firstSize*2,'the growing swing changes the wave while the pointer is still held');
  assert.ok(pool.length<=MAX_STYLE_WAVES);
 }
 assert.equal(pool.length,2,'a held 240ms gesture should create just two fronts while updating them continuously');
 const updates=activeStyleWaves(pool,240);assert.ok(updates.length>0);
});

test('increasing swing amplitude or acceleration enlarges waves; an actual reversal adds a clear impulse',()=>{
 const little=scratchWaveResponse(8,.2,.001),wide=scratchWaveResponse(120,.2,.001),snap=scratchWaveResponse(8,.2,.03);
 assert.ok(wide.size>little.size*4,'a wider swing must remain clearly distinct at the selected sensitivity');assert.ok(snap.size>little.size*3,'acceleration must remain distinct from a gentle motion');
 assert.ok(wide.strength>little.strength&&snap.strength>little.strength);
 const tracker=new ScratchWaveTracker();let steady;
 for(let i=1;i<=10;i++)steady=tracker.move(8,0,16,2.56,i*16);
 const fold=tracker.move(-8,0,16,2.56,176);
 assert.ok(fold.size>steady.size*1.3);assert.ok(fold.strength>steady.strength*1.15);
 assert.deepEqual(scratchWaveResponse(NaN,1,1),{size:0,strength:0});
});

function circleStats(rate,direction){
 const tracker=new ScratchWaveTracker();let x=100,y=0;const values=[];let fronts=0;
 for(let i=1;i<=rate*4;i++){
  const time=i*1000/rate,angle=direction*time/2000*Math.PI*2,nx=100*Math.cos(angle),ny=100*Math.sin(angle);
  const pulse=tracker.move(nx-x,ny-y,1000/rate,Math.hypot(nx-x,ny-y)*.25,time);
  if(pulse){if(time>1000)values.push(pulse.size);if(!pulse.continuation)fronts++;}
  x=nx;y=ny;
 }
 values.sort((a,b)=>a-b);
 return {median:values[Math.floor(values.length/2)],fronts};
}
test('both circular directions keep updating during the drag with comparable sizes across pointer sampling rates',()=>{
 const medians=[];
 for(const rate of [60,120,240])for(const direction of [-1,1]){
  const stats=circleStats(rate,direction);medians.push(stats.median);
  assert.ok(stats.fronts>=30&&stats.fronts<=35,`four seconds should create about 33 fronts, got ${stats.fronts}`);
  assert.ok(stats.median>scratchWaveResponse(8,.2,.001).size*2&&stats.median<scratchWaveResponse(180,1.4,.035).size);
 }
 assert.ok(Math.max(...medians)-Math.min(...medians)<.04,JSON.stringify(medians));
});

test('inertia inherits the latest held size and fades, and a pause cannot inherit old swing energy',()=>{
 const tracker=new ScratchWaveTracker();let hand;
 for(let i=1;i<=10;i++)hand=tracker.move(8,0,16,2.56,i*16);
 assert.equal(tracker.coast(2,180,.9),null);
 const coast=tracker.coast(10,340,.7);
 assert.ok(coast&&coast.size<hand.size&&coast.strength<hand.strength);
 assert.equal(tracker.coast(20,360,.7),null);
 const later=tracker.coast(12,540,.3);assert.ok(later.size<coast.size&&later.strength<coast.strength);
 assert.equal(tracker.coast(120,600,.1),null);
 const afterPause=tracker.move(2,0,800,.64,1400);assert.ok(afterPause.size<.05);
 tracker.reset();assert.equal(tracker.coast(2,1500,.9),null);
});

test('small waves remain local and fine, while live continuation grows the same front without restarting its birth',()=>{
 for(const style of ['ambient','groove']){
  const small=scratchWaveSpec(style,.02,1000),large=scratchWaveSpec(style,1,1000);
  assert.ok(small.reach<100);assert.equal(large.reach,1000);
  assert.ok(small.durationMs<large.durationMs*.6);
  assert.ok(small.detail<.35);assert.equal(large.detail,1);
  const wave={style,x:400,y:300,...small,started:100,strength:.3,kind:'scratch'};
  const live=activeStyleWaves([wave],100+small.durationMs*.5);
  assert.deepEqual(sampleStyleWaves(live,1000,700),{x:0,y:0});
  assert.ok(Array.from({length:20},(_,i)=>sampleStyleWaves(live,410+i*5,300).x).some(x=>Math.abs(x)>.5));
  const updated=appendStyleWave([wave],{...wave,...large,x:450,started:200,strength:.9},true);
  assert.equal(updated.length,1);assert.equal(updated[0].started,100);
  assert.equal(updated[0].x,400);assert.equal(updated[0].reach,1000);assert.equal(updated[0].strength,.9);
  const recovered=appendStyleWave([],{...wave,started:130},true);assert.equal(recovered.length,1);
 }
});

test('rapid held updates keep a bounded pool, expire, and never accumulate excessive displacement',()=>{
 const tracker=new ScratchWaveTracker();let pool=[];
 for(let i=1;i<=4000;i++){
  const pulse=tracker.move(i%40<20?4:-4,0,8,1.28,i*8);
  if(pulse)pool=appendStyleWave(pool,{style:'groove',x:400,y:300,...scratchWaveSpec('groove',pulse.size,1000),started:i*8,strength:pulse.strength,kind:'scratch'},pulse.continuation);
  assert.ok(pool.length<=MAX_STYLE_WAVES);
 }
 const live=activeStyleWaves(pool,32000);assert.ok(live.length>=2);
 for(let x=0;x<1200;x+=25)for(let y=0;y<900;y+=25){
  const v=sampleStyleWaves(live,x,y);
  assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y));
  assert.ok(Math.abs(v.x)<WAVE_DISPLACEMENT_SCALE/2&&Math.abs(v.y)<WAVE_DISPLACEMENT_SCALE/2);
 }
 assert.deepEqual(activeStyleWaves(pool,34000),[]);
 const base={style:'groove',x:400,y:300,reach:1000,started:32000,durationMs:950,strength:.8,kind:'style'};
 pool=appendStyleWave(pool,base);assert.equal(pool.length,1);
 pool=appendStyleWave(pool,{...base,kind:'scratch',started:32010},true);assert.equal(pool.length,2,'a gesture must not overwrite a mode-switch wave');
 for(const invalid of [{x:NaN},{detail:0},{detail:NaN}])assert.deepEqual(appendStyleWave(pool,{...base,...invalid}),pool);
 assert.deepEqual(sampleStyleWaves([],10,10),{x:0,y:0});
});
