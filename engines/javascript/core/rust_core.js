// Loads the wasm tick and shares particle arrays with the page.
// PARAM indices match sim-core/src/params.rs.

const CAPACITY = 2048;

export const PARAM = {
  GRAVITY_X: 0,
  GRAVITY_Y: 1,
  GRAVITY_ENABLED: 2,
  VELOCITY_DAMPING: 3,
  EXTERNAL_DAMPING: 4,
  MAX_VELOCITY: 5,
  VELOCITY_THRESHOLD: 6,
  POSITION_THRESHOLD: 7,
  PARTICLE_RADIUS: 8,
  REST_DENSITY: 9,
  TIME: 10,
  ROTATION: 11,
  BIAS_X: 12,
  BIAS_Y: 13,
  BIAS_VX: 14,
  BIAS_VY: 15,
  COLLISION_ENABLED: 16,
  COLLISION_GRID: 17,
  COLLISION_REPULSION: 18,
  COLLISION_RESTITUTION: 19,
  BOUNDARY_SHAPE: 20,
  BOUNDARY_MODE: 21,
  BOUNDARY_CX: 22,
  BOUNDARY_CY: 23,
  BOUNDARY_RADIUS: 24,
  BOUNDARY_WIDTH: 25,
  BOUNDARY_HEIGHT: 26,
  BOUNDARY_RESTITUTION: 27,
  BOUNDARY_DAMPING: 28,
  BOUNDARY_REPULSION: 29,
  RECT_MIN_X: 30,
  RECT_MIN_Y: 31,
  RECT_MAX_X: 32,
  RECT_MAX_Y: 33,
  TURB_STRENGTH: 34,
  TURB_SCALE: 35,
  TURB_SPEED: 36,
  TURB_ROT_SPEED: 37,
  TURB_PULL: 38,
  TURB_DECAY: 39,
  TURB_FREQ: 40,
  TURB_PATTERN: 41,
  TURB_CONTRAST: 42,
  TURB_SEPARATION: 43,
  TURB_WARP: 44,
  TURB_WARP_SPEED: 45,
  TURB_SYMMETRY: 46,
  TURB_PHASE: 47,
  TURB_PHASE_SPEED: 48,
  TURB_AMPLITUDE: 49,
  TURB_AMPLITUDE_SPEED: 50,
  TURB_BLUR: 51,
  TURB_MIN_SCALE: 52,
  TURB_BIAS_STRENGTH: 53,
  TURB_BIAS_FRICTION: 54,
  TURB_BIAS_SENSITIVITY: 55,
  TURB_BIAS_ACCEL_X: 56,
  TURB_BIAS_ACCEL_Y: 57,
  TURB_OFFSET_X: 58,
  TURB_OFFSET_Y: 59,
  TURB_DIR_X: 60,
  TURB_DIR_Y: 61,
  TURB_AFFECT_POSITION: 62,
  TURB_AFFECT_SCALE: 63,
  TURB_SCALE_FIELD: 64,
  TURB_AMPLITUDE_ENABLED: 65,
  TURB_CONTRAST_SHADOW: 66,
  TURB_CONTRAST_MID: 67,
  TURB_CONTRAST_HIGH: 68,
  TURB_CONTRAST_DARK: 69,
  TURB_CENTER_X: 70,
  TURB_CENTER_Y: 71,
  VORONOI_STRENGTH: 72,
  VORONOI_EDGE: 73,
  VORONOI_ATTRACTION: 74,
  VORONOI_CELLS: 75,
  VORONOI_SPEED: 76,
  VORONOI_DECAY: 77,
  VORONOI_BLEND: 78,
  VORONOI_PULL: 79,
  VORONOI_SMOOTH: 80,
  FLIP_RATIO: 81,
  FLIP_ITERATIONS: 82,
  FLIP_GRID: 83,
  FLIP_GAS: 84,
  FLIP_OVERRELAX: 85,
  ORGANIC_BEHAVIOR: 86,
  ORGANIC_RADIUS: 87,
  ORGANIC_FLUID_SURFACE: 88,
  ORGANIC_FLUID_VISCOSITY: 89,
  ORGANIC_FLUID_TENSION_SCALE: 90,
  ORGANIC_FLUID_VISC_SCALE: 91,
  ORGANIC_SWARM_COHESION: 92,
  ORGANIC_SWARM_ALIGNMENT: 93,
  ORGANIC_SWARM_SEPARATION: 94,
  ORGANIC_SWARM_MAX_SPEED: 95,
  ORGANIC_AUTO_REPULSION: 96,
  ORGANIC_AUTO_ATTRACTION: 97,
  ORGANIC_AUTO_THRESHOLD: 98,
  ORGANIC_AUTO_BASE: 99,
  ORGANIC_CHAIN_DISTANCE: 100,
  ORGANIC_CHAIN_STRENGTH: 101,
  ORGANIC_CHAIN_ALIGNMENT: 102,
  ORGANIC_CHAIN_LINKS: 103,
  ORGANIC_CHAIN_BRANCH: 104,
  ORGANIC_CHAIN_BASE: 105,
  TURB_MAX_SCALE: 106,
  COUNT: 107,
};

