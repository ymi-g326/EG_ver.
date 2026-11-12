"use client";

import { useEffect, useRef, useState, useCallback, type PointerEvent, type KeyboardEvent, type RefObject } from "react";
import { cloudAlpha, globeTextureSample, projectOrbit, type OrbitalPoint } from "@/lib/globe-atmosphere";
import { geoPath } from "d3-geo";
import { GLOBE_LAND, globeLandProjection } from "@/lib/globe-land";
import { advanceGlobeMomentum, GlobeDragMomentum, momentumScratch, momentumSpeed, STILL_GLOBE } from "@/lib/globe-motion";
import { liveReturnView, LIVE_RETURN_GLIDE_MS } from "@/lib/live-return";
import { planMomentumReturn, momentumReturnView, momentumReturnMotion, type MomentumReturnPlan } from "@/lib/momentum-return";
import { projectGlobe, scratchVelocity, rotateGlobeView, type GeoPoint } from "@/lib/globe-geometry";
import { ScratchWaveTracker, type ScratchWaveSource } from "@/lib/scratch-feedback";

type Props = {
  position: OrbitalPoint | null;
  clouds: boolean; cloudImageRef?: RefObject<HTMLImageElement|null>;
  track?: { past: OrbitalPoint[]; future: OrbitalPoint[] };
  playing: boolean;
  centerToken: number;
  followPosition: boolean;
  onViewInteraction: () => void;
  onScratch: (velocity: number, strength?: number) => void;
  onScratchWave: (source: ScratchWaveSource) => void;
  listeningPoint?: GeoPoint | null;
  onViewChange: (point: GeoPoint) => void;
  canExplore: boolean;
  onScratchStart: (held?: boolean) => void;
  onScratchRelease: () => void;
  onScratchEnd: () => void;
};

