import { debugManager } from '../../util/debugManager.js';

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

/** Mode ids match `Object.values(GridField)` and engines/rust/src/grid/grid.rs. */
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

export class GridRenderModes {
  constructor({ gridParams, gridMap, dimensions, rustCore = null, simParams = null }) {
    this.gridParams = gridParams;
    this.gridMap = gridMap;
    this.dimensions = dimensions;
    this.rustCore = rustCore;
    this.simParams = simParams;

    // Create value buffer - Use cellCount instead of target
    const initialCellCount = gridParams?.cellCount || 0;
    this.values = new Float32Array(initialCellCount);
    this.targetValues = new Float32Array(initialCellCount);
    this.currentValues = new Float32Array(initialCellCount).fill(0);

    this.cellRects = null;
    this.cellCount = 0;
    this.cellsDirty = false;

    // Engine rates (higher = faster). Lab UI stores duration; convert at apply edge.
    this.smoothing = {
      rateIn: 0.15,
      rateOut: 0.08,
    };

    // Modes configuration
    this.modes = GridField;
    this.currentMode = this.modes.PROXIMITY; // Start with Density mode

    if (this.db) console.log(
      "GridRenderModes initialized with new params:",
      JSON.stringify(
        {
          cells: gridParams.target,
          dimensions: {
            cols: gridParams.cols,
            rows: gridParams.rows,
          },
          smoothing: this.smoothing,
        },
        null,
        2
      )
    );
  }

  get db() {
    return debugManager.get('gridRenderModes');
  }

  updateGrid({ gridParams, gridMap, dimensions }) {
    this.gridParams = gridParams;
    this.gridMap = gridMap;
    this.dimensions = dimensions;

    // Resize value buffer if needed - Use cellCount instead of target
    const currentCellCount = gridParams?.cellCount || 0;
    if (this.values.length !== currentCellCount) {
      this.values = new Float32Array(currentCellCount);
      this.targetValues = new Float32Array(currentCellCount);
      this.currentValues = new Float32Array(currentCellCount).fill(0);
    }
  }

  /** Pack pixel-space cell rects (x,y,width,height) for wasm set_cells. */
  markCellsDirty(gridMap) {
    const map = gridMap || this.gridMap || [];
    const n = map.length;
    if (!this.cellRects || this.cellRects.length < n * 4) {
      this.cellRects = new Float32Array(Math.max(n, 1) * 4);
    }
    for (let i = 0; i < n; i++) {
      const b = map[i].bounds;
      const o = i * 4;
      this.cellRects[o] = b.x;
      this.cellRects[o + 1] = b.y;
      this.cellRects[o + 2] = b.width;
      this.cellRects[o + 3] = b.height;
    }
    this.cellCount = n;
    this.cellsDirty = true;
  }

  flushCellsIfNeeded() {
    if (!this.cellsDirty || !this.rustCore?.ready || !this.cellRects) return;
    this.rustCore.setCells(this.cellRects.subarray(0, this.cellCount * 4));
    this.cellsDirty = false;
  }

  canUseRustGrid() {
    return this.simParams?.simulation?.engine === "rust" && !!this.rustCore?.ready;
  }

  modeId() {
    const id = GRID_MODE_IDS.indexOf(this.currentMode);
    return id >= 0 ? id : 0;
  }

  getValues(particleSystem) {
    if (this.canUseRustGrid()) {
      this.calculateTargetValuesRust(particleSystem);
    } else {
      this.calculateTargetValues(particleSystem);
    }

    this.smoothValues();
    return this.currentValues;
  }

