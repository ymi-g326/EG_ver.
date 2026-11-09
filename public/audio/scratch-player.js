/* A continuous, signed read head for the app's captured mix. No microphone or network. */
class EarthScratchPlayer extends AudioWorkletProcessor {
  constructor(){
    super();this.clip=null;this.cursor=0;this.rate=0;this.targetRate=0;this.weight=0;this.targetWeight=0;
    this.held=false;this.sinceControl=0;this.fade=0;this.fadeLength=0;this.fadeStart=0;
    this.rateSmoothing=1-Math.exp(-1/(sampleRate*.009));
    this.gainSmoothing=1-Math.exp(-1/(sampleRate*.006));
    this.port.onmessage=({data})=>{
      if(data.type==='reset'){this.clip=null;this.rate=0;this.weight=0;this.fade=0;this.fadeLength=0;return;}
      if(data.type==='begin'){
        const channels=data.channels;
        if(!Array.isArray(channels)||!channels.length||!channels[0]?.length)return;
        const length=Math.min(channels[0].length,sampleRate*2);
        this.clip=channels.slice(0,2).map(c=>Float32Array.from(c.subarray(0,length),n=>Number.isFinite(n)?n:0));
        this.cursor=Math.max(0,length-sampleRate*.12);this.rate=0;this.weight=0;this.fade=0;
      }
      if(data.type==='begin'||data.type==='control'){
        this.targetRate=Number.isFinite(data.rate)?Math.max(-3.2,Math.min(3.2,data.rate)):0;
        this.targetWeight=Number.isFinite(data.weight)?Math.max(0,Math.min(1,data.weight)):0;
        this.held=!!data.held;this.sinceControl=0;this.fade=0;this.fadeLength=0;
      }
      if(data.type==='end'){
        this.held=false;this.targetRate=1;this.fadeStart=this.weight;
        this.fadeLength=Math.max(1,Math.round(sampleRate*Math.max(.02,Math.min(1,Number(data.seconds)||.68))));
        this.fade=this.fadeLength;
      }
    };
  }
  process(_inputs,outputs){
    const output=outputs[0];if(!output)return true;
    for(const channel of output)channel.fill(0);
    if(!this.clip)return true;
    const length=this.clip[0].length;
    for(let i=0;i<output[0].length;i++){
      this.sinceControl++;
      // Holding a stationary record is silent, even without fresh pointer events.
      const target=this.held&&this.sinceControl>sampleRate*.085?0:this.targetRate;
      this.rate+=(target-this.rate)*this.rateSmoothing;
      if(this.fade){this.weight=this.fadeStart*(--this.fade/this.fadeLength);}
      else this.weight+=(this.targetWeight-this.weight)*this.gainSmoothing;
      if(this.fadeLength && !this.fade){this.clip=null;this.weight=0;this.fadeLength=0;break;}
      const at=Math.floor(this.cursor),fraction=this.cursor-at,next=(at+1)%length;
      // An 8ms seam taper prevents a click at the finite captured window's wrap.
      const edge=Math.min(1,Math.min(this.cursor,length-1-this.cursor)/(sampleRate*.008));
      const gain=this.weight*Math.min(1,Math.abs(this.rate)/.06)*Math.sin(Math.max(0,edge)*Math.PI/2);
      for(let c=0;c<output.length;c++){
        const samples=this.clip[c]??this.clip[0];
        output[c][i]=(samples[at]*(1-fraction)+samples[next]*fraction)*gain;
      }
      this.cursor=((this.cursor+this.rate)%length+length)%length;
    }
    return true;
  }
}
registerProcessor('earth-scratch-player',EarthScratchPlayer);