export default function RecordGlobe(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const [direction, setDirection] = useState("→");
  const camera = useRef({ longitude: 135, latitude: 20 });
  const momentum = useRef({ ...STILL_GLOBE });
  const dragHistory = useRef(new GlobeDragMomentum());
  const coast = useRef({ active: false, audio: false, initialSpeed: 0 });
  const [coasting, setCoasting] = useState(false);
  const [returning, setReturning] = useState(false);
  const recenter = useRef<{ plan: MomentumReturnPlan; started: number; audio: boolean; initialSpeed: number } | null>(null);
  const manualView = useRef(false);
  const waveTracker = useRef(new ScratchWaveTracker());
  const waveOrigin = useRef({ x: 0, y: 0 });
  const finishCoast = useCallback((resetWaves = true, endAudio = true) => {
    momentum.current = { ...STILL_GLOBE };
    dragHistory.current.reset();
    coast.current.active = false; coast.current.audio = false;
    setCoasting(false);
    if (resetWaves) waveTracker.current.reset();
    if (endAudio) latest.current.onScratchEnd();
  }, []);
  const pointer = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const pointerFocus = useRef(false);
  const [gesture, setGesture] = useState<"rotate" | "scratch" | null>(null);
  useEffect(() => { latest.current = props; });
  useEffect(()=>{
    const suspend=()=>{
      if(!pointer.current && !coast.current.active)return;
      pointer.current=null;setGesture(null);finishCoast();
    };
    const visibility=()=>{if(document.hidden)suspend();};
    window.addEventListener("blur",suspend);document.addEventListener("visibilitychange",visibility);
    return()=>{window.removeEventListener("blur",suspend);document.removeEventListener("visibilitychange",visibility);};
  },[finishCoast]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const landProjection = globeLandProjection();
    const landPath = geoPath(landProjection, context);
    const cloudCanvas = document.createElement("canvas");
    cloudCanvas.width=160; cloudCanvas.height=160;
    const cloudContext=cloudCanvas.getContext("2d");
    let cloudSource="", cloudMask:Uint8Array|null=null, cloudView="", cloudPaint=0;
    const paintClouds=(state:Props, view:GeoPoint, time:number)=>{
      const image=state.cloudImageRef?.current;
      if(!cloudContext || !image?.naturalWidth)return false;
      const key=`${image.currentSrc}:${image.naturalWidth}`;
      if(key!==cloudSource){
        cloudSource=key;cloudMask=null;cloudView="";
        try {
          const sample=document.createElement("canvas");sample.width=360;sample.height=180;
          const ctx=sample.getContext("2d",{willReadFrequently:true});
          if(ctx){ctx.drawImage(image,0,0,360,180);const data=ctx.getImageData(0,0,360,180).data;
            cloudMask=new Uint8Array(360*180);
            for(let i=0;i<cloudMask.length;i++)cloudMask[i]=cloudAlpha(data[i*4],data[i*4+1],data[i*4+2]);}
        } catch { /* Missing or unreadable imagery leaves the globe and sound usable. */ }
      }
      if(!cloudMask)return false;
      const viewKey=`${view.longitude.toFixed(1)}:${view.latitude.toFixed(1)}`;
      if(viewKey===cloudView || (cloudView && time-cloudPaint<64))return true;
      cloudView=viewKey;cloudPaint=time;
      const output=cloudContext.createImageData(160,160);
      for(let y=0;y<160;y++)for(let x=0;x<160;x++){
        const at=globeTextureSample((x+.5)/80-1,(y+.5)/80-1,view.longitude,view.latitude);
        if(!at)continue;
        const index=(y*160+x)*4, alpha=cloudMask[Math.min(179,Math.floor(at.v*180))*360+Math.min(359,Math.floor(at.u*360))];
        output.data[index]=220;output.data[index+1]=240;output.data[index+2]=238;
        output.data[index+3]=Math.round(alpha*.32*(.5+.5*at.depth));
      }
      cloudContext.putImageData(output,0,0);return true;
    };
    let frame = 0;
    let previousTime = 0;
    let previousPaint = 0;
    let previousCenter = -1;
    let centered = false;
    let lastViewTime = -Infinity;
    let lastViewKey = "";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = (time: number) => {
      if (time - previousPaint < 32) { frame = requestAnimationFrame(draw); return; }
      previousPaint = time;
      const elapsed = time - previousTime || 16;
      previousTime = time;
      const state = latest.current;
      const view = camera.current;
      if (state.position) {
        if (!centered) {
          Object.assign(view, liveReturnView(view, state.position, 1));
          centered = true; previousCenter = state.centerToken;
        } else if (state.centerToken !== previousCenter) {
          const carrying = state.playing && coast.current.active && elapsed <= 200 && !!canvas.clientWidth && !reducedMotion;
          const plan = planMomentumReturn(view, state.position, carrying ? momentum.current : STILL_GLOBE);
          finishCoast(true, !carrying); manualView.current = false;
          // The origin is the previous painted pose: advance the first return frame too.
          recenter.current = { plan, started: time - (carrying ? elapsed : 0), audio: carrying, initialSpeed: momentumSpeed(plan.motion) };
          previousCenter = state.centerToken; setReturning(true);
        }
        if (recenter.current && !pointer.current) {
          const age = reducedMotion ? LIVE_RETURN_GLIDE_MS : time - recenter.current.started;
          Object.assign(view, momentumReturnView(recenter.current.plan, state.position, age));
          if (recenter.current.audio && state.playing && age < LIVE_RETURN_GLIDE_MS) {
            const touch = momentumScratch(momentumReturnMotion(recenter.current.plan, state.position, age), recenter.current.initialSpeed);
            state.onScratch(touch.velocity, touch.strength);
          }
          if (age >= LIVE_RETURN_GLIDE_MS || !state.playing) {
            if (recenter.current.audio) { state.onScratchEnd(); recenter.current.audio = false; }
            if (age >= LIVE_RETURN_GLIDE_MS) { recenter.current = null; setReturning(false); }
          }
        } else if (state.followPosition && !manualView.current && !pointer.current) {
          Object.assign(view, liveReturnView(view, state.position, 1));
        }
      }
      if (coast.current.active && !pointer.current) {
        if (reducedMotion || elapsed > 200 || !canvas.clientWidth || (coast.current.audio && !state.playing)) finishCoast();
        else {
          const before = { ...view };
          const next = advanceGlobeMomentum(view, momentum.current, elapsed);
          view.longitude = next.view.longitude; view.latitude = next.view.latitude;
          momentum.current = next.motion;
          if (!momentumSpeed(next.motion)) finishCoast();
          else if (coast.current.audio) {
            const touch = momentumScratch(next.motion, coast.current.initialSpeed);
            state.onScratch(touch.velocity, touch.strength);
            const longitude = ((view.longitude - before.longitude + 540) % 360) - 180;
            const pulse = waveTracker.current.coast(Math.hypot(longitude, view.latitude - before.latitude), performance.now(), touch.strength);
            if (pulse !== null) state.onScratchWave({ ...waveOrigin.current, ...pulse });
          }
        }
      }
      const viewKey = `${view.longitude.toFixed(3)}:${view.latitude.toFixed(3)}`;
      if (viewKey !== lastViewKey && time - lastViewTime > 120) {
        lastViewTime = time; lastViewKey = viewKey;
        state.onViewChange({ latitude: view.latitude, longitude: ((view.longitude + 180) % 360 + 360) % 360 - 180 });
      }
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) { frame = requestAnimationFrame(draw); return; }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const cx = width / 2, cy = height / 2, radius = Math.min(width, height) * .385;
      const project = (point: GeoPoint) => projectGlobe(point, view.longitude, view.latitude);
      context.save();
      context.translate(cx, cy);

      // The outer grooves are the touch surface; the globe remains free to rotate.
      for (let i = 0; i < 14; i++) {
        context.beginPath(); context.arc(0, 0, radius * (1.045 + i * .012), 0, Math.PI * 2);
        context.strokeStyle = (pointer.current || coast.current.active) && state.playing ? `rgba(190,243,122,${.12 + i * .008})` : `rgba(155,185,181,${i % 4 === 0 ? .14 : .055})`;
        context.lineWidth = .7; context.stroke();
      }
      const orbitLine=(points:OrbitalPoint[],color:string,front:boolean,dashed=false)=>{
        context.beginPath();let previous:ReturnType<typeof projectOrbit>|null=null;
        for(const point of points){
          const p=projectOrbit(point,view.longitude,view.latitude,state.position?.altitude);
          if(previous){
            const a=previous.z>=0,b=p.z>=0;
            if(a===front && b===front){context.moveTo(previous.x*radius,previous.y*radius);context.lineTo(p.x*radius,p.y*radius);}
            else if(a!==b){
              const ratio=previous.z/(previous.z-p.z),x=previous.x+(p.x-previous.x)*ratio,y=previous.y+(p.y-previous.y)*ratio;
              context.moveTo((a===front?previous.x:x)*radius,(a===front?previous.y:y)*radius);
              context.lineTo((b===front?p.x:x)*radius,(b===front?p.y:y)*radius);
            }
          }
          previous=p;
        }
        context.strokeStyle=color;context.lineWidth=front?1.25:1;
        context.setLineDash(dashed?[4,5]:[]);context.stroke();context.setLineDash([]);
      };
      // Draw the far orbit before the opaque Earth, preserving natural occlusion.
      if(state.track){
        orbitLine(state.track.past,"rgba(106,245,219,.32)",false);
        orbitLine(state.track.future,"rgba(186,255,61,.27)",false,true);
      }
      const glow = context.createRadialGradient(-radius * .35, -radius * .4, 0, 0, 0, radius * 1.08);
      glow.addColorStop(0, "#213937"); glow.addColorStop(.7, "#102321"); glow.addColorStop(1, "#071313");
      context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.fillStyle = glow; context.fill();
      context.save(); context.clip();
      landProjection.scale(radius).rotate([-view.longitude, -view.latitude]);
      context.beginPath(); landPath(GLOBE_LAND);
      context.fillStyle = "#627f76"; context.fill();
      context.strokeStyle = "rgba(183,211,195,.14)"; context.lineWidth = .4; context.stroke();
      const line = (points: GeoPoint[], color: string, behind = false, dashed = false) => {
        context.beginPath(); let open = false;
        for (const point of points) {
          const p = project(point);
          if ((p.z >= 0) === !behind) {
            if (open) context.lineTo(p.x * radius, p.y * radius); else context.moveTo(p.x * radius, p.y * radius);
            open = true;
          } else open = false;
        }
        context.strokeStyle = color; context.lineWidth = 1;
        context.setLineDash(dashed ? [3, 5] : []); context.stroke(); context.setLineDash([]);
      };
      for (let lat = -60; lat <= 60; lat += 30) if (lat !== 0) line(Array.from({ length: 181 }, (_, i) => ({ latitude: lat, longitude: i * 2 - 180 })), "rgba(161,195,185,.12)");
      for (let lon = -180; lon < 180; lon += 30) line(Array.from({ length: 91 }, (_, i) => ({ latitude: i * 2 - 90, longitude: lon })), "rgba(161,195,185,.12)");
      if(state.clouds && paintClouds(state,view,time)){
        context.save();context.imageSmoothingEnabled=true;context.filter="blur(.65px)";
        context.drawImage(cloudCanvas,-radius*1.012,-radius*1.012,radius*2.024,radius*2.024);
        context.restore();
      }
      const shade = context.createLinearGradient(-radius, -radius, radius, radius);
      shade.addColorStop(0, "rgba(1,10,12,0)"); shade.addColorStop(.6, "rgba(1,10,12,.07)"); shade.addColorStop(1, "rgba(1,10,12,.8)");
      context.fillStyle = shade; context.fillRect(-radius, -radius, radius * 2, radius * 2);
      line(Array.from({ length: 361 }, (_, i) => ({ latitude: 0, longitude: i - 180 })), "rgba(190,119,128,.5)");
      context.restore();
      context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.strokeStyle = "rgba(163,218,199,.32)"; context.lineWidth = 1; context.stroke();
      if(state.track){
        orbitLine(state.track.past,"rgba(106,245,219,.92)",true);
        orbitLine(state.track.future,"rgba(186,255,61,.64)",true,true);
      }
      if (state.position) {
        const p = projectOrbit(state.position,view.longitude,view.latitude);
        if (p.visible) {
          const x = p.x * radius, y = p.y * radius;
          const ground=project(state.position);
          if(ground.z>=0){
            context.beginPath();context.moveTo(ground.x*radius,ground.y*radius);context.lineTo(x,y);
            context.strokeStyle="rgba(199,244,131,.38)";context.lineWidth=.8;context.setLineDash([2,3]);context.stroke();context.setLineDash([]);
            context.beginPath();context.arc(ground.x*radius,ground.y*radius,2,0,Math.PI*2);context.fillStyle="#a5c88b";context.fill();
          }
          context.beginPath(); context.arc(x, y, 14 + (state.playing && !reducedMotion ? Math.sin(time / 500) * 2 : 0), 0, Math.PI * 2);
          context.strokeStyle = "rgba(199,244,131,.42)"; context.stroke();
          context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fillStyle = "#c7f483"; context.fill();
          context.fillStyle = "#d6e4d3"; context.font = "10px monospace"; context.fillText("TEN-KOH 2", x + 21, y + 3);
        }
      }
      if (state.listeningPoint) {
        const p = project(state.listeningPoint);
        if (p.z >= 0) {
          const x = p.x * radius, y = p.y * radius;
          context.strokeStyle = "#e1e9e1"; context.lineWidth = 1.3;
          context.beginPath(); context.arc(x, y, 8, 0, Math.PI * 2); context.stroke();
          context.fillStyle = "#e1e9e1"; context.font = "9px monospace"; context.fillText("LISTENING", x + 14, y - 8);
        }
      }
      if (state.canExplore) {
        context.strokeStyle = "rgba(223,238,215,.55)"; context.lineWidth = .8;
        context.beginPath(); context.moveTo(-6,0); context.lineTo(6,0); context.moveTo(0,-6); context.lineTo(0,6); context.stroke();
      }
      context.restore();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); latest.current.onScratchEnd(); };
  }, [finishCoast]);

  const reportView = () => latest.current.onViewChange({ latitude: camera.current.latitude, longitude: ((camera.current.longitude + 180) % 360 + 360) % 360 - 180 });
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    pointerFocus.current = true; setKeyboardFocus(false);
    if (pointer.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) * .385;
    if (Math.hypot(event.clientX - bounds.left - bounds.width / 2, event.clientY - bounds.top - bounds.height / 2) > radius * 1.25) return;
    manualView.current = true; recenter.current = null; setReturning(false);
    latest.current.onViewInteraction();
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    finishCoast();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture(props.playing ? "scratch" : "rotate");
    if (props.playing) latest.current.onScratchStart(true);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const previous = pointer.current;
    if (!previous || previous.id !== event.pointerId) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    const before = { ...camera.current };
    const next = rotateGlobeView(camera.current, dx, dy);
    camera.current.longitude = next.longitude; camera.current.latitude = next.latitude;
    momentum.current = dragHistory.current.add(dx, dy, event.timeStamp - previous.time, event.timeStamp);
    if (latest.current.playing) {
      const velocity = scratchVelocity(Math.abs(dx) >= Math.abs(dy) ? dx : -dy, event.timeStamp - previous.time);
      if (Math.abs(velocity) > .025) setDirection(velocity < 0 ? "←" : "→");
      latest.current.onScratch(velocity);
      const longitude = ((next.longitude - before.longitude + 540) % 360) - 180;
      const pulse = waveTracker.current.move(dx, dy, event.timeStamp - previous.time,
        Math.hypot(longitude, next.latitude - before.latitude), performance.now());
      const bounds = event.currentTarget.getBoundingClientRect();
      const cx = bounds.left + bounds.width / 2, cy = bounds.top + bounds.height / 2;
      const radius = Math.min(bounds.width, bounds.height) * .385;
      const distance = Math.hypot(event.clientX - cx, event.clientY - cy);
      const factor = distance ? Math.min(1, radius / distance) : 1;
      waveOrigin.current = { x: cx + (event.clientX - cx) * factor, y: cy + (event.clientY - cy) * factor };
      if (pulse !== null) latest.current.onScratchWave({ ...waveOrigin.current, ...pulse });
    }
    pointer.current = { ...previous, x: event.clientX, y: event.clientY, time: event.timeStamp };
  };
  const up = (event: PointerEvent<HTMLCanvasElement>) => {
    const held = pointer.current;
    if (!held || held.id !== event.pointerId) return;
    pointer.current = null; setGesture(null); reportView();
    momentum.current = dragHistory.current.at(event.timeStamp);
    const speed = momentumSpeed(momentum.current);
    if (speed > 2 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      coast.current = { active: true, audio: latest.current.playing, initialSpeed: speed };
      setCoasting(true);
      latest.current.onScratchRelease();
    } else finishCoast();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancel = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null; setGesture(null); finishCoast(); reportView();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyboard = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    pointerFocus.current = false; setKeyboardFocus(true);
    event.preventDefault(); finishCoast(false);
    manualView.current = true; recenter.current = null; setReturning(false);
    latest.current.onViewInteraction();
    const dx = event.key === "ArrowLeft" ? 25 : event.key === "ArrowRight" ? -25 : 0;
    const dy = event.key === "ArrowUp" ? 30 : event.key === "ArrowDown" ? -30 : 0;
    const next = rotateGlobeView(camera.current, dx, dy);
    camera.current.longitude = next.longitude; camera.current.latitude = next.latitude;
    if (props.playing) {
      latest.current.onScratch(event.key === "ArrowLeft" || event.key === "ArrowUp" ? -.65 : .65);
      const bounds = event.currentTarget.getBoundingClientRect();
      const pulse = waveTracker.current.move(dx, dy, 40, Math.hypot(dx * .32, dy * .25), performance.now());
      if (pulse !== null) latest.current.onScratchWave({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, ...pulse });
    }
    reportView();
  };

  return <div className={`v2-globe${keyboardFocus ? " has-keyboard-focus" : ""} ${gesture ? `is-${gesture}` : ""}${coasting ? " is-coasting" : ""}${returning ? " is-returning" : ""}`}>
    <canvas ref={canvasRef} tabIndex={0} role="group" aria-label="地球儀。ドラッグまたは矢印キーで回転。再生中は回転と一緒に音をスクラッチします。停止して場所を選び、再生すると中央の土地を聴けます。" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={keyboard}
      onFocus={event => setKeyboardFocus(!pointerFocus.current && event.currentTarget.matches(":focus-visible"))}
      onBlur={() => { pointerFocus.current = false; setKeyboardFocus(false); }} />
    {returning && <span className="v2-coast-feedback" role="status">RETURNING TO LIVE</span>}
    {coasting && <span className="v2-coast-feedback" role="status">COASTING</span>}
    {gesture === "scratch" && <span className="v2-scratch-feedback" role="status">SCRATCH {direction}</span>}
    <span className="v2-globe-caption">{gesture === "scratch" ? "ROTATE THE EARTH. TOUCH THE SOUND." : gesture === "rotate" ? "A DIFFERENT POINT OF VIEW" : returning ? "BACK TO THE LIVE GROOVE" : coasting ? "LET THE SOUND SETTLE" : "THE EARTH IS OUR RECORD"}</span>
  </div>;
}
