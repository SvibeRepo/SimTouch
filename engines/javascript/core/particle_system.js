import { PicFlip } from "./pic_flip.js";
import { MouseForces } from "../forces/mouse.js";
import { Collision } from "./collision.js";
import { collisionScales } from "../forces/collision_scales.js";
import { OrganicBehavior } from "../behaviors/organic.js";
import { GravityForces } from "../forces/gravity.js";
import { eventBus } from '../../util/eventManager.js';
import { TickLog } from '../../util/tickLog.js';
import { debugManager } from '../../util/debugManager.js';
export class ParticleSystem {
  constructor({
    particleCount = 500,
    timeStep = 1 / 60,
    gravity = 0,
    picFlipRatio = 0,
    turbulence,
    voronoi = null,
    boundaryManager,
  } = {}) {
    // Particle properties
    this.numParticles = particleCount;
    this.timeStep = timeStep;
    this.gravity = new GravityForces(gravity);
    this.particleRadius = 0.01;
    this.renderScale = 2000;

    // Add radius array to track individual particle sizes
    this.particleRadii = new Float32Array(particleCount).fill(
      this.particleRadius
    );

    // Physics parameters
    this.velocityDamping = 1.0;
    this.boundaryDamping = 0.95;
    this.velocityThreshold = 0.001;
    this.positionThreshold = 0.0001;
    this.maxVelocity = 1; // Maximum particle velocity cap

    // Add rest state properties for fluid simulation
    this.restDensity = 2.0;
    this.gasConstant = 2.0;

    // Animation control
    this.timeScale = 1.0;

    // Debug flags
    this.noiseFieldResolution = 20;

    // Initialize TickLog for logging
    this.logTick = new TickLog(1000);

    // Particle arrays
    this.particles = new Float32Array(particleCount * 2);
    this.velocitiesX = new Float32Array(particleCount);
    this.velocitiesY = new Float32Array(particleCount);

    // External forces - these are required
    this.turbulence = turbulence || throwError("Turbulence field is required");
    this.voronoi = voronoi || throwError("Voronoi field is required");

    // FLIP system
    this.picFlipRatio = picFlipRatio;
    this.flipIterations = 20;

    // Create collision system with particle-specific restitution
    this.collisionSystem = new Collision();

    // Store reference to collision system in particle system
    this.collisionSystem.particleSystem = this;

    // Assign the passed boundary manager
    if (!boundaryManager) {
      throw new Error("ParticleSystem requires a boundaryManager instance.");
    }
    this.boundaryManager = boundaryManager;

    // Get initial boundary for PicFlip instantiation
    const initialBoundary = this.boundaryManager.getPhysicsBoundary();
    if (!initialBoundary) {
      throw new Error("ParticleSystem could not get initial boundary from manager.");
    }

    // Then create FLIP system with boundary reference
    this.fluid = new PicFlip({
      gridSizeFlip: 32,
      picFlipRatio: this.picFlipRatio,
      dt: timeStep,
      boundary: initialBoundary,
      restDensity: this.restDensity,
      gasConstant: this.gasConstant,
      particleSystem: this,
    });

    // Initialize mouse forces
    this.mouseForces = new MouseForces({});

    // Initialize organic behavior
    this.organicBehavior = new OrganicBehavior();

    this.metricScaleX = 1;
    this.metricScaleY = 1;

    this.initializeParticles();

    // Subscribe to parameter updates
    eventBus.on('simParamsUpdated', this.handleParamsUpdate.bind(this));
    eventBus.on('gridParamsUpdated', ({ gridParams, dimensions }) => {
      this.applyCollisionMetric(gridParams?.screen?.shape, dimensions?.renderWidth, dimensions?.renderHeight);
    });
  }

  applyCollisionMetric(shape, renderWidth, renderHeight) {
    const { sx, sy } = collisionScales(shape, renderWidth, renderHeight);
    this.metricScaleX = sx;
    this.metricScaleY = sy;
  }