  calculateTargetValuesRust(particleSystem) {
    this.flushCellsIfNeeded();
    if (!particleSystem || !this.dimensions) {
      this.targetValues.fill(0);
      return this.targetValues;
    }

    const width = this.dimensions.renderWidth;
    const height = this.dimensions.renderHeight;
    const particleRadius = particleSystem.particleRadius ?? 0.01;
    const renderScale = particleSystem.renderScale ?? 4000;
    const affectScale = !!this.simParams?.turbulence?.affectScale;
    const collisionGrid = Math.max(
      1,
      Math.min(128, Math.round(particleSystem.collisionGridSize || this.simParams?.collision?.gridSizeCollision || 10))
    );

    this.rustCore.gridEval(
      this.modeId(),
      width,
      height,
      particleRadius,
      renderScale,
      affectScale,
      collisionGrid
    );

    const src = this.rustCore.gridValues();
    const n = this.targetValues.length;
    if (src && n > 0) {
      this.targetValues.set(src.subarray(0, n));
    } else {
      this.targetValues.fill(0);
    }
    return this.targetValues;
  }

  calculateTargetValues(particleSystem) {
    if (this.db) console.log(`calculateTargetValues: Mode=${this.currentMode}`);
    switch (this.currentMode) {
      case this.modes.PROXIMITY:
        this.calculateProximity(particleSystem);
        break;
      case this.modes.PROXIMITYB:
        this.calculateProximityB(particleSystem);
        break;
      case this.modes.DENSITY:
        this.calculateDensity(particleSystem);
        break;
      case this.modes.VELOCITY:
        this.calculateVelocity(particleSystem);
        break;
      case this.modes.PRESSURE:
        this.calculatePressure(particleSystem);
        break;
      case this.modes.VORTICITY:
        this.calculateVorticity(particleSystem);
        break;
      case this.modes.COLLISION:
        this.calculateCollision(particleSystem);
        break;
      case this.modes.OVERLAP:
        this.calculateOverlap(particleSystem);
        break;
      case this.modes.NOISE:
        this.computeNoise(particleSystem);
        break;
      default:
        console.warn("Unsupported render mode:", this.currentMode);
        this.targetValues.fill(0);
    }
  }

  smoothValues() {
    for (let i = 0; i < this.currentValues.length; i++) {
      const target = this.targetValues[i];
      const current = this.currentValues[i];
      const diff = target - current;

      // Choose smoothing rate based on whether we're increasing or decreasing
      const rate =
        Math.abs(target) > Math.abs(current)
          ? this.smoothing.rateIn
          : this.smoothing.rateOut;

      // Apply smoothing with rate
      this.currentValues[i] += diff * rate;
    }
  }

  calculateProximity(particleSystem) {
    if (this.db) console.log(`calculateProximity: particles.length = ${particles?.length ?? 'N/A'}`);
    this.targetValues.fill(0);
    if (!particleSystem) return this.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return this.targetValues;

    // Constants
    const tune = 0.15;
    // Scale proximity radius based on current dimensions relative to old 240x240 target
    const baseRadius = 20; // Original value for 240x240
    const avgDimension = (this.dimensions.renderWidth + this.dimensions.renderHeight) / 2;
    const radius = baseRadius * (avgDimension / 240);
    const radiusSq = radius * radius;

    // Pre-calculate particle positions and cells
    const particleData = particles.map((p, idx) => {
      // Use dynamic dimensions
      const px = p.x * this.dimensions.renderWidth;
      const py = (1 - p.y) * this.dimensions.renderHeight;

      // Use gridMap to find cell (maintain correct coordinate system)
      const cell = this.gridMap.find((cell) => cell.contains(px, py));

      return {
        x: px,
        y: py,
        idx,
        cellIndex: cell ? cell.index : -1,
      };
    });

    // Group by cells (using correct grid indices)
    const cellMap = new Map();
    particleData.forEach((p) => {
      if (p.cellIndex !== -1) {
        if (!cellMap.has(p.cellIndex)) {
          cellMap.set(p.cellIndex, []);
        }
        cellMap.get(p.cellIndex).push(p);
      }
    });

    // Process cells
    this.gridMap.forEach((cell) => {
      const particlesInCell = cellMap.get(cell.index) || [];
      let totalProximity = 0;

      if (particlesInCell.length > 0) {
        // Find neighboring cells using gridMap (Use dynamic radius)
        const neighbors = this.gridMap.filter(
          (other) =>
            Math.abs(other.bounds.x - cell.bounds.x) <= radius &&
            Math.abs(other.bounds.y - cell.bounds.y) <= radius
        );

        // Calculate proximities
        particlesInCell.forEach((p1) => {
          neighbors.forEach((neighbor) => {
            const neighborParticles = cellMap.get(neighbor.index) || [];
            neighborParticles.forEach((p2) => {
              if (p1.idx === p2.idx) return;

              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const distSq = dx * dx + dy * dy;

              if (distSq < radiusSq) {
                totalProximity += 1 - distSq / radiusSq;
              }
            });
          });
        });

        this.targetValues[cell.index] =
          (totalProximity / particlesInCell.length) * tune;
      }
    });

    return this.targetValues;
  }


