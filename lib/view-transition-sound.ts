export const VIEW_TRANSITION_MS = 760;
// Routed through the existing +18 dB master, separately from the paused music bus.
export const VIEW_TRANSITION_LEVEL = .06;

/** Three gated, bit-crushed rasps with a short silent midpoint for the screen swap. */
export function renderViewTransitionSound(sampleRate:number, inspect:boolean):Float32Array {
  if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError("Invalid sample rate");
  const duration=VIEW_TRANSITION_MS/1000;
  const data=new Float32Array(Math.ceil(sampleRate*duration));
  const bursts=[[.018,.17],[.235,.35],[.45,.722]];
  const hold=Math.max(1,Math.floor(sampleRate/6000));
  let seed=inspect?3181:8221, held=0, low=0, phase=0, peak=0;
  for(let i=0;i<data.length;i++){
    const t=i/sampleRate;
    if(i%hold===0){seed=(Math.imul(seed,1664525)+1013904223)>>>0;held=Math.round(((seed/4294967296)*2-1)*12)/12;}
    low+=.12*(held-low);
    const frequency=Math.min(sampleRate*.32,inspect?1050+1250*t/duration:2200-1250*t/duration);
    phase+=2*Math.PI*frequency/sampleRate;
    let envelope=0;
    for(const [start,end] of bursts)if(t>=start&&t<end){
      const edge=Math.min(1,(t-start)/.006,(end-t)/.012);
      const chatter=(Math.floor((t-start)/.018)%4===3)?.24:1;
      envelope=Math.max(envelope,Math.max(0,edge)*chatter);
    }
    const value=((held-low)*.78+Math.round(Math.sin(phase)*4)/4*.22)*envelope;
    data[i]=value;peak=Math.max(peak,Math.abs(value));
  }
  if(peak)for(let i=0;i<data.length;i++)data[i]=data[i]/peak*.68;
  return data;
}