const PATTERNS = [
  "checkerboard", "waves", "spiral", "grid", "circles", "diamonds",
  "ripples", "dots", "water", "classicdrop", "cells", "voronoi",
  "fractal", "vortex", "bubbles",
];

const BEHAVIORS = ["None", "Fluid", "Swarm", "Automata", "Chain"];

function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function flag(value) {
  return value ? 1 : 0;
}

export function particleBuffers(particleSystem, affectScale) {
  return {
    count: particleSystem.numParticles,
    x: particleSystem.x || null,
    y: particleSystem.y || null,
    particles: particleSystem.particles,
    vx: particleSystem.velocitiesX,
    vy: particleSystem.velocitiesY,
    radius: particleSystem.particleRadii,
    renderScale: particleSystem.renderScale,
    affectScale: !!affectScale,
    baseRadius: particleSystem.particleRadius,
  };
}

export class RustCore {
  constructor() {
    this.ready = false;
    this.core = null;
    this.memory = null;
    this.capacity = CAPACITY;
    this.count = 0;
    this.params = new Float32Array(PARAM.COUNT);
    this.interleaved = new Float32Array(CAPACITY * 2);
    this.x = null;
    this.y = null;
    this.vx = null;
    this.vy = null;
    this.radius = null;
    this._gridValues = null;
    this._field = null;
  }

  async init() {
    const mod = await import("../../simcore/pkg/sim_core.js");
    await mod.default();
    this.core = new mod.SimCore(CAPACITY);
    this.memory = mod.wasmMemory();
    this.refreshViews();
    this.ready = true;
    console.info("[sim-core] wasm tick ready");
  }

  refreshViews() {
    const buffer = this.memory.buffer;
    const n = this.capacity;
    this.x = new Float32Array(buffer, this.core.x_ptr(), n);
    this.y = new Float32Array(buffer, this.core.y_ptr(), n);
    this.vx = new Float32Array(buffer, this.core.vx_ptr(), n);
    this.vy = new Float32Array(buffer, this.core.vy_ptr(), n);
    this.radius = new Float32Array(buffer, this.core.radius_ptr(), n);
  }

  wasmBuffer() {
    return this.memory ? this.memory.buffer : null;
  }

  prepare(particleSystem) {
    const source = particleSystem.velocitiesX;
    const onWasm = source && source.buffer === this.wasmBuffer();
    this.refreshViews();
    if (!onWasm) {
      this.copyFromJs(particleSystem);
    }
    const count = Math.min(particleSystem.numParticles, this.capacity);
    if (particleSystem.numParticles > this.capacity) {
      console.warn(`[sim-core] particle count ${particleSystem.numParticles} exceeds capacity ${this.capacity}`);
    }
    this.core.set_count(count);
    this.count = count;
    this.attach(particleSystem);
  }

