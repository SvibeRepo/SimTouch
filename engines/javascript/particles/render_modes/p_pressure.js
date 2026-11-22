import {
  engineMaxDensity,
  fallbackRadius,
  forEachCandidate,
  overlapHash,
  particleXy,
} from "./p_shared.js";

/**
 * Local packing pressure: squared sum of soft overlaps (ProximityB mass), Sensitivity-scaled.
 */
export function compute(ctx, particleSystem, count) {
  const radii = particleSystem.particleRadii;
  const fallback = fallbackRadius(particleSystem, ctx.simParams);
  const maxDensity = engineMaxDensity(ctx.simParams);
  const hash = overlapHash(particleSystem, count, fallback);

  for (let i = 0; i < count; i++) {
    let total = 0;
    const [xi, yi] = particleXy(particleSystem, i);
    const ri = radii && radii[i] > 1e-4 ? radii[i] : fallback;
    forEachCandidate(hash, particleSystem, count, i, (j) => {
      const [xj, yj] = particleXy(particleSystem, j);
      const rj = radii && radii[j] > 1e-4 ? radii[j] : fallback;
      const minDist = ri + rj;
      if (minDist <= 1e-8) return;
      const dist = Math.hypot(xi - xj, yi - yj);
      const overlap = Math.max(0, minDist - dist);
      if (overlap <= 0) return;
      total += overlap / minDist;
    });
    const packed = total / maxDensity;
    ctx.targetValues[i] = Math.min(1, Math.max(0, packed * packed));
  }
}