  calculateProximityB(particleSystem) {
    this.targetValues.fill(0);
    if (!particleSystem) return this.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return this.targetValues;

    // Constants
    const tune = 1;
    // Scale proximity radius based on current dimensions relative to old 240x240 target
    const baseRadius = 20; // Original value for 240x240
    const avgDimension = (this.dimensions.renderWidth + this.dimensions.renderHeight) / 2;
    const radius = baseRadius * (avgDimension / 240);
    const radiusSq = radius * radius;

    // Get normalized particle radius from ParticleSystem
    const normalizedRadius = particleSystem.particleRadius; // Assuming this property exists
    // Calculate pixel radius dynamically based on dimensions
    const pixelRadius = normalizedRadius * Math.max(this.dimensions.renderWidth, this.dimensions.renderHeight);

    // Pre-calculate particle positions and cells, considering radius
    const particleData = particles.map((p, idx) => {
      // Use dynamic dimensions
      const px = p.x * this.dimensions.renderWidth;
      const py = (1 - p.y) * this.dimensions.renderHeight;

      // Find all cells that this particle overlaps with using circle-rectangle overlap
      const overlappingCells = this.gridMap.filter(cell => {
        const overlap = this.calculateCircleRectOverlap(
          px,
          py,
          pixelRadius, // Use dynamically calculated pixelRadius
          cell.bounds.x,
          cell.bounds.y,
          cell.bounds.width,
          cell.bounds.height
        );
        return overlap > 0;
      });

      return {
        x: px,
        y: py,
        idx,
        radius: pixelRadius, // Store dynamically calculated pixelRadius
        cells: overlappingCells.map(cell => cell.index)
      };
    });

    // Group by cells (using correct grid indices)
    const cellMap = new Map();
    particleData.forEach((p) => {
      p.cells.forEach(cellIndex => {
        if (!cellMap.has(cellIndex)) {
          cellMap.set(cellIndex, []);
        }
        cellMap.get(cellIndex).push(p);
      });
    });

    // Process cells
    this.gridMap.forEach((cell) => {
      const particlesInCell = cellMap.get(cell.index) || [];
      let totalProximity = 0;

      if (particlesInCell.length > 0) {
        // Find neighboring cells using gridMap (Use dynamic radius)
        const neighbors = this.gridMap.filter(
          (other) =>
            Math.abs(other.bounds.x - cell.bounds.x) <= radius &&
            Math.abs(other.bounds.y - cell.bounds.y) <= radius
        );

        // Calculate proximities
        particlesInCell.forEach((p1) => {
          neighbors.forEach((neighbor) => {
            const neighborParticles = cellMap.get(neighbor.index) || [];
            neighborParticles.forEach((p2) => {
              if (p1.idx === p2.idx) return;

              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const distSq = dx * dx + dy * dy;
              const minDist = p1.radius + p2.radius;

              if (distSq < (minDist + radius) * (minDist + radius)) {
                const overlap = Math.max(0, minDist - Math.sqrt(distSq));
                // tuneInPair and tuneAfterAvg are both `tune` (1). Kept separate
                // so a later change cannot land on only one multiply.
                const tuneInPair = tune;
                totalProximity += (overlap / minDist) * tuneInPair;
              }
            });
          });
        });

        const tuneAfterAvg = tune;
        this.targetValues[cell.index] =
          (totalProximity / particlesInCell.length) * tuneAfterAvg;
      }
    });

    return this.targetValues;
  }



