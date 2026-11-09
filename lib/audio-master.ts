export const MASTER_BOOST_DB = 18;
export const MASTER_GAIN = 10 ** (MASTER_BOOST_DB / 20);
export const MASTER_CEILING_DB = -1;

/** Linear for ordinary levels, smoothly rounded at the very highest peaks. */
export function masterCeilingCurve() {
  const curve = new Float32Array(16385);
  const ceiling = 10 ** (MASTER_CEILING_DB / 20), knee = .7;
  for (let i = 0; i < curve.length; i++) {
    const sample = i / (curve.length - 1) * 2 - 1, magnitude = Math.abs(sample);
    curve[i] = magnitude <= knee ? sample
      : Math.sign(sample) * (knee + (ceiling - knee) * Math.tanh((magnitude - knee) / (ceiling - knee)));
  }
  return curve;
}

/** One shared output stage after music and scratch merge, outside the scratch recorder loop. */
export function createMasterOutput(context: AudioContext) {
  const input = context.createGain();
  input.gain.value = MASTER_GAIN;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -4; limiter.knee.value = 2; limiter.ratio.value = 20;
  limiter.attack.value = .001; limiter.release.value = .18;
  const output = context.createWaveShaper();
  output.curve = masterCeilingCurve(); output.oversample = "none";
  input.connect(limiter); limiter.connect(output);
  return { input, output, destroy() { input.disconnect(); limiter.disconnect(); output.disconnect(); } };
}
