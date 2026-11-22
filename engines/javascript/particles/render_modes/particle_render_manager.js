import { fadeDurationToRate, GridField, GRID_MODE_IDS } from "../../grid/render_modes/grid_render_manager.js";
import { engineMaxDensity, maxVelocity } from "./p_shared.js";
import * as noise from "./p_noise.js";
import * as proximity from "./p_proximity.js";
import * as proximityB from "./p_proximity_b.js";
import * as density from "./p_density.js";
import * as velocity from "./p_velocity.js";
import * as velocityC from "./p_velocity_c.js";
import * as pressure from "./p_pressure.js";
import * as overlap from "./p_overlap.js";
import * as collision from "./p_collision.js";
import * as vorticity from "./p_vorticity.js";

/**
 * Per-particle theme levels for the lab particle output class.
 * Dispatches to mode modules under particles/render_modes/. Visual only: no cell data array.
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
    const m = this.modes;
    return (
      mode === m.NOISE ||
      mode === m.PROXIMITY ||
      mode === m.PROXIMITYB ||
      mode === m.DENSITY ||
      mode === m.VELOCITY ||
      mode === m.VELOCITY_C ||
      mode === m.PRESSURE ||
      mode === m.OVERLAP ||
      mode === m.COLLISION ||
      mode === m.VORTICITY
    );
  }

  computeJs(particleSystem, count) {
    const m = this.modes;
    switch (this.currentMode) {
      case m.NOISE:
        noise.compute(this, particleSystem, count);
        break;
      case m.PROXIMITY:
        proximity.compute(this, particleSystem, count);
        break;
      case m.PROXIMITYB:
        proximityB.compute(this, particleSystem, count);
        break;
      case m.DENSITY:
        density.compute(this, particleSystem, count);
        break;
      case m.VELOCITY:
        velocity.compute(this, particleSystem, count);
        break;
      case m.VELOCITY_C:
        velocityC.compute(this, particleSystem, count);
        break;
      case m.PRESSURE:
        pressure.compute(this, particleSystem, count);
        break;
      case m.OVERLAP:
        overlap.compute(this, particleSystem, count);
        break;
      case m.COLLISION:
        collision.compute(this, particleSystem, count);
        break;
      case m.VORTICITY:
        vorticity.compute(this, particleSystem, count);
        break;
      default:
        this.targetValues.fill(0, 0, count);
    }
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
      this.rustCore.particleEval(
        this.modeId(),
        engineMaxDensity(this.simParams),
        maxVelocity(this.simParams)
      );
      const src = this.rustCore.particleValues();
      if (src) this.targetValues.set(src.subarray(0, count));
      else this.targetValues.fill(0, 0, count);
    } else {
      this.computeJs(particleSystem, count);
    }
    this.smoothInto(count);
    return this.currentValues.subarray(0, count);
  }

  smoothInto(count) {
    for (let i = 0; i < count; i++) {
      const target = this.targetValues[i];
      const current = this.currentValues[i];
      // Non-finite current never recovers via lerp (NaN poisons every frame).
      if (!Number.isFinite(target)) {
        this.currentValues[i] = Number.isFinite(current) ? current : 0;
        continue;
      }
      if (!Number.isFinite(current)) {
        this.currentValues[i] = target;
        continue;
      }
      const rate = target > current ? this.smoothing.rateIn : this.smoothing.rateOut;
      const next = current + (target - current) * rate;
      this.currentValues[i] = Number.isFinite(next)
        ? Math.min(1, Math.max(0, next))
        : target;
    }
  }
}
