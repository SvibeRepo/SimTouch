import {
  CUTOFF,
  fallbackRadius,
  forEachCandidate,
  gaussianHash,
  particleSpeed,
  particleXy,
  speedNorm,
} from "./p_shared.js";

/**
 * Neighbour-weighted speed (Gaussian kernel, self excluded).
 * Same neighbourhood idea as proximity; value is average neighbour speed.
 */
export function compute(ctx, particleSystem, count) {
  const radii = particleSystem.particleRadii;
  const fallback = fallbackRadius(particleSystem, ctx.simParams);
  const hash = gaussianHash(particleSystem, count, fallback);

  for (let i = 0; i < count; i++) {
    let wSum = 0;
    let speedSum = 0;
    const [xi, yi] = particleXy(particleSystem, i);
    forEachCandidate(hash, particleSystem, count, i, (j) => {
      const [xj, yj] = particleXy(particleSystem, j);
      const dx = xi - xj;
      const dy = yi - yj;
      const sigma = radii && radii[j] > 1e-4 ? radii[j] : fallback;
      const e = (dx * dx + dy * dy) / (sigma * sigma);
      if (e > CUTOFF) return;
      const w = Math.exp(-e);
      wSum += w;
      speedSum += particleSpeed(particleSystem, j) * w;
    });
    ctx.targetValues[i] = wSum > 0 ? speedNorm(speedSum / wSum, ctx.simParams) : 0;
  }
}