  calculateDensity(particleSystem) {
    if (this.db) console.log(`calculateDensity: particles.length = ${particles?.length ?? 'N/A'}`);
    this.targetValues.fill(0);
    if (!particleSystem) return this.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return this.targetValues;

    // renderScale is now 4000 as per your working setup
    const renderScale = particleSystem.renderScale; // 4000

    particles.forEach((particle) => {
      // Convert particle position to pixel space
      const px = particle.x * this.dimensions.renderWidth;
      const py = (1 - particle.y) * this.dimensions.renderHeight;

      // getParticles size = rawRadius * renderScale (not a diameter).
      const renderedSize = particle.size;
      const densityRadius = renderedSize / 8;

      // Find all cells that this particle overlaps with using circle-rectangle overlap
      this.gridMap.forEach((cell) => {
        const { x, y, width, height } = cell.bounds;
        const cellArea = width * height;

        const overlapArea = this.calculateCircleRectOverlap(
          px,
          py,
          densityRadius,
          x,
          y,
          width,
          height
        );

        if (overlapArea > 0) {
          // Same content elements as Rust shaped_coverage / eval_density.
          const coveragePercent = (overlapArea / cellArea) * 100;
          const shapedCoverage = Math.pow(coveragePercent / 100, 1.5) * 100;
          const densityGain = 0.1;
          const densityValue = Math.min(shapedCoverage * densityGain, 100);

          this.targetValues[cell.index] += densityValue;
        }
      });
    });

    return this.targetValues;
  }

  calculateVelocity(particleSystem) {
    this.targetValues.fill(0);
    if (!particleSystem) return this.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return this.targetValues;

    // Track weighted sums and total weights for averaging
    const weightedSums = new Float32Array(this.targetValues.length).fill(0);
    const totalWeights = new Float32Array(this.targetValues.length).fill(0);
    const tune = 5; // Keep the same tuning factor

    // Get normalized particle radius from ParticleSystem
    const normalizedRadius = particleSystem.particleRadius; // Assuming this property exists
    // Calculate pixel radius dynamically based on dimensions
    const pixelRadius = normalizedRadius * Math.max(this.dimensions.renderWidth, this.dimensions.renderHeight);

    particles.forEach((particle) => {
      // Convert particle position to pixel space using dynamic dimensions
      const px = particle.x * this.dimensions.renderWidth;
      const py = (1 - particle.y) * this.dimensions.renderHeight;

      // Use the rendered size (diameter) from getParticles()
      // const renderedDiameter = particle.size; // REMOVED
      // const particleRadius = renderedDiameter / 8; // REMOVED old calculation

      // Calculate particle speed
      const speed = Math.sqrt(
        particle.vx * particle.vx + particle.vy * particle.vy
      );

      // Find all cells that this particle overlaps with using circle-rectangle overlap
      this.gridMap.forEach((cell) => {
        const { x, y, width, height } = cell.bounds;
        const cellArea = width * height;

        const overlapArea = this.calculateCircleRectOverlap(
          px,
          py,
          pixelRadius, // Use dynamically calculated pixelRadius
          x,
          y,
          width,
          height
        );

        if (overlapArea > 0) {
          // Calculate the weight based on overlap percentage
          let weight = (overlapArea / cellArea) * 100;

          // Apply the same smooth scaling we use in other calculations
          weight = Math.pow(weight / 100, 1.5) * 100;

          // Scale the weight to match our visualization range
          weight = Math.min(weight * 0.1, 100);

          // Add weighted contribution to the cell
          weightedSums[cell.index] += speed * weight * tune;
          totalWeights[cell.index] += weight;
        }
      });
    });

    // Calculate weighted averages
    for (let i = 0; i < this.targetValues.length; i++) {
      if (totalWeights[i] > 0) {
        this.targetValues[i] = weightedSums[i] / totalWeights[i];
      }
    }

    return this.targetValues;
  }

