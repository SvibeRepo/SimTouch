// One-particle PIC/FLIP probe. Exits 1 when the JavaScript tick ignores PicFlipRatio.
//   node --import ./tools/lab-register.mjs tools/flip-boundary-probe.mjs

import { ParticleSystem } from "../core/javascript/core/particleSystem.js";
import { CircularBoundary } from "../core/javascript/boundary/circularBoundary.js";

function make(count, picOnSystem, picOnFluid) {
  const boundary = new CircularBoundary({
    radius: 0.5,
    mode: "BOUNCE",
    boundaryRepulsion: 0,
    damping: 1,
    cBoundaryRestitution: 1,
  });
  const turbulence = {
    strength: 0,
    affectPosition: false,
    affectScale: false,
    scaleField: false,
    update() {},
    applyTurbulence(_pos, vel) { return vel; },
  };
  const voronoi = {
    strength: 0,
    update() {},
    regenerateCells() {},
    applyTurbulence(_pos, vel) { return vel; },
  };
  const ps = new ParticleSystem({
    particleCount: count,
    timeStep: 1 / 60,
    picFlipRatio: 0,
    turbulence,
    voronoi,
    boundaryManager: { getPhysicsBoundary: () => boundary },
  });
  ps.velocityDamping = 1;
  ps.velocityThreshold = 0;
  ps.positionThreshold = 0;
  ps.maxVelocity = 1;
  ps.collisionSystem.enabled = false;
  ps.picFlipRatio = picOnSystem;
  if (picOnFluid != null) ps.fluid.picFlipRatio = picOnFluid;
  for (let i = 0; i < count; i++) {
    ps.particles[i * 2] = 0.5;
    ps.particles[i * 2 + 1] = 0.5;
    ps.velocitiesX[i] = i === 0 ? 0.4 : -0.4;
    ps.velocitiesY[i] = 0;
  }
  ps.step();
  return {
    vx0: ps.velocitiesX[0],
    vx1: count > 1 ? ps.velocitiesX[1] : null,
    fluidRatio: ps.fluid.picFlipRatio,
    pressureScale: ps.fluid.pressureScale,
    gasConstant: ps.fluid.gasConstant,
  };
}

const pic = make(2, 0, null);
const mid = make(2, 0.5, null);
const sweet = make(2, 0.95, null);
const flip = make(2, 1, null);
const lone = make(1, 0, null);
const report = { pic, mid, sweet, flip, lone };
console.log(JSON.stringify(report, null, 2));

function near(value, expected) {
  return Math.abs(value - expected) < 1e-3;
}
if (!near(pic.vx0, 0) || !near(pic.vx1, 0)) {
  console.error("RED ratio 0 should be PIC and average opposing velocities");
  process.exit(1);
}
if (!near(mid.vx0, 0.2) || !near(mid.vx1, -0.2)) {
  console.error("RED ratio 0.5 should sit halfway between PIC and FLIP");
  process.exit(1);
}
if (!near(sweet.vx0, 0.38) || !near(sweet.vx1, -0.38)) {
  console.error("RED ratio 0.95 should be 5% PIC and 95% FLIP");
  process.exit(1);
}
if (!near(flip.vx0, 0.4) || !near(flip.vx1, -0.4)) {
  console.error("RED ratio 1 should be FLIP and keep each particle velocity");
  process.exit(1);
}
if (!near(lone.vx0, 0.4)) {
  console.error("RED a lone particle should keep its velocity at PIC");
  process.exit(1);
}

function rimInward() {
  const boundary = new CircularBoundary({
    radius: 0.5,
    mode: "BOUNCE",
    boundaryRepulsion: 0,
    damping: 1,
    cBoundaryRestitution: 1,
  });
  const turbulence = {
    strength: 0,
    affectPosition: false,
    affectScale: false,
    scaleField: false,
    update() {},
    applyTurbulence(_pos, vel) { return vel; },
  };
  const voronoi = {
    strength: 0,
    update() {},
    regenerateCells() {},
    applyTurbulence(_pos, vel) { return vel; },
  };
  const ps = new ParticleSystem({
    particleCount: 1,
    timeStep: 1 / 60,
    picFlipRatio: 0,
    turbulence,
    voronoi,
    boundaryManager: { getPhysicsBoundary: () => boundary },
  });
  ps.velocityDamping = 1;
  ps.velocityThreshold = 0;
  ps.positionThreshold = 0;
  ps.maxVelocity = 1;
  ps.collisionSystem.enabled = false;
  ps.particleRadius = 0.01;
  ps.particleRadii[0] = 0.01;
  ps.picFlipRatio = 1;
  const safe = 0.5 - 0.01 - 0.001;
  const angle = Math.PI / 4;
  ps.particles[0] = 0.5 + Math.cos(angle) * safe;
  ps.particles[1] = 0.5 + Math.sin(angle) * safe;
  ps.velocitiesX[0] = 0;
  ps.velocitiesY[0] = 0;
  const dx = 0.5 - ps.particles[0];
  const dy = 0.5 - ps.particles[1];
  const d = Math.hypot(dx, dy);
  ps.gravity.setDirection((dx / d) * 4, (dy / d) * 4);
  const start = Math.hypot(ps.particles[0] - 0.5, ps.particles[1] - 0.5);
  for (let i = 0; i < 30; i++) ps.step();
  const dist = Math.hypot(ps.particles[0] - 0.5, ps.particles[1] - 0.5);
  return { start, dist, inward: start - dist, vx: ps.velocitiesX[0], vy: ps.velocitiesY[0] };
}

const rim = rimInward();
console.log(JSON.stringify({ rim }, null, 2));
if (rim.inward <= 0.02) {
  console.error("RED flip=1 diagonal particle stayed on the wall");
  process.exit(1);
}
console.log("GREEN slider blends PIC at 0 into FLIP at 1 and the rim particle leaves the wall");
process.exit(0);
