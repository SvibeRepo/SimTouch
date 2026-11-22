import { debugManager } from '../../../util/debugManager.js';
import * as proximity from "./g_proximity.js";
import * as proximityB from "./g_proximity_b.js";
import * as density from "./g_density.js";
import * as velocity from "./g_velocity.js";
import * as pressure from "./g_pressure.js";
import * as vorticity from "./g_vorticity.js";
import * as collision from "./g_collision.js";
import * as overlap from "./g_overlap.js";
import * as noise from "./g_noise.js";

export {
  GridField,
  GRID_MODE_IDS,
  FADE_DURATION_MAX,
  FADE_RATE_AT_MAX_DURATION,
  fadeDurationToRate,
  fadeRateToDuration,
  DENSITY_GAIN_MIN,
  DENSITY_GAIN_MAX,
  DENSITY_ENGINE_AT_MIN_GAIN,
  DENSITY_ENGINE_AT_MAX_GAIN,
  densityGainToEngineMax,
  engineMaxToDensityGain,
} from "./g_shared.js";
import {
  GridField,
  GRID_MODE_IDS,
} from "./g_shared.js";

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
        proximity.compute(this, particleSystem);
        break;
      case this.modes.PROXIMITYB:
        proximityB.compute(this, particleSystem);
        break;
      case this.modes.DENSITY:
        density.compute(this, particleSystem);
        break;
      case this.modes.VELOCITY:
        velocity.compute(this, particleSystem);
        break;
      case this.modes.PRESSURE:
        pressure.compute(this, particleSystem);
        break;
      case this.modes.VORTICITY:
        vorticity.compute(this, particleSystem);
        break;
      case this.modes.COLLISION:
        collision.compute(this, particleSystem);
        break;
      case this.modes.OVERLAP:
        overlap.compute(this, particleSystem);
        break;
      case this.modes.NOISE:
        noise.compute(this, particleSystem);
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




}
