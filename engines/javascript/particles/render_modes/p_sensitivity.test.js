import assert from "node:assert/strict";
import test from "node:test";
import { densityGainToEngineMax } from "../../grid/render_modes/g_shared.js";
import { TUNE } from "./p_shared.js";
import { compute as proximity } from "./p_proximity.js";
import { compute as pressure } from "./p_pressure.js";

test("particle tunes live together in p_shared", () => {
  assert.deepEqual(TUNE, {
    noise: 1,
    proximity: 40,
    velocity: 1,
    pressure: 5,
    collision: 1,
    proximityB: 1,
    density: 1,
    vorticity: 1,
    overlap: 1,
    velocityC: 1,
  });
});

/** Gain whose engine divisor is `engineMax` (slider stays 0..1). */
function gainFor(engineMax) {
  return (engineMax - 12) / (0.1 - 12);
}

function pair(x1, x0 = 0.5) {
  return {
    x: new Float32Array([x0, x1]),
    y: new Float32Array([0.5, 0.5]),
    particleRadii: new Float32Array([0.05, 0.05]),
  };
}

function run(compute, particles, engineMax) {
  const ctx = {
    simParams: { rendering: { maxDensity: gainFor(engineMax) } },
    targetValues: new Float32Array(2),
  };
  assert.ok(Math.abs(densityGainToEngineMax(ctx.simParams.rendering.maxDensity) - engineMax) < 1e-4);
  compute(ctx, particles, 2);
  return ctx.targetValues[0];
}

test("proximity diameter contact uses scale 40", () => {
  // dist = 0.1 = 2 * radius → exp(-4). Scale 40 / divisor 2.1 ≈ 0.349.
  const got = run(proximity, pair(0.6), 2.1);
  const expected = (40 * Math.exp(-4)) / 2.1;
  assert.ok(Math.abs(got - expected) < 1e-4, `${got} vs ${expected}`);
});

test("pressure overlap is scaled before the square", () => {
  // dist 0.05, minDist 0.10 → fraction 0.5. Scale 5, divisor 10 → 0.0625.
  const got = run(pressure, pair(0.55), 10);
  assert.ok(Math.abs(got - 0.0625) < 1e-4, `${got}`);
});
