import { NOISE_TUNE, TUNE, engineMaxDensity, particleXy } from "./p_shared.js";

/** Theme level from turbulence sample at the particle. */
export function compute(ctx, particleSystem, count) {
  const turbulence = particleSystem?.turbulence;
  if (!turbulence?.noise2D) {
    ctx.targetValues.fill(0, 0, count);
    return;
  }
  const maxDensity = engineMaxDensity(ctx.simParams);

  for (let i = 0; i < count; i++) {
    const [xi, yi] = particleXy(particleSystem, i);
    const noise01 = turbulence.noise2D(xi, yi, turbulence.time, true);
    ctx.targetValues[i] = Math.min(1, Math.max(0, (noise01 * NOISE_TUNE * TUNE.noise) / maxDensity));
  }
}
