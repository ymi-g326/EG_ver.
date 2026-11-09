import { createRoot } from "react-dom/client";
import EarthRecord from "@/components/earth-record";
import LocalPlayer from "@/components/local-player";
import "@/app/globals.css";
import "@/app/player-v2.css";

const local = /\/local\/?(?:index\.html)?$/.test(window.location.pathname);
createRoot(document.getElementById("root")!).render(local ? <LocalPlayer /> : <EarthRecord player />);