  calculatePressure(particleSystem) {
    this.targetValues.fill(0);
    if (!particleSystem) return this.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return this.targetValues;

    // Track total overlap area for each cell
    const cellOverlaps = new Float32Array(this.targetValues.length).fill(0);
    const tune = 0.5; // Increased pressure sensitivity

    // Get normalized particle radius from ParticleSystem
    const normalizedRadius = particleSystem.particleRadius; // Assuming this property exists
    // Calculate pixel radius dynamically based on dimensions
    const pixelRadius = normalizedRadius * Math.max(this.dimensions.renderWidth, this.dimensions.renderHeight);

    particles.forEach((particle) => {
      // Convert particle position to pixel space using dynamic dimensions
      const px = particle.x * this.dimensions.renderWidth;
      const py = (1 - particle.y) * this.dimensions.renderHeight;

      // Use the rendered size (diameter) from getParticles()
      // const renderedDiameter = particle.size; // REMOVED
      // const particleRadius = renderedDiameter / 8; // REMOVED old calculation

      // Find all cells that this particle overlaps with using circle-rectangle overlap
      this.gridMap.forEach((cell) => {
        const { x, y, width, height } = cell.bounds;
        const cellArea = width * height;

        const overlapArea = this.calculateCircleRectOverlap(
          px,
          py,
          pixelRadius, // Use dynamically calculated pixelRadius
          x,
          y,
          width,
          height
        );

        if (overlapArea > 0) {
          // Calculate the percentage of cell covered by this particle
          let coveragePercentage = (overlapArea / cellArea) * 100;

          // Apply a smoother scaling to the coverage percentage
          coveragePercentage = Math.pow(coveragePercentage / 100, 1.5) * 100;

          // Scale the coverage to match our visualization range
          coveragePercentage = Math.min(coveragePercentage * 0.25, 100);

          // Add to cell's total overlap
          cellOverlaps[cell.index] += coveragePercentage;
        }
      });
    });

    // Calculate pressure based on total overlap
    // Pressure increases non-linearly with overlap (squared relationship)
    for (let i = 0; i < this.targetValues.length; i++) {
      if (cellOverlaps[i] > 0) {
        // Use squared relationship for pressure, but with smoother scaling
        // Increased the base multiplier to make pressure more visible
        this.targetValues[i] = Math.pow(cellOverlaps[i] / 100, 2) * tune * 200;
      }
    }

    return this.targetValues;
  }

