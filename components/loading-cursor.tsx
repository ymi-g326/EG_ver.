"use client";
import { useEffect, useRef, useState } from "react";

export default function LoadingCursor({active}:{active:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  const seen=useRef(false);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const move=(event:globalThis.PointerEvent)=>{
      if(event.pointerType!=="mouse")return;
      if(ref.current)ref.current.style.transform=`translate3d(${event.clientX}px,${event.clientY}px,0)`;
      if(!seen.current){seen.current=true;setVisible(true);}
    };
    const leave=(event:globalThis.PointerEvent)=>{
      if(!event.relatedTarget){seen.current=false;setVisible(false);}
    };
    window.addEventListener("pointermove",move);window.addEventListener("pointerout",leave);
    const blur=()=>{seen.current=false;setVisible(false);};
    window.addEventListener("blur",blur);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerout",leave);window.removeEventListener("blur",blur);};
  },[]);
  return <div ref={ref} className="v2-loading-cursor" hidden={!active||!visible} aria-hidden="true"><i/><b/></div>;
}