  // Helper function to throw errors
  throwError(message) {
    throw new Error(message);
  }

  initializeParticles() {
    // Get boundary details to determine distribution
    const boundary = this.boundaryManager.getPhysicsBoundary(); // Get from manager
    if (!boundary) { // Add null check
      console.error("ParticleSystem.initializeParticles: Could not get boundary from manager!");
      return;
    }
    const boundaryType = boundary.getBoundaryType();

    // Calculate center point
    const centerX = boundary.centerX;
    const centerY = boundary.centerY;

    if (boundaryType === "CIRCULAR") {
      // Calculate rings based on particle count for circular distribution
      const rings = Math.ceil(Math.sqrt(this.numParticles));
      const particlesPerRing = Math.ceil(this.numParticles / rings);

      // Safe spawn radius (80% of container radius to avoid immediate boundary collision)
      const spawnRadius = boundary.radius * 0.95;

      let particleIndex = 0;

      // Create concentric rings of particles
      for (
        let ring = 0;
        ring < rings && particleIndex < this.numParticles;
        ring++
      ) {
        // Current ring radius
        const ringRadius = (spawnRadius * (ring + 1)) / rings;

        // Particles in this ring (adjusted for outer rings)
        const ringParticles = Math.min(
          Math.floor((particlesPerRing * (ring + 1)) / 2),
          this.numParticles - particleIndex
        );

        // Distribute particles around the ring
        for (
          let i = 0;
          i < ringParticles && particleIndex < this.numParticles;
          i++
        ) {
          const angle = (i / ringParticles) * Math.PI * 2;

          // Calculate position relative to center
          this.particles[particleIndex * 2] =
            centerX + Math.cos(angle) * ringRadius;
          this.particles[particleIndex * 2 + 1] =
            centerY + Math.sin(angle) * ringRadius;

          // Initialize with zero velocity
          this.velocitiesX[particleIndex] = 0;
          this.velocitiesY[particleIndex] = 0;

          particleIndex++;
        }
      }
    } else {
      // Rectangular distribution
      // Get boundary dimensions
      const width = boundary.width * 0.95; // 95% of width to avoid immediate collision
      const height = boundary.height * 0.95; // 95% of height to avoid immediate collision
      const halfWidth = width / 2;
      const halfHeight = height / 2;

      // Calculate grid dimensions based on particle count
      const particlesPerSide = Math.ceil(Math.sqrt(this.numParticles));
      const cellWidth = width / particlesPerSide;
      const cellHeight = height / particlesPerSide;

      let particleIndex = 0;

      // Distribute particles in a grid pattern
      for (let row = 0; row < particlesPerSide && particleIndex < this.numParticles; row++) {
        for (let col = 0; col < particlesPerSide && particleIndex < this.numParticles; col++) {
          // Calculate position within the grid cell (with slight randomization)
          const jitter = 0.2; // Small random offset
          const cellX = (col + 0.5 + (Math.random() - 0.5) * jitter) * cellWidth;
          const cellY = (row + 0.5 + (Math.random() - 0.5) * jitter) * cellHeight;

          // Position relative to center
          this.particles[particleIndex * 2] = centerX - halfWidth + cellX;
          this.particles[particleIndex * 2 + 1] = centerY - halfHeight + cellY;

          // Initialize with zero velocity
          this.velocitiesX[particleIndex] = 0;
          this.velocitiesY[particleIndex] = 0;

          particleIndex++;
        }
      }
    }
  }

  reinitializeParticles(newCount = null) {
    if (newCount !== null) {
      if (this.db) console.log(`Reinitializing particle system with ${newCount} particles`);
      this.numParticles = newCount;

      // Recreate arrays with new size
      this.particles = new Float32Array(newCount * 2);
      this.velocitiesX = new Float32Array(newCount);
      this.velocitiesY = new Float32Array(newCount);
      this.particleRadii = new Float32Array(newCount).fill(this.particleRadius);
    } else {
      // Just reset the particle radii if count hasn't changed
      this.particleRadii = new Float32Array(this.numParticles).fill(
        this.particleRadius
      );
    }

    this.initializeParticles();

    // Regenerate voronoi cells when particle count changes
    this.voronoi.regenerateCells();
  }

