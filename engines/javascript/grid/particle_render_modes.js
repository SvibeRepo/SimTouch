import {
  densityGainToEngineMax,
  fadeDurationToRate,
  GridField,
  GRID_MODE_IDS,
} from "./grid_render_modes.js";

/** Same cutoff idea as C++ ParticleModes: beyond 4 sigma a neighbour adds < 0.1 LSB. */
const CUTOFF = 16.0;
const NOISE_TUNE = 2.2;

/**
 * Per-particle theme levels for the lab particle output class.
 * Same method names as GridRenderModes / cellMode, rewritten for one particle.
 * Visual only: no cell data array. Sized for the lab particle cap (2048).
 */
export class ParticleRenderModes {
  constructor({ simParams = null, rustCore = null } = {}) {
    this.simParams = simParams;
    this.rustCore = rustCore;
    this.modes = GridField;
    this.currentMode = this.modes.PROXIMITY;
    this.targetValues = new Float32Array(0);
    this.currentValues = new Float32Array(0);
    this.smoothing = { rateIn: 0.15, rateOut: 0.08 };
  }

  modeId() {
    const id = GRID_MODE_IDS.indexOf(this.currentMode);
    return id >= 0 ? id : 0;
  }

  canUseRust() {
    return this.simParams?.simulation?.engine === "rust" && !!this.rustCore?.ready;
  }

  ensureCapacity(n) {
    if (this.currentValues.length >= n) return;
    const nextT = new Float32Array(n);
    const nextC = new Float32Array(n);
    nextT.set(this.targetValues);
    nextC.set(this.currentValues);
    this.targetValues = nextT;
    this.currentValues = nextC;
  }

  setSmoothingFromParams(simParams) {
    const s = simParams?.smoothing;
    if (!s) return;
    this.smoothing.rateIn = fadeDurationToRate(s.rateIn);
    this.smoothing.rateOut = fadeDurationToRate(s.rateOut);
  }

  /** True when this mode name has a particle rewrite. */
  supportsMode(mode) {
    return (
      mode === this.modes.NOISE ||
      mode === this.modes.PROXIMITY ||
      mode === this.modes.VELOCITY ||
      mode === this.modes.VELOCITY_C
    );
  }

  particleXy(particleSystem, i) {
    if (particleSystem.x && particleSystem.y) {
      return [particleSystem.x[i], particleSystem.y[i]];
    }
    const p = particleSystem.particles;
    return [p[i * 2], p[i * 2 + 1]];
  }

  particleSpeed(particleSystem, i) {
    const vx = particleSystem.velocitiesX?.[i] ?? 0;
    const vy = particleSystem.velocitiesY?.[i] ?? 0;
    return Math.hypot(vx, vy);
  }

  engineMaxDensity() {
    return densityGainToEngineMax(this.simParams?.rendering?.maxDensity ?? 0.58824);
  }

  maxVelocity() {
    const v = this.simParams?.simulation?.maxVelocity ?? 1;
    return v > 1e-6 ? v : 1e-6;
  }

  speedNorm(speed) {
    // Same product idea as C++ cell velocity: speed / (maxV * Sensitivity divisor).
    return Math.min(1, Math.max(0, speed / (this.maxVelocity() * this.engineMaxDensity())));
  }

  compute(particleSystem) {
    const count = particleSystem?.numParticles ?? 0;
    this.ensureCapacity(count);
    this.targetValues.fill(0, 0, count);

    if (!this.supportsMode(this.currentMode) || count === 0) {
      this.smoothInto(count);
      return this.currentValues.subarray(0, count);
    }

    if (this.canUseRust() && this.rustCore.particleEval) {
      const maxDensity = this.engineMaxDensity();
      this.rustCore.particleEval(this.modeId(), maxDensity, this.maxVelocity());
      const src = this.rustCore.particleValues();
      if (src) this.targetValues.set(src.subarray(0, count));
      else this.targetValues.fill(0, 0, count);
    } else if (this.currentMode === this.modes.NOISE) {
      this.computeNoise(particleSystem, count);
    } else if (this.currentMode === this.modes.VELOCITY) {
      this.computeVelocity(particleSystem, count);
    } else if (this.currentMode === this.modes.VELOCITY_C) {
      this.computeVelocityC(particleSystem, count);
    } else {
      this.computeProximity(particleSystem, count);
    }
    this.smoothInto(count);
    return this.currentValues.subarray(0, count);
  }

