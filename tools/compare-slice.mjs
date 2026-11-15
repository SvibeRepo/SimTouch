// Step fixtures/gravity-step.json on the JavaScript tick, the Rust tick, and
// core/cpp, then compare. From the SimTouch root:
//   node --import ./tools/lab-register.mjs tools/compare-slice.mjs

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const fixture = JSON.parse(readFileSync("fixtures/gravity-step.json", "utf8"));
const chart = JSON.parse(readFileSync("spec/fields.json", "utf8"));
const byName = new Map(chart.fields.map((row) => [row.name, row]));

function chartIndex(name, column) {
  const row = byName.get(name);
  if (!row) throw new Error(`${name} is not on the shared field chart`);
  return row[column];
}

const { ParticleSystem } = await import("../core/javascript/core/particleSystem.js");
const { CircularBoundary } = await import("../core/javascript/boundary/circularBoundary.js");
const { TurbulenceField } = await import("../core/javascript/forces/turbulenceField.js");

const fields = fixture.fields;
const boundary = new CircularBoundary({
  radius: 0.5 * 1.03,
  boundaryRepulsion: fields.boundaryRepulsion,
  damping: fields.boundaryDamping,
  cBoundaryRestitution: fields.boundaryRestitution,
  mode: "BOUNCE",
});
const turbulence = new TurbulenceField({
  strength: fields.turbStrength,
  pullFactor: fields.turbPull,
  decayRate: fields.turbDecay,
  directionBias: [fields.turbDirX, fields.turbDirY],
  biasStrength: fields.turbBiasStrength,
  boundary,
  timeOffset: 0,
  noiseSeed: 1,
});
turbulence.affectPosition = fields.turbAffectPosition !== 0;
turbulence.affectScale = fields.turbAffectScale !== 0;
turbulence.scaleField = fields.turbScaleField !== 0;
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
ps.particleRadii.fill(fixture.particleRadius);
ps.picFlipRatio = 0;
ps.gravity.directionX = fields.gravityX;
ps.gravity.directionY = fields.gravityY;
ps.gravity.updateMagnitude();
ps.velocityDamping = fields.velocityDamping;
ps.boundaryDamping = fields.boundaryDamping;
ps.collisionSystem.enabled = fields.collisionEnabled !== 0;
ps.collisionSystem.gridSizeCollision = fields.collisionGrid;
ps.collisionSystem.repulsion = fields.collisionRepulsion;
ps.collisionSystem.particleRestitution = fields.collisionRestitution;
ps.collisionSystem.initializeGrid();
boundary.boundaryRepulsion = fields.boundaryRepulsion;
boundary.damping = fields.boundaryDamping;

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

function protocol(column) {
  const lines = [
    `${fixture.dt} ${fixture.timeScale} ${fixture.particleRadius} ${fixture.maxVelocity}`,
    String(Object.keys(fields).length),
  ];
  for (const [name, value] of Object.entries(fields)) {
    lines.push(`${chartIndex(name, column)} ${value}`);
  }
  lines.push(String(fixture.particles.length));
  for (const p of fixture.particles) lines.push(`${p.x} ${p.y} ${p.vx} ${p.vy}`);
  return lines.join("\n");
}

function rowsFrom(exe, input) {
  const result = spawnSync(exe, [], { input, encoding: "utf8" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `${exe} exited ${result.status}`);
    process.exit(1);
  }
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [x, y, vx, vy] = line.split(/\s+/).map(Number);
    return { x, y, vx, vy };
  });
}

function rustExe() {
  const names = process.platform === "win32"
    ? ["slice_step.exe", "slice_step"]
    : ["slice_step", "slice_step.exe"];
  for (const dir of ["debug", "release"]) {
    for (const name of names) {
      const candidate = path.join("core", "rust", "target", dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const cppExe = path.join("core", "cpp", "test", "slice_step.exe");
const rust = rustExe();
if (!existsSync(cppExe)) {
  console.error("missing core/cpp/test/slice_step.exe");
  process.exit(1);
}
if (!rust) {
  console.error("missing core/rust slice_step. From core/rust: cargo build --bin slice_step");
  process.exit(1);
}

const cppRows = rowsFrom(cppExe, protocol("cpp"));
const rustRows = rowsFrom(rust, protocol("rust"));
const tol = fixture.tolerance;
let failed = false;
js.forEach((row, i) => {
  for (const [label, other] of [["cpp", cppRows[i]], ["rust", rustRows[i]]]) {
    for (const key of ["x", "y", "vx", "vy"]) {
      const delta = Math.abs(row[key] - other[key]);
      if (delta > tol) {
        failed = true;
        console.error(`particle ${i} ${key} js ${row[key]} ${label} ${other[key]} delta ${delta}`);
      }
    }
  }
});
if (failed) process.exit(1);
console.log(`slice ok ${fixture.name} particles=${js.length} tolerance=${tol}`);
process.exit(0);
