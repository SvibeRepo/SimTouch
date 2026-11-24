import { TUNE, particleSpeed, speedNorm } from "./p_shared.js";

/** Own speed → theme level. */
export function compute(ctx, particleSystem, count) {
  for (let i = 0; i < count; i++) {
    ctx.targetValues[i] = speedNorm(particleSpeed(particleSystem, i) * TUNE.velocity, ctx.simParams);
  }
}
