/* Record only the app's own mix, in memory. No microphone or network output. */
class EarthScratchRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rings = [new Float32Array(sampleRate * 2), new Float32Array(sampleRate * 2)];
    this.write = 0;
    this.count = 0;
    this.enabled = true;
    this.notified = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === "enabled") {
        this.enabled = data.value;
        this.count = 0;
        this.write = 0;
        this.notified = false;
      }
      if (data.type === "snapshot" && this.enabled && this.count >= sampleRate * .15) {
        const length = Math.min(this.count, sampleRate * 2);
        const channels = this.rings.map(ring => {
          const out = new Float32Array(length);
          const start = (this.write - length + ring.length) % ring.length;
          for (let i = 0; i < length; i++) out[i] = ring[(start + i) % ring.length];
          return out;
        });
        this.port.postMessage({ type: "snapshot", channels }, channels.map(channel => channel.buffer));
      }
    };
  }

  process(inputs, outputs) {
    // A silent output keeps this side branch connected without doubling the music.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0];
    if (!this.enabled || !input?.[0]?.length) return true;
    for (let i = 0; i < input[0].length; i++) {
      this.rings[0][this.write] = input[0][i];
      this.rings[1][this.write] = (input[1] ?? input[0])[i];
      this.write = (this.write + 1) % this.rings[0].length;
      this.count = Math.min(this.count + 1, this.rings[0].length);
    }
    if (!this.notified && this.count >= sampleRate * .25) {
      this.notified = true;
      this.port.postMessage({ type: "ready" });
    }
    return true;
  }
}
registerProcessor("earth-scratch-recorder", EarthScratchRecorder);