  step() {
    // Playback: physics_dt = timeStep * timeScale for the whole spine.
    const dt = this.timeStep * this.timeScale;

    // Deferred interaction debt: mute fields while pointer is active.
    // Real fix is a later touch-vs-fields pass; keep prelude until then.
    this.mouseForces.syncActiveFromState();
    if (this.mouseForces.isActive) {
      this.mouseForces.neutralizeOtherForces(this);
    } else {
      this.mouseForces.restoreOtherForces(this);
    }

    // Flat spine (ledger §1). Call list only — workers own the math.
    this.advance_fields(dt);
    this.apply_gravity(dt);
    this.apply_turbulence(dt);
    this.apply_voronoi(dt);
    this.apply_organic(dt);
    this.apply_touch();
    this.apply_pic_flip(dt);
    this.damp();
    this.rest_and_advect(dt);
    this.clamp_velocity();
    this.resolve_collision();
    this.enforce_boundary();
  }

  advance_fields(dt) {
    this.turbulence.update(dt);
    this.voronoi.update(dt);
  }

  apply_gravity(dt) {
    this.gravity.apply(
      this.velocitiesX,
      this.velocitiesY,
      this.numParticles,
      dt
    );
  }

  apply_turbulence(dt) {
    if (
      !(
        this.turbulence.affectScale ||
        this.turbulence.affectPosition ||
        this.turbulence.scaleField
      )
    ) {
      return;
    }
    for (let i = 0; i < this.numParticles; i++) {
      const pos = [this.particles[i * 2], this.particles[i * 2 + 1]];
      const vel = [this.velocitiesX[i], this.velocitiesY[i]];
      [this.velocitiesX[i], this.velocitiesY[i]] =
        this.turbulence.applyTurbulence(pos, vel, dt, i, this);
    }
  }

  apply_voronoi(dt) {
    if (!(this.voronoi.strength > 0)) {
      return;
    }
    try {
      for (let i = 0; i < this.numParticles; i++) {
        const pos = [this.particles[i * 2], this.particles[i * 2 + 1]];
        const vel = [this.velocitiesX[i], this.velocitiesY[i]];
        [this.velocitiesX[i], this.velocitiesY[i]] =
          this.voronoi.applyTurbulence(pos, vel, dt, i, this);
      }
    } catch (error) {
      console.error("Error applying voronoi field:", error);
      this.voronoi.regenerateCells();
    }
  }

  apply_organic(dt) {
    // One slot: legacy fluid/swarm/automata, then OrganicBehavior (chain etc.).
    this.organicBehaviorActive =
      this.fluidBehavior?.enabled ||
      this.swarmBehavior?.enabled ||
      this.automataBehavior?.enabled;

    if (this.fluidBehavior?.enabled) {
      this.fluidBehavior.apply(
        this.particles,
        this.velocitiesX,
        this.velocitiesY,
        dt
      );
    } else if (this.swarmBehavior?.enabled) {
      this.swarmBehavior.apply(
        this.particles,
        this.velocitiesX,
        this.velocitiesY,
        dt
      );
    } else if (this.automataBehavior?.enabled) {
      this.automataBehavior.apply(
        this.particles,
        this.velocitiesX,
        this.velocitiesY,
        dt
      );
    }

    if (this.organicBehavior.currentBehavior !== "None") {
      this.organicBehavior.updateParticles(this, dt);
    }
  }

  apply_touch() {
    // Once-per-step apply from pointer state (events only update state).
    this.mouseForces.applyInStep(this);
  }

  apply_pic_flip(dt) {
    if (this.picFlipRatio >= 0) {
      this.updateFLIP(dt);
    }
  }

  damp() {
    for (let i = 0; i < this.numParticles; i++) {
      this.velocitiesX[i] *= this.velocityDamping;
      this.velocitiesY[i] *= this.velocityDamping;
    }
  }