  computeProximity(particleSystem, count) {
    const radii = particleSystem.particleRadii;
    const fallback =
      (particleSystem.particleRadius ?? this.simParams?.simulation?.particleRadius ?? 0.01) ||
      1e-4;
    const maxDensity = this.engineMaxDensity();

    for (let i = 0; i < count; i++) {
      let density = 0;
      const [xi, yi] = this.particleXy(particleSystem, i);
      for (let j = 0; j < count; j++) {
        if (j === i) continue;
        const [xj, yj] = this.particleXy(particleSystem, j);
        const dx = xi - xj;
        const dy = yi - yj;
        const sigma = radii && radii[j] > 1e-4 ? radii[j] : fallback;
        const e = (dx * dx + dy * dy) / (sigma * sigma);
        if (e > CUTOFF) continue;
        density += Math.exp(-e);
      }
      this.targetValues[i] = Math.min(1, Math.max(0, density / maxDensity));
    }
  }

  /** Own speed → theme level. */
  computeVelocity(particleSystem, count) {
    for (let i = 0; i < count; i++) {
      this.targetValues[i] = this.speedNorm(this.particleSpeed(particleSystem, i));
    }
  }

  /**
   * Neighbour-weighted speed (Gaussian kernel, self excluded).
   * Same neighbourhood idea as proximity; value is average neighbour speed.
   */
  computeVelocityC(particleSystem, count) {
    const radii = particleSystem.particleRadii;
    const fallback =
      (particleSystem.particleRadius ?? this.simParams?.simulation?.particleRadius ?? 0.01) ||
      1e-4;

    for (let i = 0; i < count; i++) {
      let wSum = 0;
      let speedSum = 0;
      const [xi, yi] = this.particleXy(particleSystem, i);
      for (let j = 0; j < count; j++) {
        if (j === i) continue;
        const [xj, yj] = this.particleXy(particleSystem, j);
        const dx = xi - xj;
        const dy = yi - yj;
        const sigma = radii && radii[j] > 1e-4 ? radii[j] : fallback;
        const e = (dx * dx + dy * dy) / (sigma * sigma);
        if (e > CUTOFF) continue;
        const w = Math.exp(-e);
        wSum += w;
        speedSum += this.particleSpeed(particleSystem, j) * w;
      }
      this.targetValues[i] = wSum > 0 ? this.speedNorm(speedSum / wSum) : 0;
    }
  }

  computeNoise(particleSystem, count) {
    const turbulence = particleSystem?.turbulence;
    if (!turbulence?.noise2D) {
      this.targetValues.fill(0, 0, count);
      return;
    }
    const maxDensity = this.engineMaxDensity();

    for (let i = 0; i < count; i++) {
      const [xi, yi] = this.particleXy(particleSystem, i);
      // Lab particles are already in normalized [0,1] (ny is simulation Y).
      const noise01 = turbulence.noise2D(xi, yi, turbulence.time, true);
      this.targetValues[i] = Math.min(
        1,
        Math.max(0, (noise01 * NOISE_TUNE) / maxDensity)
      );
    }
  }

  smoothInto(count) {
    for (let i = 0; i < count; i++) {
      const target = this.targetValues[i];
      const current = this.currentValues[i];
      const rate = target > current ? this.smoothing.rateIn : this.smoothing.rateOut;
      this.currentValues[i] = Math.min(
        1,
        Math.max(0, current + (target - current) * rate)
      );
    }
  }
}