  copyFromJs(particleSystem) {
    const n = Math.min(particleSystem.numParticles, this.capacity);
    const particles = particleSystem.particles;
    for (let i = 0; i < n; i++) {
      this.x[i] = particles[i * 2];
      this.y[i] = particles[i * 2 + 1];
      this.vx[i] = particleSystem.velocitiesX[i];
      this.vy[i] = particleSystem.velocitiesY[i];
      this.radius[i] = particleSystem.particleRadii[i];
    }
  }

  attach(particleSystem) {
    particleSystem.x = this.x;
    particleSystem.y = this.y;
    particleSystem.velocitiesX = this.vx;
    particleSystem.velocitiesY = this.vy;
    particleSystem.particleRadii = this.radius;
    particleSystem.particles = this.interleaved;
  }

  detach(particleSystem) {
    const source = particleSystem.velocitiesX;
    if (!source || source.buffer !== this.wasmBuffer()) return;
    const n = particleSystem.numParticles;
    const particles = new Float32Array(n * 2);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const radii = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      particles[i * 2] = this.x[i];
      particles[i * 2 + 1] = this.y[i];
      vx[i] = this.vx[i];
      vy[i] = this.vy[i];
      radii[i] = this.radius[i];
    }
    particleSystem.particles = particles;
    particleSystem.velocitiesX = vx;
    particleSystem.velocitiesY = vy;
    particleSystem.particleRadii = radii;
    particleSystem.x = null;
    particleSystem.y = null;
  }

  sync(main) {
    const ps = main.ps;
    const sim = main.simParams;
    const turb = sim.turbulence || {};
    const field = main.turbulenceField;
    const vor = sim.voronoi || {};
    const vorField = main.voronoiField;
    const org = sim.organic || {};
    const col = sim.collision || {};
    const boundaryParams = sim.boundary || {};
    const physics = main.boundaryManager?.getPhysicsBoundary();
    const gravity = ps.gravity;
    const p = this.params;
    const behaviorName = ps.organicBehavior?.currentBehavior || org.behavior || "None";
    const behaviorIndex = Math.max(0, BEHAVIORS.indexOf(behaviorName));
    const liveOrganic = ps.organicBehavior?.params?.[behaviorName] || {};
    const scales = ps.organicBehavior?.forceScales || {};
    const patternName = String(turb.patternStyle || "checkerboard").toLowerCase();
    const patternIndex = Math.max(0, PATTERNS.indexOf(patternName));
    const gravityOn = !!(gravity && gravity.enabled && gravity.strength >= 1e-6);
    const shape = physics && typeof physics.getBoundaryType === "function"
      ? physics.getBoundaryType()
      : "CIRCULAR";

    p[PARAM.GRAVITY_X] = gravityOn ? num(gravity.directionX, 0) : 0;
    p[PARAM.GRAVITY_Y] = gravityOn ? num(gravity.directionY, 0) : 0;
    p[PARAM.GRAVITY_ENABLED] = flag(gravityOn);
    p[PARAM.VELOCITY_DAMPING] = num(sim.simulation.velocityDamping, ps.velocityDamping);
    p[PARAM.EXTERNAL_DAMPING] = num(boundaryParams.damping, 0.8);
    p[PARAM.MAX_VELOCITY] = num(sim.simulation.maxVelocity, ps.maxVelocity);
    p[PARAM.VELOCITY_THRESHOLD] = num(ps.velocityThreshold, 0.001);
    p[PARAM.POSITION_THRESHOLD] = num(ps.positionThreshold, 0.0001);
    p[PARAM.PARTICLE_RADIUS] = num(sim.simulation.particleRadius, ps.particleRadius);
    p[PARAM.REST_DENSITY] = num(sim.simulation.restDensity, ps.restDensity);
    p[PARAM.TIME] = num(field?.time, 0);
    p[PARAM.ROTATION] = num(field?.rotation, 0);
    p[PARAM.BIAS_X] = num(field?._currentBiasOffsetX, 0);
    p[PARAM.BIAS_Y] = num(field?._currentBiasOffsetY, 0);
    p[PARAM.BIAS_VX] = num(field?._biasVelocityX, 0);
    p[PARAM.BIAS_VY] = num(field?._biasVelocityY, 0);

    p[PARAM.COLLISION_ENABLED] = flag(col.enabled !== false);
    p[PARAM.COLLISION_GRID] = num(col.gridSizeCollision, 10);
    p[PARAM.COLLISION_REPULSION] = num(col.repulsion, 0.5);
    p[PARAM.COLLISION_RESTITUTION] = num(col.particleRestitution, 0.8);
    ps.collisionGridSize = Math.max(1, Math.round(p[PARAM.COLLISION_GRID]));

    p[PARAM.BOUNDARY_SHAPE] = shape === "RECTANGULAR" ? 1 : 0;
    p[PARAM.BOUNDARY_MODE] = boundaryParams.mode === "WARP" ? 1 : 0;
    p[PARAM.BOUNDARY_CX] = num(physics?.centerX, 0.5);
    p[PARAM.BOUNDARY_CY] = num(physics?.centerY, 0.5);
    p[PARAM.BOUNDARY_RADIUS] = num(physics?.getRadius?.() ?? physics?.radius, 0.5);
    p[PARAM.BOUNDARY_WIDTH] = num(physics?.width, 0.8);
    p[PARAM.BOUNDARY_HEIGHT] = num(physics?.height, 0.8);
    p[PARAM.BOUNDARY_RESTITUTION] = num(boundaryParams.restitution, 1);
    p[PARAM.BOUNDARY_DAMPING] = num(boundaryParams.damping, 0.8);
    p[PARAM.BOUNDARY_REPULSION] = num(boundaryParams.repulsion, 0);
    p[PARAM.RECT_MIN_X] = num(physics?.minX, p[PARAM.BOUNDARY_CX] - p[PARAM.BOUNDARY_WIDTH] * 0.5);
    p[PARAM.RECT_MIN_Y] = num(physics?.minY, p[PARAM.BOUNDARY_CY] - p[PARAM.BOUNDARY_HEIGHT] * 0.5);
    p[PARAM.RECT_MAX_X] = num(physics?.maxX, p[PARAM.BOUNDARY_CX] + p[PARAM.BOUNDARY_WIDTH] * 0.5);
    p[PARAM.RECT_MAX_Y] = num(physics?.maxY, p[PARAM.BOUNDARY_CY] + p[PARAM.BOUNDARY_HEIGHT] * 0.5);

    p[PARAM.TURB_STRENGTH] = num(field?.strength, turb.strength ?? 0);
    p[PARAM.TURB_SCALE] = num(turb.scale, 3);
    p[PARAM.TURB_SPEED] = num(turb.speed, 1);
    p[PARAM.TURB_ROT_SPEED] = num(turb.rotationSpeed, 0);
    p[PARAM.TURB_PULL] = num(turb.pullFactor, 1);
    p[PARAM.TURB_DECAY] = num(turb.decayRate, 1);
    p[PARAM.TURB_FREQ] = num(turb.patternFrequency, 2);
    p[PARAM.TURB_PATTERN] = patternIndex;
    p[PARAM.TURB_CONTRAST] = num(turb.contrast, 0.5);
    p[PARAM.TURB_SEPARATION] = num(turb.separation, 0);
    p[PARAM.TURB_WARP] = num(turb.domainWarp, 0);
    p[PARAM.TURB_WARP_SPEED] = num(turb.domainWarpSpeed, 0);
    p[PARAM.TURB_SYMMETRY] = num(turb.symmetryAmount, 0);
    p[PARAM.TURB_PHASE] = num(turb.phase, 0);
    p[PARAM.TURB_PHASE_SPEED] = num(turb.phaseSpeed, -1);
    p[PARAM.TURB_AMPLITUDE] = num(field?.amplitude, 1);
    p[PARAM.TURB_AMPLITUDE_SPEED] = num(field?.amplitudeSpeed, 0);
    p[PARAM.TURB_BLUR] = num(turb.blurAmount, 0);
    p[PARAM.TURB_MIN_SCALE] = num(turb.minScale, 0.008);
    p[PARAM.TURB_MAX_SCALE] = num(turb.maxScale, 0.03);
    p[PARAM.TURB_BIAS_STRENGTH] = num(turb.biasStrength, field?.biasStrength ?? 0.3);
    p[PARAM.TURB_BIAS_FRICTION] = num(field?.biasFriction, 0.05);
    p[PARAM.TURB_BIAS_SENSITIVITY] = num(field?.biasSensitivity, 0.5);
    p[PARAM.TURB_BIAS_ACCEL_X] = num(field?._biasAccelX, 0);
    p[PARAM.TURB_BIAS_ACCEL_Y] = num(field?._biasAccelY, 0);
    p[PARAM.TURB_OFFSET_X] = num(field?.patternOffsetX, 0);
    p[PARAM.TURB_OFFSET_Y] = num(field?.patternOffsetY, 0);
    p[PARAM.TURB_DIR_X] = num(field?.directionBias?.[0], turb.directionBiasX ?? 0);
    p[PARAM.TURB_DIR_Y] = num(field?.directionBias?.[1], turb.directionBiasY ?? 0);
    p[PARAM.TURB_AFFECT_POSITION] = flag(turb.affectPosition);
    p[PARAM.TURB_AFFECT_SCALE] = flag(turb.affectScale);
    p[PARAM.TURB_SCALE_FIELD] = flag(turb.scaleField);
    p[PARAM.TURB_AMPLITUDE_ENABLED] = flag(field?.amplitudeEnabled);
    p[PARAM.TURB_CONTRAST_SHADOW] = num(field?.contrastShadowPoint, 0.1);
    p[PARAM.TURB_CONTRAST_MID] = num(field?.contrastMidPoint, 0.35);
    p[PARAM.TURB_CONTRAST_HIGH] = num(field?.contrastHighlightPoint, 0.7);
    p[PARAM.TURB_CONTRAST_DARK] = num(field?.contrastDarkBoost, 1.5);
    p[PARAM.TURB_CENTER_X] = num(physics?.centerX, 0.5);
    p[PARAM.TURB_CENTER_Y] = num(physics?.centerY, 0.5);

    p[PARAM.VORONOI_STRENGTH] = num(vor.strength, 0);
    p[PARAM.VORONOI_EDGE] = num(vor.edgeWidth, 0.3);
    p[PARAM.VORONOI_ATTRACTION] = num(vor.attractionFactor, 1);
    p[PARAM.VORONOI_CELLS] = num(vor.cellCount, 10);
    p[PARAM.VORONOI_SPEED] = num(vor.cellMovementSpeed, 0.2);
    p[PARAM.VORONOI_DECAY] = num(vor.decayRate, 0.99);
    p[PARAM.VORONOI_BLEND] = num(vor.velocityBlendFactor, 0.7);
    p[PARAM.VORONOI_PULL] = flag(vor.pullMode);
    p[PARAM.VORONOI_SMOOTH] = num(vorField?.forceSmoothingFactor, 0.3);

    p[PARAM.FLIP_RATIO] = num(sim.simulation.picFlipRatio, 0);
    p[PARAM.FLIP_ITERATIONS] = num(ps.flipIterations, 20);
    p[PARAM.FLIP_GRID] = 32;
    p[PARAM.FLIP_GAS] = num(ps.gasConstant, 2);
    p[PARAM.FLIP_OVERRELAX] = 1.5;

    p[PARAM.ORGANIC_BEHAVIOR] = behaviorIndex;
    p[PARAM.ORGANIC_RADIUS] = num(liveOrganic.radius, org.globalRadius ?? 30);
    p[PARAM.ORGANIC_FLUID_SURFACE] = num(org.Fluid?.surfaceTension, 0.5);
    p[PARAM.ORGANIC_FLUID_VISCOSITY] = num(org.Fluid?.viscosity, 0.2);
    p[PARAM.ORGANIC_FLUID_TENSION_SCALE] = num(scales.Fluid?.surfaceTension, 0.5);
    p[PARAM.ORGANIC_FLUID_VISC_SCALE] = num(scales.Fluid?.viscosity, 0.2);
    p[PARAM.ORGANIC_SWARM_COHESION] = num(org.Swarm?.cohesion, 1);
    p[PARAM.ORGANIC_SWARM_ALIGNMENT] = num(org.Swarm?.alignment, 0.7);
    p[PARAM.ORGANIC_SWARM_SEPARATION] = num(org.Swarm?.separation, 1.2);
    p[PARAM.ORGANIC_SWARM_MAX_SPEED] = num(org.Swarm?.maxSpeed, 0.5);
    p[PARAM.ORGANIC_AUTO_REPULSION] = num(org.Automata?.repulsion, 0.8);
    p[PARAM.ORGANIC_AUTO_ATTRACTION] = num(org.Automata?.attraction, 0.5);
    p[PARAM.ORGANIC_AUTO_THRESHOLD] = num(org.Automata?.threshold, 0.2);
    p[PARAM.ORGANIC_AUTO_BASE] = num(scales.Automata?.base, org.globalForce ?? 0.1);
    p[PARAM.ORGANIC_CHAIN_DISTANCE] = num(org.Chain?.linkDistance, 0);
    p[PARAM.ORGANIC_CHAIN_STRENGTH] = num(org.Chain?.linkStrength, 10);
    p[PARAM.ORGANIC_CHAIN_ALIGNMENT] = num(org.Chain?.alignment, 0.5);
    p[PARAM.ORGANIC_CHAIN_LINKS] = num(org.Chain?.maxLinks, 4);
    p[PARAM.ORGANIC_CHAIN_BRANCH] = num(org.Chain?.branchProb, 2);
    p[PARAM.ORGANIC_CHAIN_BASE] = num(scales.Chain?.base, 1.5);

    this.core.set_params(p);
    const timeScale = num(sim.simulation.timeScale, ps.timeScale ?? 1);
    if (this.core.set_time_scale) {
      this.core.set_time_scale(timeScale);
    }
    const dims = main.dimensionManager?.getDimensions?.() || main.dimensionManager;
    const rw = Number(dims?.renderWidth);
    const rh = Number(dims?.renderHeight);
    if (this.core.set_render_size && rw > 0 && rh > 0) {
      this.core.set_render_size(rw, rh);
    }
    const gridMode = main.gridGenRenderer?.renderModes?.modeId?.();
    if (typeof gridMode === "number" && this.core.set_grid_mode) {
      this.core.set_grid_mode(gridMode);
    }
  }

  step(dt) {
    this.core.step(dt);
    this.refreshViews();
  }

  writeBack(field) {
    if (!field || !this.core) return;
    field.time = this.core.time();
    field.rotation = this.core.rotation();
    field._currentBiasOffsetX = this.core.bias_offset_x();
    field._currentBiasOffsetY = this.core.bias_offset_y();
    field._biasVelocityX = this.core.bias_velocity_x();
    field._biasVelocityY = this.core.bias_velocity_y();
  }

  setCells(rects) {
    if (!this.ready) return;
    this.core.set_cells(rects);
  }

  gridEval(mode, width, height, particleRadius, renderScale, affectScale, collisionGrid) {
    if (!this.ready) return;
    this.core.grid_eval(
      mode,
      width,
      height,
      particleRadius,
      renderScale,
      !!affectScale,
      collisionGrid >>> 0
    );
  }

  gridValues() {
    if (!this.ready) return null;
    const buffer = this.memory.buffer;
    if (!this._gridValues || this._gridValues.buffer !== buffer) {
      this._gridValues = new Float32Array(buffer, this.core.grid_values_ptr(), CAPACITY);
    }
    return this._gridValues;
  }

  fieldView() {
    if (!this.ready) return null;
    const buffer = this.memory.buffer;
    if (!this._field || this._field.buffer !== buffer) {
      const size = this.core.field_size();
      this._field = new Float32Array(buffer, this.core.field_ptr(), size);
    }
    return this._field;
  }

  fieldSize() {
    return this.ready ? this.core.field_size() : 0;
  }
}