  rest_and_advect(dt) {
    for (let i = 0; i < this.numParticles; i++) {
      if (this.checkRestState(i, dt)) continue;
      this.particles[i * 2] += this.velocitiesX[i] * dt;
      this.particles[i * 2 + 1] += this.velocitiesY[i] * dt;
    }
  }

  clamp_velocity() {
    for (let i = 0; i < this.numParticles; i++) {
      this.velocitiesX[i] = Math.max(
        -this.maxVelocity,
        Math.min(this.maxVelocity, this.velocitiesX[i])
      );
      this.velocitiesY[i] = Math.max(
        -this.maxVelocity,
        Math.min(this.maxVelocity, this.velocitiesY[i])
      );
    }
  }

  resolve_collision() {
    const sx = this.metricScaleX ?? 1;
    const sy = this.metricScaleY ?? 1;
    this.collisionSystem.update(
      this.particles,
      this.velocitiesX,
      this.velocitiesY,
      sx,
      sy
    );
  }

  enforce_boundary() {
    const sx = this.metricScaleX ?? 1;
    const sy = this.metricScaleY ?? 1;
    const affectScale = this.turbulence?.affectScale;
    for (let i = 0; i < this.numParticles; i++) {
      const position = [this.particles[i * 2], this.particles[i * 2 + 1]];
      const velocity = [this.velocitiesX[i], this.velocitiesY[i]];
      const physicsRadius = affectScale
        ? this.particleRadii[i]
        : this.particleRadius;

      const currentBoundary = this.boundaryManager.getPhysicsBoundary();
      if (!currentBoundary) {
        console.error(
          `ParticleSystem.enforce_boundary: no boundary for particle ${i}`
        );
        continue;
      }

      currentBoundary.metricScaleX = sx;
      currentBoundary.metricScaleY = sy;
      currentBoundary.resolveCollision(
        position,
        velocity,
        physicsRadius,
        this.boundaryDamping
      );

      this.particles[i * 2] = position[0];
      this.particles[i * 2 + 1] = position[1];
      this.velocitiesX[i] = velocity[0];
      this.velocitiesY[i] = velocity[1];
    }
  }

  checkRestState(index, dt) {
    const vx = this.velocitiesX[index];
    const vy = this.velocitiesY[index];

    const velocityMagnitude = Math.hypot(vx, vy);
    const positionChange = velocityMagnitude * dt;

    if (
      velocityMagnitude < this.velocityThreshold &&
      positionChange < this.positionThreshold
    ) {
      this.velocitiesX[index] = 0;
      this.velocitiesY[index] = 0;
      return true;
    }
    return false;
  }

  updateFLIP(dt) {
    if (this.picFlipRatio >= 0) {
      // The slider writes this.picFlipRatio. 0 is PIC, 1 is FLIP.
      this.fluid.picFlipRatio = this.picFlipRatio;
      this.fluid.dt = dt;
      this.fluid.restDensity = this.restDensity;
      this.fluid.gasConstant = this.gasConstant;
      this.fluid.initializeBoundary();
      this.fluid.setParameters(this.restDensity);

      // Transfer particle velocities to grid
      this.fluid.transferToGrid(
        this.particles,
        this.velocitiesX,
        this.velocitiesY
      );

      // Solve incompressibility
      this.fluid.solveIncompressibility();

      // Transfer back to particles with PIC/FLIP mix
      this.fluid.transferToParticles(
        this.particles,
        this.velocitiesX,
        this.velocitiesY
      );
    }
  }