  calculateVorticity(particleSystem) {
    this.targetValues.fill(0);
    if (!particleSystem) return this.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return this.targetValues;

    // Track velocity components and weights for each cell
    const cellVxSums = new Float32Array(this.targetValues.length).fill(0);
    const cellVySums = new Float32Array(this.targetValues.length).fill(0);
    const cellWeights = new Float32Array(this.targetValues.length).fill(0);
    const tune = 5.0; // Adjusted tuning factor for better visualization

    // Get normalized particle radius from ParticleSystem
    const normalizedRadius = particleSystem.particleRadius; // Assuming this property exists
    // Calculate pixel radius dynamically based on dimensions
    const pixelRadius = normalizedRadius * Math.max(this.dimensions.renderWidth, this.dimensions.renderHeight);

    // First pass: accumulate weighted velocities in each cell
    particles.forEach((particle) => {
      // Use dynamic dimensions
      const px = particle.x * this.dimensions.renderWidth;
      const py = (1 - particle.y) * this.dimensions.renderHeight;
      // const particleRadius = particle.size / 8; // REMOVED old calculation

      this.gridMap.forEach((cell) => {
        const { x, y, width, height } = cell.bounds;
        const cellArea = width * height;

        const overlapArea = this.calculateCircleRectOverlap(
          px,
          py,
          pixelRadius, // Use dynamically calculated pixelRadius
          x,
          y,
          width,
          height
        );

        if (overlapArea > 0) {
          // Calculate weight based on overlap percentage
          let weight = (overlapArea / cellArea) * 100;
          weight = Math.pow(weight / 100, 1.5) * 100;
          weight = Math.min(weight * 0.25, 100);

          // Accumulate weighted velocities
          cellVxSums[cell.index] += particle.vx * weight;
          cellVySums[cell.index] += particle.vy * weight;
          cellWeights[cell.index] += weight;
        }
      });
    });

    // Calculate average velocities for each cell
    const cellVx = new Float32Array(this.targetValues.length);
    const cellVy = new Float32Array(this.targetValues.length);
    for (let i = 0; i < this.targetValues.length; i++) {
      if (cellWeights[i] > 0) {
        cellVx[i] = cellVxSums[i] / cellWeights[i];
        cellVy[i] = cellVySums[i] / cellWeights[i];
      }
    }

    // Second pass: calculate vorticity using spatial derivatives
    this.gridMap.forEach((cell) => {
      // Skip cells with no data
      if (cellWeights[cell.index] === 0) return;

      // Find neighboring cells
      const neighbors = this.gridMap.filter(n => {
        const dx = n.bounds.x - cell.bounds.x;
        const dy = n.bounds.y - cell.bounds.y;
        // Consider only immediate neighbors (including diagonals)
        return Math.abs(dx) <= cell.bounds.width * 1.5 &&
          Math.abs(dy) <= cell.bounds.height * 1.5 &&
          n.index !== cell.index;
      });

      let dvx_dy = 0;
      let dvy_dx = 0;
      let validGradients = 0;

      // Calculate velocity gradients using neighbors
      neighbors.forEach(n => {
        if (cellWeights[n.index] > 0) {
          const dx = n.bounds.x - cell.bounds.x;
          const dy = n.bounds.y - cell.bounds.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (Math.abs(dy) > 0.001) {
            dvx_dy += (cellVx[n.index] - cellVx[cell.index]) / dy;
          }
          if (Math.abs(dx) > 0.001) {
            dvy_dx += (cellVy[n.index] - cellVy[cell.index]) / dx;
          }
          validGradients++;
        }
      });

      // Calculate curl (vorticity) if we have valid gradients
      if (validGradients > 0) {
        dvx_dy /= validGradients;
        dvy_dx /= validGradients;

        // 2D curl = ∂vy/∂x - ∂vx/∂y
        const vorticity = dvy_dx - dvx_dy;

        // Apply non-linear scaling for better visualization
        const scaledVorticity = Math.sign(vorticity) * Math.pow(Math.abs(vorticity), 0.75);

        this.targetValues[cell.index] = scaledVorticity * tune;
      }
    });

    return this.targetValues;
  }

