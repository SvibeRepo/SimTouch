// Step fixtures/gravity-step.json on the JavaScript tick and on core/cpp, then compare.
// From the SimTouch root:
//   node --import ./tools/lab-register.mjs tools/compare-slice.mjs

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const fixture = JSON.parse(readFileSync("fixtures/gravity-step.json", "utf8"));
const chart = JSON.parse(readFileSync("spec/fields.json", "utf8"));
const byName = new Map(chart.fields.map((row) => [row.name, row]));

function cppIndex(name) {
  const row = byName.get(name);
  if (!row) throw new Error(`${name} is not on the shared field chart`);
  return row.cpp;
}

const { ParticleSystem } = await import("../core/javascript/core/particleSystem.js");
const { CircularBoundary } = await import("../core/javascript/boundary/circularBoundary.js");

const boundary = new CircularBoundary({
  radius: 0.5 * 1.03,
  boundaryRepulsion: 0,
  damping: fixture.fields.boundaryDamping,
  cBoundaryRestitution: fixture.fields.boundaryRestitution,
  mode: "BOUNCE",
});
const turbulence = {
  strength: 0,
  affectScale: false,
  affectPosition: false,
  scaleField: false,
  decayRate: 1,
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
  particleCount: fixture.particles.length,
  timeStep: fixture.dt,
  turbulence,
  voronoi,
  boundaryManager: { getPhysicsBoundary: () => boundary },
});
ps.timeScale = fixture.timeScale;
ps.maxVelocity = fixture.maxVelocity;
ps.particleRadius = fixture.particleRadius;
ps.picFlipRatio = 0;
ps.gravity.directionX = fixture.fields.gravityX;
ps.gravity.directionY = fixture.fields.gravityY;
ps.gravity.updateMagnitude();
ps.velocityDamping = fixture.fields.velocityDamping;
ps.boundaryDamping = fixture.fields.boundaryDamping;
ps.collisionSystem.enabled = fixture.fields.collisionEnabled !== 0;
turbulence.strength = fixture.fields.turbStrength;
turbulence.affectPosition = fixture.fields.turbAffectPosition !== 0;
turbulence.affectScale = fixture.fields.turbAffectScale !== 0;
turbulence.scaleField = fixture.fields.turbScaleField !== 0;
turbulence.decayRate = fixture.fields.turbDecay;
boundary.boundaryRepulsion = fixture.fields.boundaryRepulsion;
boundary.damping = fixture.fields.boundaryDamping;

for (let i = 0; i < fixture.particles.length; i++) {
  const p = fixture.particles[i];
  ps.particles[i * 2] = p.x;
  ps.particles[i * 2 + 1] = p.y;
  ps.velocitiesX[i] = p.vx;
  ps.velocitiesY[i] = p.vy;
}
ps.step();

const js = fixture.particles.map((_, i) => ({
  x: ps.particles[i * 2],
  y: ps.particles[i * 2 + 1],
  vx: ps.velocitiesX[i],
  vy: ps.velocitiesY[i],
}));

const lines = [
  `${fixture.dt} ${fixture.timeScale} ${fixture.particleRadius} ${fixture.maxVelocity}`,
  String(Object.keys(fixture.fields).length),
];
for (const [name, value] of Object.entries(fixture.fields)) {
  lines.push(`${cppIndex(name)} ${value}`);
}
lines.push(String(fixture.particles.length));
for (const p of fixture.particles) lines.push(`${p.x} ${p.y} ${p.vx} ${p.vy}`);

const exe = path.join("core", "cpp", "test", "slice_step.exe");
const cpp = spawnSync(exe, [], { input: lines.join("\n"), encoding: "utf8" });
if (cpp.status !== 0) {
  console.error(cpp.stderr || cpp.stdout || `slice_step exited ${cpp.status}`);
  process.exit(1);
}
const cppRows = cpp.stdout.trim().split(/\r?\n/).map((line) => {
  const [x, y, vx, vy] = line.split(/\s+/).map(Number);
  return { x, y, vx, vy };
});

const tol = fixture.tolerance;
let failed = false;
js.forEach((row, i) => {
  const other = cppRows[i];
  for (const key of ["x", "y", "vx", "vy"]) {
    const delta = Math.abs(row[key] - other[key]);
    if (delta > tol) {
      failed = true;
      console.error(`particle ${i} ${key} js ${row[key]} cpp ${other[key]} delta ${delta}`);
    }
  }
});
if (failed) process.exit(1);
console.log(`slice ok ${fixture.name} particles=${js.length} tolerance=${tol}`);
process.exit(0);
