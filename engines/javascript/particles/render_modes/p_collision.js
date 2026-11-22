import {
  fallbackRadius,
  forEachCandidate,
  maxVelocity,
  overlapHash,
  particleXy,
  speedNorm,
} from "./p_shared.js";

/**
 * Local approach: sum of closing relative speeds with overlapping neighbours.
 */
export function compute(ctx, particleSystem, count) {
  const radii = particleSystem.particleRadii;
  const vx = particleSystem.velocitiesX;
  const vy = particleSystem.velocitiesY;
  const fallback = fallbackRadius(particleSystem, ctx.simParams);
  const vCap = maxVelocity(ctx.simParams);
  const hash = overlapHash(particleSystem, count, fallback);

  for (let i = 0; i < count; i++) {
    let approach = 0;
    const [xi, yi] = particleXy(particleSystem, i);
    const ri = radii && radii[i] > 1e-4 ? radii[i] : fallback;
    const vxi = vx?.[i] ?? 0;
    const vyi = vy?.[i] ?? 0;
    forEachCandidate(hash, particleSystem, count, i, (j) => {
      const [xj, yj] = particleXy(particleSystem, j);
      const rj = radii && radii[j] > 1e-4 ? radii[j] : fallback;
      const dx = xj - xi;
      const dy = yj - yi;
      const dist = Math.hypot(dx, dy);
      const minDist = ri + rj;
      if (dist <= 1e-8 || dist > minDist) return;
      const nx = dx / dist;
      const ny = dy / dist;
      const rvx = (vx?.[j] ?? 0) - vxi;
      const rvy = (vy?.[j] ?? 0) - vyi;
      // Closing speed along the separation normal (positive when approaching).
      const closing = -(rvx * nx + rvy * ny);
      if (closing > 0) approach += closing;
    });
    ctx.targetValues[i] = speedNorm(approach, ctx.simParams);
    // speedNorm already folds maxV * Sensitivity; clamp again if approach >> maxV.
    if (!(ctx.targetValues[i] >= 0)) ctx.targetValues[i] = 0;
    void vCap;
  }
}
