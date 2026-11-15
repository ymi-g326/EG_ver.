"use client";

import { Check, LoaderCircle, RotateCcw, Satellite, TriangleAlert } from "lucide-react";
import { appPath } from "@/lib/app-path";
import { startupProgress, type StartupConnection } from "@/lib/startup-progress";

export default function StartupStatus({ connection, onRetry }: { connection: StartupConnection; onRetry?: () => void }) {
  const progress = startupProgress(connection);
  if (progress.ready) return null;
  return <section className="v2-startup" data-state={progress.failed ? "error" : "loading"} aria-label="地球の音の準備状況">
    <div className="v2-startup-heading">{progress.failed ? <TriangleAlert size={22} /> : <Satellite size={22} />}<div><span>{progress.failed ? "TEN-KOH 2 / CONNECTION" : "TEN-KOH 2 / CONNECTING"}</span><strong role="status" aria-live="polite">{progress.title}</strong></div></div>
    <ol aria-label="取得状況">{progress.steps.map(step => <li key={step.name} data-state={step.state}>
      {step.state === "done" ? <Check size={13} /> : step.state === "error" ? <TriangleAlert size={13} /> : step.state === "active" ? <LoaderCircle size={13} className="v2-startup-spinner" /> : <i />}{step.name}
    </li>)}</ol>
    <p>{progress.failed ? "接続を確認して再取得できます。LOCALなら保存した合成風景を聴けます。" : "公開軌道から位置を推定します。準備中も地球は回せます。"}</p>
    {progress.failed && <div className="v2-startup-actions">{onRetry && <button type="button" onClick={onRetry}><RotateCcw size={14} />再取得</button>}<a href={appPath("/local/")}>LOCALで聴く</a></div>}
  </section>;
}
