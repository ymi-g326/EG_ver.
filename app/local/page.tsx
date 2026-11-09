import BrowserPlayer from "@/components/browser-player";
import type { Metadata } from "next";
import LocalPlayer from "@/components/local-player";
export const metadata: Metadata = { title: "EARTH GROOVE V2 — Local collection" };
export default function LocalPage() { return <BrowserPlayer><LocalPlayer /></BrowserPlayer>; }
