import { densityGainToEngineMax } from "../../grid/render_modes/grid_render_manager.js";

/** Beyond 4 sigma a neighbour adds < 0.1 LSB (same cutoff as C++ ParticleModes). */
export const CUTOFF = 16.0;
export const NOISE_TUNE = 2.2;
/** Below this count, neighbour modes use O(N²); above, a spatial hash. */
export const BRUTE_FORCE_LIMIT = 64;

export function particleXy(particleSystem, i) {
  if (particleSystem.x && particleSystem.y) {
    return [particleSystem.x[i], particleSystem.y[i]];
  }
  const p = particleSystem.particles;
  return [p[i * 2], p[i * 2 + 1]];
}

export function particleSpeed(particleSystem, i) {
  const vx = particleSystem.velocitiesX?.[i] ?? 0;
  const vy = particleSystem.velocitiesY?.[i] ?? 0;
  return Math.hypot(vx, vy);
}

export function engineMaxDensity(simParams) {
  return densityGainToEngineMax(simParams?.rendering?.maxDensity ?? 0.58824);
}

export function maxVelocity(simParams) {
  const v = simParams?.simulation?.maxVelocity ?? 1;
  return v > 1e-6 ? v : 1e-6;
}

/** Same product idea as C++ cell velocity: speed / (maxV * Sensitivity divisor). */
export function speedNorm(speed, simParams) {
  return Math.min(
    1,
    Math.max(0, speed / (maxVelocity(simParams) * engineMaxDensity(simParams)))
  );
}

export function fallbackRadius(particleSystem, simParams) {
  return (
    (particleSystem.particleRadius ?? simParams?.simulation?.particleRadius ?? 0.01) ||
    1e-4
  );
}

export function maxParticleRadius(particleSystem, count, fallback) {
  let maxR = fallback;
  const radii = particleSystem.particleRadii;
  if (radii) {
    for (let i = 0; i < count; i++) {
      if (radii[i] > maxR) maxR = radii[i];
    }
  }
  return maxR;
}

/**
 * Uniform grid over [0,1]². Cell size should be >= search radius so a 3×3
 * neighbourhood covers every pair within that radius.
 */
export function buildSpatialHash(particleSystem, count, cellSize) {
  const size = cellSize > 1e-6 ? cellSize : 1e-6;
  const inv = 1 / size;
  const bins = new Map();
  for (let i = 0; i < count; i++) {
    const [x, y] = particleXy(particleSystem, i);
    const cx = Math.floor(x * inv);
    const cy = Math.floor(y * inv);
    const key = cx * 73856093 + cy * 19349663;
    let arr = bins.get(key);
    if (!arr) {
      arr = [];
      bins.set(key, arr);
    }
    arr.push(i);
  }
  return { bins, inv };
}

/** Visit each candidate neighbour of i (self excluded). Caller applies cutoff. */
export function forEachCandidate(hash, particleSystem, count, i, visit) {
  if (!hash) {
    for (let j = 0; j < count; j++) {
      if (j !== i) visit(j);
    }
    return;
  }
  const [x, y] = particleXy(particleSystem, i);
  const cx = Math.floor(x * hash.inv);
  const cy = Math.floor(y * hash.inv);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const key = (cx + ox) * 73856093 + (cy + oy) * 19349663;
      const arr = hash.bins.get(key);
      if (!arr) continue;
      for (let k = 0; k < arr.length; k++) {
        const j = arr[k];
        if (j !== i) visit(j);
      }
    }
  }
}

/** Hash for Gaussian kernels: search radius = 4 × max sigma (matches CUTOFF). */
export function gaussianHash(particleSystem, count, fallback) {
  if (count < BRUTE_FORCE_LIMIT) return null;
  const maxR = maxParticleRadius(particleSystem, count, fallback);
  return buildSpatialHash(particleSystem, count, Math.max(4 * maxR, 1e-4));
}

/** Hash for contact/overlap kernels: search radius = 2 × max radius. */
export function overlapHash(particleSystem, count, fallback) {
  if (count < BRUTE_FORCE_LIMIT) return null;
  const maxR = maxParticleRadius(particleSystem, count, fallback);
  return buildSpatialHash(particleSystem, count, Math.max(2 * maxR, 1e-4));
}
