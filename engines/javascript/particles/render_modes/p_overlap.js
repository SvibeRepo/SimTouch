import {
  TUNE,
  engineMaxDensity,
  fallbackRadius,
  forEachCandidate,
  overlapHash,
  particleXy,
} from "./p_shared.js";

/**
 * Sum of 1D contact overlaps with neighbours (not normalized by minDist).
 */
export function compute(ctx, particleSystem, count) {
  const radii = particleSystem.particleRadii;
  const fallback = fallbackRadius(particleSystem, ctx.simParams);
  const maxDensity = engineMaxDensity(ctx.simParams);
  const scale = fallback > 1e-8 ? fallback : 1e-4;
  const hash = overlapHash(particleSystem, count, fallback);

  for (let i = 0; i < count; i++) {
    let total = 0;
    const [xi, yi] = particleXy(particleSystem, i);
    const ri = radii && radii[i] > 1e-4 ? radii[i] : fallback;
    forEachCandidate(hash, particleSystem, count, i, (j) => {
      const [xj, yj] = particleXy(particleSystem, j);
      const rj = radii && radii[j] > 1e-4 ? radii[j] : fallback;
      const minDist = ri + rj;
      const dist = Math.hypot(xi - xj, yi - yj);
      total += Math.max(0, minDist - dist);
    });
    ctx.targetValues[i] = Math.min(1, Math.max(0, (total * TUNE.overlap) / (scale * maxDensity)));
  }
}