  calculateCollision(particleSystem) {
    this.targetValues.fill(0);
    const particles = particleSystem?.getParticles?.();
    if (!particles?.length) return this.targetValues;

    // Spatial bins for the viz only — physics bins live in the wasm tick.
    const gridSize = Math.max(
      1,
      Math.min(128, Math.round(particleSystem.collisionGridSize || 10))
    );
    const bins = Array.from({ length: gridSize * gridSize }, () => []);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.x < 0 || p.x >= 1 || p.y < 0 || p.y >= 1) continue;
      const cx = Math.min(gridSize - 1, Math.floor(p.x * gridSize));
      const cy = Math.min(gridSize - 1, Math.floor(p.y * gridSize));
      bins[cy * gridSize + cx].push(i);
    }

    const tune = 50.0;
    const normalizedRadius = particleSystem.particleRadius;
    const pixelRadius =
      normalizedRadius *
      Math.max(this.dimensions.renderWidth, this.dimensions.renderHeight);

    const cellCollisions = new Float32Array(this.targetValues.length);
    const cellWeights = new Float32Array(this.targetValues.length);

    for (let i = 0; i < bins.length; i++) {
      const collisionCell = bins[i];
      if (collisionCell.length < 2) continue;

      for (let j = 0; j < collisionCell.length; j++) {
        const particle1 = particles[collisionCell[j]];
        for (let k = j + 1; k < collisionCell.length; k++) {
          const particle2 = particles[collisionCell[k]];

          const dvx = particle2.vx - particle1.vx;
          const dvy = particle2.vy - particle1.vy;
          const relativeSpeed = Math.sqrt(dvx * dvx + dvy * dvy);

          const p1x = particle1.x * this.dimensions.renderWidth;
          const p1y = (1 - particle1.y) * this.dimensions.renderHeight;
          const p2x = particle2.x * this.dimensions.renderWidth;
          const p2y = (1 - particle2.y) * this.dimensions.renderHeight;

          const p1Radius = pixelRadius;
          const p2Radius = pixelRadius;

          const dx = p2x - p1x;
          const dy = p2y - p1y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = p1Radius + p2Radius;

          if (dist < minDist * 2) {
            const overlap = Math.max(0, minDist * 2 - dist);
            const collisionIntensity = (overlap / (minDist * 2)) * relativeSpeed;

            this.gridMap.forEach((cell) => {
              const { x, y, width, height } = cell.bounds;
              const cellArea = width * height;

              const p1Overlap = this.calculateCircleRectOverlap(
                p1x,
                p1y,
                p1Radius,
                x,
                y,
                width,
                height
              );

              const p2Overlap = this.calculateCircleRectOverlap(
                p2x,
                p2y,
                p2Radius,
                x,
                y,
                width,
                height
              );

              if (p1Overlap > 0 || p2Overlap > 0) {
                let weight = ((p1Overlap + p2Overlap) / cellArea) * 100;
                weight = Math.pow(weight / 100, 1.5) * 100;
                weight = Math.min(weight * 0.25, 100);

                cellCollisions[cell.index] += collisionIntensity * weight * tune;
                cellWeights[cell.index] += weight;
              }
            });
          }
        }
      }
    }

    for (let i = 0; i < this.targetValues.length; i++) {
      if (cellWeights[i] > 0) {
        this.targetValues[i] = cellCollisions[i] / cellWeights[i];
      }
    }

    return this.targetValues;
  }

  calculateCircleRectOverlap(
    circleX,
    circleY,
    radius,
    rectX,
    rectY,
    rectWidth,
    rectHeight
  ) {
    // Clamp the circle's center to the rectangle's bounds to find the nearest point
    const closestX = Math.max(rectX, Math.min(circleX, rectX + rectWidth));
    const closestY = Math.max(rectY, Math.min(circleY, rectY + rectHeight));

    // Distance from circle center to closest point
    const dx = circleX - closestX;
    const dy = circleY - closestY;
    const distanceSquared = dx * dx + dy * dy;

    // No overlap if distance exceeds radius
    if (distanceSquared > radius * radius) {
      return 0;
    }

    // Full overlap cases
    const circleArea = Math.PI * radius * radius;
    const rectArea = rectWidth * rectHeight;

    // If circle fully contains rectangle
    if (
      circleX - radius <= rectX &&
      circleX + radius >= rectX + rectWidth &&
      circleY - radius <= rectY &&
      circleY + radius >= rectY + rectHeight
    ) {
      return rectArea; // Entire rectangle is overlapped
    }

    // If rectangle fully contains circle
    if (
      circleX - radius >= rectX &&
      circleX + radius <= rectX + rectWidth &&
      circleY - radius >= rectY &&
      circleY + radius <= rectY + rectHeight
    ) {
      return circleArea; // Entire circle is overlapped
    }

    // Partial overlap: approximate with bounding box and adjust
    const overlapLeft = Math.max(circleX - radius, rectX);
    const overlapRight = Math.min(circleX + radius, rectX + rectWidth);
    const overlapTop = Math.max(circleY - radius, rectY);
    const overlapBottom = Math.min(circleY + radius, rectY + rectHeight);

    if (overlapLeft >= overlapRight || overlapTop >= overlapBottom) {
      return 0; // No overlap
    }

    // Calculate overlap area using the intersection rectangle
    const overlapWidth = overlapRight - overlapLeft;
    const overlapHeight = overlapBottom - overlapTop;
    const overlapArea = overlapWidth * overlapHeight;

    // Adjust the overlap area based on the circle's position
    // If the circle's center is inside the rectangle, we need to subtract
    // the areas of the circle segments that are outside the rectangle
    if (
      circleX >= rectX &&
      circleX <= rectX + rectWidth &&
      circleY >= rectY &&
      circleY <= rectY + rectHeight
    ) {
      // Calculate the areas of the circle segments that are outside
      const leftSegment = this.calculateCircleSegmentArea(
        radius,
        circleX - rectX
      );
      const rightSegment = this.calculateCircleSegmentArea(
        radius,
        rectX + rectWidth - circleX
      );
      const topSegment = this.calculateCircleSegmentArea(
        radius,
        circleY - rectY
      );
      const bottomSegment = this.calculateCircleSegmentArea(
        radius,
        rectY + rectHeight - circleY
      );

      // Subtract the outside segments from the circle area
      return circleArea - (leftSegment + rightSegment + topSegment + bottomSegment);
    }

    // For partial overlaps where center is outside, use a weighted average
    // of the overlap rectangle and the circle area
    const centerDistance = Math.sqrt(distanceSquared);
    const weight = 1 - (centerDistance / radius);
    return overlapArea * (0.785 + 0.215 * weight); // 0.785 ≈ π/4
  }

  // Helper function to calculate the area of a circle segment
  calculateCircleSegmentArea(radius, distance) {
    if (distance >= radius) return 0;
    const theta = 2 * Math.acos(distance / radius);
    return (radius * radius * (theta - Math.sin(theta))) / 2;
  }

  calculateOverlap(particleSystem) {
    this.targetValues.fill(0);
    if (!particleSystem) return this.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return this.targetValues;

    // renderScale is now 4000 as per your working setup
    // const renderScale = particleSystem.renderScale; // No longer needed directly

    // Get normalized particle radius from ParticleSystem
    const normalizedRadius = particleSystem.particleRadius; // Assuming this property exists
    // Calculate pixel radius dynamically based on dimensions
    const pixelRadius = normalizedRadius * Math.max(this.dimensions.renderWidth, this.dimensions.renderHeight);

    particles.forEach((particle) => {
      // Convert particle position to pixel space using dynamic dimensions
      const px = particle.x * this.dimensions.renderWidth;
      const py = (1 - particle.y) * this.dimensions.renderHeight;

      // Use the rendered size (diameter) from getParticles()
      // const renderedDiameter = particle.size; // REMOVED
      // const particleRadius = renderedDiameter / 8; // REMOVED old calculation

      // Find all cells that this particle overlaps with using circle-rectangle overlap
      this.gridMap.forEach((cell) => {
        const { x, y, width, height } = cell.bounds;
        const cellArea = width * height;

        const overlapArea = this.calculateCircleRectOverlap(
          px,
          py,
          pixelRadius, // Use dynamically calculated pixelRadius
          x,
          y,
          width,
          height
        );

        if (overlapArea > 0) {
          const particleArea = Math.PI * pixelRadius * pixelRadius;
          let coveragePercentage;

          // Calculate the actual percentage of cell covered by the particle
          coveragePercentage = (overlapArea / cellArea) * 100;

          // Apply a smoother scaling to the coverage percentage
          // This creates a more gradual transition from 0 to 100%
          coveragePercentage = Math.pow(coveragePercentage / 100, 1.5) * 100;

          // Scale the coverage to match the grid's visualization range
          // The grid normalizes values to [0,1] and then maps to colors
          // We want the overlap to be visible but not saturate too quickly
          coveragePercentage = Math.min(coveragePercentage * 0.1, 100);

          this.targetValues[cell.index] += coveragePercentage;
        }
      });
    });

    return this.targetValues;
  }

  computeNoise(particleSystem) {
    this.targetValues.fill(0);

    if (!particleSystem?.turbulence) {
      return this.targetValues;
    }

    const turbulence = particleSystem.turbulence;
    const noiseTune = 2.2;

    // Calculate noise value for each cell center
    this.gridMap.forEach((cell) => {
      const centerX = cell.bounds.x + cell.bounds.width / 2;
      const centerY = cell.bounds.y + cell.bounds.height / 2;

      // Convert to normalized coordinates (0-1) using dynamic dimensions
      const nx = centerX / this.dimensions.renderWidth;
      const ny = 1 - centerY / this.dimensions.renderHeight;

      // Get noise value at cell center with blur applied
      const noiseValue = turbulence.noise2D(nx, ny, turbulence.time, true);

      this.targetValues[cell.index] = noiseValue * noiseTune;
    });

    return this.targetValues;
  }
}
