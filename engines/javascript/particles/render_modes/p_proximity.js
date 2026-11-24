import {
  CUTOFF,
  TUNE,
  engineMaxDensity,
  fallbackRadius,
  forEachCandidate,
  gaussianHash,
  particleXy,
} from "./p_shared.js";

/** Neighbour Gaussian mass → theme level. */
export function compute(ctx, particleSystem, count) {
  const radii = particleSystem.particleRadii;
  const fallback = fallbackRadius(particleSystem, ctx.simParams);
  const maxDensity = engineMaxDensity(ctx.simParams);
  const hash = gaussianHash(particleSystem, count, fallback);

  for (let i = 0; i < count; i++) {
    let density = 0;
    const [xi, yi] = particleXy(particleSystem, i);
    forEachCandidate(hash, particleSystem, count, i, (j) => {
      const [xj, yj] = particleXy(particleSystem, j);
      const dx = xi - xj;
      const dy = yi - yj;
      const sigma = radii && radii[j] > 1e-4 ? radii[j] : fallback;
      const e = (dx * dx + dy * dy) / (sigma * sigma);
      if (e > CUTOFF) return;
      density += Math.exp(-e);
    });
    ctx.targetValues[i] = Math.min(1, Math.max(0, (density * TUNE.proximity) / maxDensity));
  }
}
