/** Cell-mode names, fade, and density gain. Moved unchanged from grid_render_manager.js. */
export const GridField = {
  NOISE: "--- NOISE ---",
  PROXIMITY: "Proximity",
  VELOCITY: "Velocity",
  PRESSURE: "Pressure",
  COLLISION: "Collision",
  PROXIMITYB: "ProximityB",
  DENSITY: "Density",
  VORTICITY: "Vorticity",
  OVERLAP: "Overlap",
  // Particle-class only for now (own-speed Velocity stays shared; this is neighbour-weighted).
  VELOCITY_C: "VelocityC",
};

/** Mode ids match `Object.values(GridField)` and `engines/rust/src/grid/render_modes/g_shared.rs`. */
export const GRID_MODE_IDS = Object.values(GridField);

/** Lab FadIn/FadOut duration: 0 = instant, max = slowest catch-up. */
export const FADE_DURATION_MAX = 0.5;
/** Engine rate at FADE_DURATION_MAX (matches prior slider floor). */
export const FADE_RATE_AT_MAX_DURATION = 0.01;

/**
 * UI duration → per-frame lerp rate.
 * Linear in 1/rate (catch-up time), not in rate — otherwise 0..~0.4 feels
 * instant and only the last notch is slow (exponential lerp perception).
 * 0 → rate 1, max → FADE_RATE_AT_MAX_DURATION.
 */
export function fadeDurationToRate(duration) {
  const d = Math.max(0, Math.min(FADE_DURATION_MAX, Number(duration) || 0));
  if (d <= 0) return 1;
  const t = d / FADE_DURATION_MAX;
  const invRate = 1 + t * (1 / FADE_RATE_AT_MAX_DURATION - 1);
  return 1 / invRate;
}

/** Engine rate → UI duration (factory preset remap). */
export function fadeRateToDuration(rate) {
  const r = Math.max(FADE_RATE_AT_MAX_DURATION, Math.min(1, Number(rate) || 0));
  if (r >= 1) return 0;
  return (
    (FADE_DURATION_MAX * (1 / r - 1)) /
    (1 / FADE_RATE_AT_MAX_DURATION - 1)
  );
}

/** Lab Sensitivity (Density) gain: 0 = dim, 1 = bright. Engine still divides by max. */
export const DENSITY_GAIN_MIN = 0;
export const DENSITY_GAIN_MAX = 1;
/** Engine divisor at gain 0 / 1 (legacy slider endpoints, polarity flipped). */
export const DENSITY_ENGINE_AT_MIN_GAIN = 12;
export const DENSITY_ENGINE_AT_MAX_GAIN = 0.1;

/**
 * UI gain → engine maxDensity divisor.
 * Linear in the divisor (same usable span as the old 0.1..12 slider, flipped):
 * 0 → 12 (dim), 1 → 0.1 (bright). Not linear in 1/max — that crushed the range.
 */
export function densityGainToEngineMax(gain) {
  const g = Math.max(
    DENSITY_GAIN_MIN,
    Math.min(DENSITY_GAIN_MAX, Number(gain) || 0)
  );
  return (
    DENSITY_ENGINE_AT_MIN_GAIN +
    g * (DENSITY_ENGINE_AT_MAX_GAIN - DENSITY_ENGINE_AT_MIN_GAIN)
  );
}

/** Legacy engine max → UI gain 0..1 (factory preset remap). */
export function engineMaxToDensityGain(engineMax) {
  const m = Math.max(
    DENSITY_ENGINE_AT_MAX_GAIN,
    Math.min(
      DENSITY_ENGINE_AT_MIN_GAIN,
      Number(engineMax) || DENSITY_ENGINE_AT_MIN_GAIN
    )
  );
  return (
    (DENSITY_ENGINE_AT_MIN_GAIN - m) /
    (DENSITY_ENGINE_AT_MIN_GAIN - DENSITY_ENGINE_AT_MAX_GAIN)
  );
}