  // No coordinate conversion needed - already in [0,1] space
  getParticles() {
    // Return flat array of objects with x, y properties
    // This format is what ParticleRenderer expects

    const affectScale = this.turbulence?.affectScale; // Check turbulence scale mode
    const posX = this.x;
    const posY = this.y;

    const particlesData = Array.from({ length: this.numParticles }, (_, i) => {
      // Determine the correct radius based on affectScale
      const rawRadius = affectScale ? this.particleRadii[i] : this.particleRadius;

      const particleData = {
        x: posX ? posX[i] : this.particles[i * 2],
        y: posY ? posY[i] : this.particles[i * 2 + 1],
        vx: this.velocitiesX[i],
        vy: this.velocitiesY[i],
        // renderedSize for density: rawRadius * renderScale (not a diameter).
        size: rawRadius * this.renderScale,
      };
      if (i < 9 && this.logTick.GetTick() && this.db) {
        console.log(`ParticleSystem.getParticles - P[${i}] | Radius(raw): ${this.particleRadii[i].toFixed(6)} | Size(scaled): ${particleData.size.toFixed(3)}`);
      }
      return particleData;
    });
    return particlesData;
  }


  // Add method to change boundary mode
  setBoundaryMode(mode) {
    this.boundary.setBoundaryMode(mode);
  }

  // Add handler for simParams updates
  handleParamsUpdate({ simParams }) {
    if (!simParams) return;

    // Update simulation parameters
    if (simParams.simulation) {
      // --- P-Count Handling ---
      const newCount = simParams.simulation.particleCount;

      if (newCount !== undefined && newCount !== this.numParticles) {
        // Check if count is valid before reinitializing
        if (typeof newCount === 'number' && newCount >= 0) {
          this.reinitializeParticles(newCount);
          // Note: No need to update other sim params here if reinitialize handles them or they are read fresh next cycle.
          // If other params NEED to be applied immediately *after* reinit, place them here.
        } else {
          console.warn(`Invalid particle count received: ${newCount}. Ignoring.`);
        }
      }
      // --- End P-Count ---

      // Apply other simulation parameters (only if count didn't change, or apply after reinit if needed)
      // For simplicity, we'll apply them regardless, reinitializeParticles should reset things correctly anyway.
      this.timeStep = simParams.simulation.timeStep ?? this.timeStep;
      this.timeScale = simParams.simulation.timeScale ?? this.timeScale;
      this.velocityDamping = simParams.simulation.velocityDamping ?? this.velocityDamping;
      this.maxVelocity = simParams.simulation.maxVelocity ?? this.maxVelocity;
      this.picFlipRatio = simParams.simulation.picFlipRatio ?? this.picFlipRatio;
      this.restDensity = simParams.simulation.restDensity ?? this.restDensity;

      // --- P-Size Handling ---
      const oldRadius = this.particleRadius;
      const newRadius = simParams.simulation.particleRadius ?? this.particleRadius;
      if (newRadius !== oldRadius) {
        this.particleRadius = newRadius;
        // Update the radii array for all particles
        if (this.particleRadii && typeof this.particleRadii.fill === 'function') {
          this.particleRadii.fill(this.particleRadius);
          if (this.db) console.log(`Updated particleRadii array with new radius: ${this.particleRadius}`);
        } else {
          console.warn("Could not update particleRadii array.");
        }
      }
      // --- End P-Size ---


      // Update PicFlip if restDensity changed
      if (this.fluid && simParams.collision.restDensity !== undefined) {
        this.fluid.setParameters(this.restDensity);
      }
    }

    // Update gravity parameters
    if (simParams.gravity && this.gravity) {
      this.gravity.setDirection(
        simParams.gravity.directionX ?? this.gravity.directionX,
        simParams.gravity.directionY ?? this.gravity.directionY
      );
    }

    // Note: Boundary parameters (mode, damping, restitution, repulsion) are now handled
    // by BoundaryManager and accessed via this.boundaryManager.getPhysicsBoundary().
    // No need to update a local boundary instance here.

    // Optional: Log for verification
    if (this.db) console.log(`ParticleSystem updated params via event: timeStep=${this.timeStep}, damping=${this.velocityDamping}, ...`);
  }

  get db() {
    return debugManager.get('particles');
  }
}

// Helper function to throw errors
function throwError(message) {
  throw new Error(message);
}

