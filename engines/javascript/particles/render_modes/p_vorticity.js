import {
  CUTOFF,
  engineMaxDensity,
  fallbackRadius,
  forEachCandidate,
  gaussianHash,
  maxVelocity,
  particleXy,
} from "./p_shared.js";

/**
 * Local spin: Gaussian-weighted neighbour contributions to 2D curl proxy.
 */
export function compute(ctx, particleSystem, count) {
  const radii = particleSystem.particleRadii;
  const vx = particleSystem.velocitiesX;
  const vy = particleSystem.velocitiesY;
  const fallback = fallbackRadius(particleSystem, ctx.simParams);
  const maxDensity = engineMaxDensity(ctx.simParams);
  const vCap = maxVelocity(ctx.simParams);
  const denom = Math.max(1e-6, vCap * maxDensity);
  const hash = gaussianHash(particleSystem, count, fallback);

  for (let i = 0; i < count; i++) {
    let curl = 0;
    let wSum = 0;
    const [xi, yi] = particleXy(particleSystem, i);
    const vxi = vx?.[i] ?? 0;
    const vyi = vy?.[i] ?? 0;
    forEachCandidate(hash, particleSystem, count, i, (j) => {
      const [xj, yj] = particleXy(particleSystem, j);
      const dx = xj - xi;
      const dy = yj - yi;
      const sigma = radii && radii[j] > 1e-4 ? radii[j] : fallback;
      const e = (dx * dx + dy * dy) / (sigma * sigma);
      if (e > CUTOFF) return;
      const w = Math.exp(-e);
      const dvx = (vx?.[j] ?? 0) - vxi;
      const dvy = (vy?.[j] ?? 0) - vyi;
      // Discrete curl proxy: dx*dvy - dy*dvx, weighted.
      curl += w * (dx * dvy - dy * dvx);
      wSum += w;
    });
    if (wSum <= 0) {
      ctx.targetValues[i] = 0;
      continue;
    }
    const scaled = Math.abs(curl / wSum) / denom;
    ctx.targetValues[i] = Math.min(1, Math.max(0, Math.pow(scaled, 0.75)));
  }
}
