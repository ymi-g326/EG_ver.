export type StartupConnection = {
  orbit: "connecting" | "live" | "reference" | "degraded";
  positionReady: boolean;
  imagery: "pending" | "ready" | "retrying" | "error";
};

/** Report independent requests honestly: imagery may finish before the orbit does. */
export function startupProgress(state: StartupConnection) {
  const orbitReady = state.orbit === "live" || state.orbit === "reference";
  const ready = orbitReady && state.positionReady && state.imagery === "ready";
  const failed = state.orbit === "degraded" || state.imagery === "error";
  const title = state.orbit === "degraded" ? "てんこう2の軌道を取得できませんでした"
    : !orbitReady ? "てんこう2の位置を取得中"
    : !state.positionReady ? "てんこう2の現在位置を計算中"
    : state.imagery === "error" ? "位置は取得済み · 地表画像を取得できません"
    : state.imagery === "retrying" ? "位置は取得済み · 地表画像を再取得中"
    : ready ? "地球を聴く準備ができました" : "位置は取得済み · 地球の音を準備中";
  return { ready, failed, title, steps: [
    { name: state.orbit === "reference" ? "保存した軌道" : "軌道データ", state: orbitReady ? "done" : state.orbit === "degraded" ? "error" : "active" },
    { name: "位置を計算", state: state.positionReady ? "done" : orbitReady ? "active" : "waiting" },
    { name: "地表画像", state: state.imagery === "ready" ? "done" : state.imagery === "error" ? "error" : "active" },
  ] };
}
