// Step a fixture on the JavaScript tick, the Rust tick, and core/cpp, then compare.
// From the SimTouch root:
//   node --import ./tools/lab-register.mjs tools/compare-slice.mjs [fixture.json ...]

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

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

function applyFields(ps, boundary, turbulence, fields) {
  const set = {
    gravityX(v) { ps.gravity.directionX = v; ps.gravity.updateMagnitude(); },
    gravityY(v) { ps.gravity.directionY = v; ps.gravity.updateMagnitude(); },
    velocityDamping(v) { ps.velocityDamping = v; },
    boundaryDamping(v) { boundary.damping = v; ps.boundaryDamping = v; },
    collisionEnabled(v) { ps.collisionSystem.enabled = v !== 0; },
    collisionGrid(v) { ps.collisionSystem.gridSizeCollision = v; ps.collisionSystem.initializeGrid(); },
    collisionRepulsion(v) { ps.collisionSystem.repulsion = v; },
    collisionRestitution(v) { ps.collisionSystem.particleRestitution = v; },
    boundaryMode(v) {
      if (v !== 0) throw new Error(`boundaryMode ${v} is outside this slice`);
      boundary.mode = "BOUNCE";
    },
    boundaryShape(v) {
      if (v !== 0) throw new Error(`boundaryShape ${v} is outside this slice`);
    },
    boundaryRestitution(v) { boundary.cBoundaryRestitution = v; },
    boundaryRepulsion(v) { boundary.boundaryRepulsion = v; },
    turbStrength(v) { turbulence.strength = v; },
    turbScale(v) { turbulence.scale = v; },
    turbSpeed(v) { turbulence.speed = v; },
    turbRotation(v) { turbulence.rotation = v; },
    turbRotationSpeed(v) { turbulence.rotationSpeed = v; },
    turbPull(v) { turbulence.pullFactor = v; },
    turbDecay(v) { turbulence.decayRate = v; },
    turbFrequency(v) { turbulence.patternFrequency = v; },
    turbPattern(v) {
      if (v !== 0) throw new Error(`turbPattern ${v} is outside this slice`);
      turbulence.patternStyle = "Checkerboard";
    },
    turbContrast(v) { turbulence.contrast = v; },
    turbSeparation(v) { turbulence.separation = v; },
    turbWarp(v) { turbulence.domainWarp = v; },
    turbWarpSpeed(v) { turbulence.domainWarpSpeed = v; },
    turbSymmetry(v) { turbulence.symmetryAmount = v; },
    turbMinScale(v) { turbulence.minScale = v; },
    turbBiasStrength(v) { turbulence.biasStrength = v; },
    turbDirX(v) { turbulence.directionBias[0] = v; },
    turbDirY(v) { turbulence.directionBias[1] = v; },
    turbAffectPosition(v) { turbulence.affectPosition = v !== 0; },
    turbAffectScale(v) { turbulence.affectScale = v !== 0; },
    turbScaleField(v) { turbulence.scaleField = v !== 0; },
  };
  for (const [name, value] of Object.entries(fields)) {
    const apply = set[name];
    if (!apply) throw new Error(`${name} is on the fixture and not applied to the JavaScript tick`);
    apply(value);
  }
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

function compare(file) {
  const fixture = JSON.parse(readFileSync(file, "utf8"));
  const fields = fixture.fields;

  const boundary = new CircularBoundary({
    radius: 0.5 * 1.03,
    mode: "BOUNCE",
  });
  const turbulence = new TurbulenceField({
    boundary,
    timeOffset: 0,
    noiseSeed: 1,
  });
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
  ps.picFlipRatio = -1;

  applyFields(ps, boundary, turbulence, fields);
  turbulence.blurAmount = 0;
  turbulence.amplitude = 1;
  turbulence.phase = 0;
  turbulence.phaseSpeed = 0;
  turbulence.time = 0;
  turbulence.timeOffset = 0;
  turbulence.noiseSeed = 1;
  turbulence.patternOffsetX = 0;
  turbulence.patternOffsetY = 0;

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
  if (fixture.expectMotion) {
    const moved = js.some((row) => Math.abs(row.vx) > 1e-4 || Math.abs(row.vy) > 1e-4);
    if (!moved) {
      console.error(`${fixture.name}: sample did not move a particle`);
      process.exit(1);
    }
  }
  if (failed) process.exit(1);
  console.log(`slice ok ${fixture.name} particles=${js.length} tolerance=${tol}`);
}

const files = process.argv.slice(2);
const list = files.length > 0
  ? files
  : ["fixtures/gravity-step.json", "fixtures/noise-step.json"];
for (const file of list) compare(file);
process.exit(0);