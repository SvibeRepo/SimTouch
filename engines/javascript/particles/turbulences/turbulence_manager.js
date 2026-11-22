import { symmetry } from "./pattern_control/symmetry.js";
import { domainWarp } from "./pattern_control/domain_warp.js";
import { contrast } from "./pattern_control/contrast.js";
import { phase } from "./pattern_control/phase.js";
import { blur } from "./pattern_control/blur.js";
import { force } from "./pattern_control/force.js";
import { value as checkerboard } from "./patterns/checkerboard.js";
import { value as waves } from "./patterns/waves.js";
import { value as spiral } from "./patterns/spiral.js";
import { value as gridPattern } from "./patterns/grid.js";
import { value as circles } from "./patterns/circles.js";
import { value as diamonds } from "./patterns/diamonds.js";
import { value as ripples } from "./patterns/ripples.js";
import { value as dots } from "./patterns/dots.js";
import { value as water } from "./patterns/water.js";
import { value as classicDrop } from "./patterns/classic_drop.js";
import { value as cells } from "./patterns/cells.js";
import { value as voronoiPattern } from "./patterns/voronoi.js";
import { value as fractal } from "./patterns/fractal.js";
import { value as vortex } from "./patterns/vortex.js";
import { value as bubbles } from "./patterns/bubbles.js";

const patternFns = {
  checkerboard,
  waves,
  spiral,
  grid: gridPattern,
  circles,
  diamonds,
  ripples,
  dots,
  water,
  classicdrop: classicDrop,
  cells,
  voronoi: voronoiPattern,
  fractal,
  vortex,
  bubbles,
};

import { eventBus } from '../../../util/eventManager.js'; // Added import
import { TickLog } from '../../../util/tickLog.js';
import { debugManager } from '../../../util/debugManager.js';
export class TurbulenceField {
  constructor({
    strength = 4,
    scale = 3.0,
    speed = 1.0,
    rotation = 0.0,
    rotationSpeed = 0.0,
    pullFactor = 1.0, // -1 to +1 range parameter
    boundary = null,
    directionBias = [0, 0],
    decayRate = 0.99,
    timeOffset = Math.random() * 1000,
    noiseSeed = Math.random() * 10000,
    domainWarp = 0,
    domainWarpSpeed = 0,

    patternFrequency = 2.0,
    patternStyle = "Checkerboard",

    phaseEnabled = false,
    amplitudeEnabled = false,
    phaseSpeed = -1,
    amplitudeSpeed = 0.0,
    phase = 0.0,
    amplitude = 1.0,
    symmetryAmount = 0.0,

    patternOffsetX = 0.0,
    patternOffsetY = 0.0,

    contrast = 0.5,
    separation = 0,      // 0 = smooth, 1 = sharp transitions
    contrastShadowPoint = 0.1,     // Where dark enhancement begins (0-0.5)
    contrastMidPoint = 0.35,       // Center of enhancement curve
    contrastHighlightPoint = 0.7,  // Where enhancement tapers off
    contrastDarkBoost = 1.5,       // How much to enhance shadows

    blurAmount = .8,      // 0 = no blur, 1 = max blur

    biasSpeedX = 0.0,
    biasSpeedY = 0.0,
    biasStrength = 0.3,  // Bias strength parameter
    biasFriction = 0.05,   // Friction coefficient for bias movement (0-1)
    biasSmoothing = 0.8,   // 0 = no smoothing, 1 = max smoothing
    biasTune = 1,       // Fine tuning of bias responsiveness
    biasSensitivity = 0.5, // Global sensitivity multiplier (0-1)
  } = {}) {
    if (
      !boundary ||
      typeof boundary.centerX !== "number" ||
      typeof boundary.centerY !== "number" ||
      typeof boundary.getRadius !== "function"
    ) {
      throw new Error(
        "TurbulenceField requires a valid CircularBoundary with centerX, centerY, and getRadius()"
      );
    }
    this.boundary = boundary;
    this.strength = strength;
    this.scale = scale;
    this.speed = speed;
    this.rotation = rotation;
    this.rotationSpeed = rotationSpeed;
    this.pullFactor = pullFactor;
    this.time = 0;
    this.directionBias = directionBias;
    this.decayRate = decayRate;

    this.scaleField = false;
    this.affectPosition = false; // Set to true by default
    this.affectScale = false; // Set to true by default to match the working version
    this.scaleStrength = 1.0;

    this.minScale = 0.008;
    this.maxScale = 0.03;

    this.timeOffset = timeOffset;
    this.noiseSeed = noiseSeed;
    this.domainWarp = domainWarp;
    this.time = 0;

    // Add new geometric pattern controls
    this.patternFrequency = patternFrequency;
    this.patternStyle = patternStyle;

    // Time influence controls
    this.phaseEnabled = phaseEnabled;
    this.amplitudeEnabled = amplitudeEnabled;
    this.phaseSpeed = phaseSpeed;
    this.amplitudeSpeed = amplitudeSpeed;
    this.phase = phase;
    this.amplitude = amplitude;

    // Symmetry control
    this.symmetryAmount = symmetryAmount;

    // Domain warp time control
    this.domainWarpEnabled = false;
    this.domainWarpSpeed = domainWarpSpeed;

    // Pattern-specific default offsets
    this.patternOffsets = {
      // Format: [offsetX, offsetY] for scale=3, freq=2
      // These values are now applied AFTER rotation, scale, etc.
      "checkerboard": [0.5, -0.5],
      "waves": [0, 0],
      "spiral": [0, 0],
      "grid": [0.5, -0.5],
      "circles": [0, 0],
      "diamonds": [0.1, -.12],
      "ripples": [0, 0],
      "dots": [0.5, -0.5],
      "voronoi": [0, 0],
      "cells": [0.5, -0.5],
      "fractal": [0.5, -0.5],
      "vortex": [0, 0],
      "bubbles": [0, 0],
      "water": [0, 0],
      "classicdrop": [0, 0]
    };

    // New pattern offset controls
    this.patternOffsetX = patternOffsetX;
    this.patternOffsetY = patternOffsetY;

    // Apply pattern-specific offset immediately when initializing with a pattern
    this.applyPatternSpecificOffset();

    // Initialize physics model (no need for old biasSpeed properties)
    this.biasStrength = biasStrength;  // Store bias strength

    // New contrast and separation controls
    this.contrast = contrast;
    this.separation = separation;

    // Bandpass contrast parameters
    this.contrastShadowPoint = contrastShadowPoint;
    this.contrastMidPoint = contrastMidPoint;
    this.contrastHighlightPoint = contrastHighlightPoint;
    this.contrastDarkBoost = contrastDarkBoost;

    // Add bias smoothing
    this.biasSmoothing = biasSmoothing;

    // Add new blur parameter
    this.blurAmount = blurAmount;

    // Add sensitivity control
    this.biasSensitivity = biasSensitivity;

    // Add internal bias state tracking for physics model
    this._currentBiasOffsetX = 0;
    this._currentBiasOffsetY = 0;
    this._biasVelocityX = 0;
    this._biasVelocityY = 0;
    this._biasAccelX = biasSpeedX * biasStrength * 0.1; // Initialize with any passed acceleration
    this._biasAccelY = biasSpeedY * biasStrength * 0.1; // but scaled for the physics model
    this.biasFriction = biasFriction;
    this.biasTune = biasTune;

    // Create dummy properties for backwards compatibility but never use them
    this.biasSpeedX = 0;
    this.biasSpeedY = 0;

    // Subscribe to parameter updates
    eventBus.on('simParamsUpdated', this.handleParamsUpdate.bind(this));

    // Subscribe to boundary updates
    eventBus.on('physicsBoundaryRecreated', ({ physicsBoundary }) => {
      if (physicsBoundary) {
        this.boundary = physicsBoundary;
        if (this.db) console.log("TurbulenceField updated boundary reference.");
      } else {
        console.error("TurbulenceField received null boundary on physicsBoundaryRecreated event.");
      }
    });

    this.tick = new TickLog(1000, this.db);
    this.tickCoordinates = new TickLog(1000, this.db);
    this.debugRadiusData = []; // Initialize class member for debug data
  }

  get db() {
    return debugManager.get('turbulence');
  }

  // --- Start Aspect Ratio Correction --- // TODO: REVIEW
  _getCorrectedNoiseCoordinates(nx, ny) {

    if (this.db && this.tickCoordinates.GetTick()) { // Log occasionally
      const boundaryType = this.boundary ? this.boundary.getBoundaryType ? this.boundary.getBoundaryType() : 'NO TYPE METHOD' : 'NO BOUNDARY';
      let detailsInfo = 'N/A';
      if (this.boundary && this.boundary.getBoundaryDetails) {
        try {
          detailsInfo = JSON.stringify(this.boundary.getBoundaryDetails());
        } catch (e) { detailsInfo = 'Error getting details'; }
      }
      console.log(`_getCorrectedNoiseCoordinates: BoundaryType='${boundaryType}', Details=${detailsInfo}`);
    }

    if (!this.boundary || typeof this.boundary.getBoundaryType !== 'function' || !this.boundary.getBoundaryDetails) {
      // console.warn("TurbulenceField: Boundary details unavailable for aspect ratio correction.");
      return { nx, ny }; // Return uncorrected if boundary info missing
    }

    const boundaryType = this.boundary.getBoundaryType();

    // No correction needed for circular boundaries as they are inherently aspect=1 within the normalized space
    if (boundaryType === 'CIRCULAR') {
      return { nx, ny };
    }

    if (boundaryType === 'RECTANGULAR') {
      const details = this.boundary.getBoundaryDetails();

      // Calculate aspect ratio based on the normalized boundary dimensions
      const normalizedWidth = details.maxX - details.minX;
      const normalizedHeight = details.maxY - details.minY;

      if (!normalizedHeight || normalizedHeight === 0 || !normalizedWidth || normalizedWidth === 0) {
        if (this.db) {
          console.warn(`TurbulenceField: Boundary normalized height/width is zero or invalid (${normalizedWidth}x${normalizedHeight}), skipping aspect ratio correction.`);
        }
        // console.warn("TurbulenceField: Boundary normalized height/width is zero, skipping aspect ratio correction.");
        return { nx, ny }; // Avoid division by zero or invalid dimensions
      }

      const aspectRatio = normalizedWidth / normalizedHeight;

      let corrected_nx = nx;
      let corrected_ny = ny;

      // --- START NEW MAPPING LOGIC ---
      // Calculate position relative to boundary origin (0-1 range within boundary)
      const relativeX = (nx - details.minX) / normalizedWidth;
      const relativeY = (ny - details.minY) / normalizedHeight;

      let tx, ty;
      if (aspectRatio >= 1) { // Wider or Square: Compress X, use Y directly
        tx = (relativeX - 0.5) / aspectRatio + 0.5;
        ty = relativeY;
      } else { // Taller: Use X directly, compress Y
        tx = relativeX;
        ty = (relativeY - 0.5) * aspectRatio + 0.5;
      }
      // --- END NEW MAPPING LOGIC ---

      // Return the texture coordinates
      return { nx: tx, ny: ty };
    } else {
      // Unknown boundary type, return uncorrected
      // console.warn(`TurbulenceField: Unknown boundary type '${boundaryType}' for aspect ratio correction.`);
      return { nx, ny };
    }
  }
  // --- End Aspect Ratio Correction ---

  // Add handler for simParams updates
  handleParamsUpdate({ simParams }) {
    if (simParams?.turbulence) {
      const turbulenceParams = simParams.turbulence;

      // Update all relevant properties using nullish coalescing
      this.strength = turbulenceParams.strength ?? this.strength;
      this.scale = turbulenceParams.scale ?? this.scale;
      this.speed = turbulenceParams.speed ?? this.speed;
      this.rotationSpeed = turbulenceParams.rotationSpeed ?? this.rotationSpeed;
      this.rotation = turbulenceParams.rotation ?? this.rotation;
      this.pullFactor = turbulenceParams.pullFactor ?? this.pullFactor;
      this.affectPosition = turbulenceParams.affectPosition ?? this.affectPosition;
      this.scaleField = turbulenceParams.scaleField ?? this.scaleField;
      this.affectScale = turbulenceParams.affectScale ?? this.affectScale;
      this.minScale = turbulenceParams.minScale ?? this.minScale;
      this.maxScale = turbulenceParams.maxScale ?? this.maxScale;
      this.patternStyle = turbulenceParams.patternStyle ?? this.patternStyle;
      this.decayRate = turbulenceParams.decayRate ?? this.decayRate;

      // Handle directionBias array
      if (turbulenceParams.directionBiasX !== undefined) {
        this.directionBias[0] = turbulenceParams.directionBiasX;
      }
      if (turbulenceParams.directionBiasY !== undefined) {
        this.directionBias[1] = turbulenceParams.directionBiasY;
      }

      // Continue updating other params
      this.contrast = turbulenceParams.contrast ?? this.contrast;
      this.biasStrength = turbulenceParams.biasStrength ?? this.biasStrength;
      this.patternFrequency = turbulenceParams.patternFrequency ?? this.patternFrequency;
      this.noiseSeed = turbulenceParams.noiseSeed ?? this.noiseSeed;
      this.separation = turbulenceParams.separation ?? this.separation;
      this.domainWarp = turbulenceParams.domainWarp ?? this.domainWarp;
      this.domainWarpSpeed = turbulenceParams.domainWarpSpeed ?? this.domainWarpSpeed;
      this.symmetryAmount = turbulenceParams.symmetryAmount ?? this.symmetryAmount;
      this.phase = turbulenceParams.phase ?? this.phase;
      this.phaseSpeed = turbulenceParams.phaseSpeed ?? this.phaseSpeed;
      this.blurAmount = turbulenceParams.blurAmount ?? this.blurAmount;

      // Handle bias acceleration mapped from display properties
      if (turbulenceParams._displayBiasAccelX !== undefined) {
        this._biasAccelX = -turbulenceParams._displayBiasAccelX; // Invert back for internal use
      }
      if (turbulenceParams._displayBiasAccelY !== undefined) {
        this._biasAccelY = turbulenceParams._displayBiasAccelY;
      }

      // Check if dependent values need recalculation after updates
      // For now, let's assume no specific update method is needed beyond what happens in `update` or `applyTurbulence`
      // If issues arise, we might need to add calls like `applyPatternSpecificOffset()` here.
    }
    // if(this.db) console.log (`TurbulenceField updated params via event`);
  }

  // Apply pattern-specific offset based on current pattern style
  applyPatternSpecificOffset() {
    // Get the current pattern style in lowercase for lookup
    const patternKey = typeof this.patternStyle === 'string' ? this.patternStyle.toLowerCase() : 'checkerboard';

    // Get pattern-specific offset or default to [0,0]
    const [offsetX, offsetY] = this.patternOffsets[patternKey] || [0, 0];

    // Always apply the pattern-specific offset
    this.patternOffsetX = offsetX;
    this.patternOffsetY = offsetY;
  }

  // Apply pattern offset and time-based bias with physics model
  applyOffset(x, y, time) {
    // This method is now empty as we're handling offsets directly in processCoordinates
    // for better separation of pattern offset and physics-based movement
    return [x, y];
  }

  // Coordinate processing pipeline helper functions

  // Apply symmetry based on amount
  applySymmetry(x, y, centerX, centerY) {
    return symmetry(this, x, y, centerX, centerY);
  }

  // Apply scale to coordinates
  applyScale(x, y, scale, centerX, centerY) {
    // Translate to center, scale, then translate back
    const tx = x - centerX;
    const ty = y - centerY;
    const sx = tx * scale;
    const sy = ty * scale;
    return [sx + centerX, sy + centerY];
  }

  // Apply domain warping to coordinates
  applyDomainWarp(x, y, time, centerX, centerY) {
    return domainWarp(this, x, y, time, centerX, centerY);
  }

  // Apply rotation to coordinates
  applyRotation(x, y, centerX, centerY, rotation) {
    if (Math.abs(rotation) <= 0.0001) return [x, y];

    // Translate to origin
    const tx = x - centerX;
    const ty = y - centerY;

    // Rotate
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const rx = tx * cos - ty * sin;
    const ry = tx * sin + ty * cos;

    // Translate back
    return [rx + centerX, ry + centerY];
  }

  // pullReshape, bandpass contrast, then quantize (T-Quantize / separation).
  applyContrast(value, time) {
    return contrast(this, value, time);
  }

  // Process coordinates through the entire pipeline
  processCoordinates(x, y, time) {
    const centerX = (this.boundary && typeof this.boundary.centerX === 'number') ? this.boundary.centerX : 0.5;
    const centerY = (this.boundary && typeof this.boundary.centerY === 'number') ? this.boundary.centerY : 0.5;

    // Process in correct order: rotate → scale → warp → symmetry → offset
    // Split the offset application into pattern offset and physics-based bias offset
    let [px, py] = [x, y];
    [px, py] = this.applyRotation(px, py, centerX, centerY, this.rotation);
    [px, py] = this.applyScale(px, py, this.scale, centerX, centerY);
    [px, py] = this.applyDomainWarp(px, py, time, centerX, centerY);
    [px, py] = this.applySymmetry(px, py, centerX, centerY);

    // Apply pattern offset separately from physics-based bias
    px = px - this.patternOffsetX;
    py = py + this.patternOffsetY;

    // Apply physics-based bias offset only
    px = px + this._currentBiasOffsetX;
    py = py + this._currentBiasOffsetY;

    return [px, py, centerX, centerY];
  }

  // Calculate pattern value for any pattern type using normalized coordinates
  calculatePattern(patternStyle, x, y, centerX, centerY) {
    const freq = this.patternFrequency;
    const pattern = typeof patternStyle === "string" ? patternStyle.toLowerCase() : "checkerboard";
    const fn = patternFns[pattern] || checkerboard;
    return fn(x, y, centerX, centerY, freq, this);
  }

  applyPhase(noise, time) {
    return phase(this, noise, time);
  }

  // Completely redesigned noise2D function that supports geometric patterns
  noise2D(x, y, time = this.time, applyBlur = false) {
    try {

      // --- Apply aspect ratio correction to input coordinates ---
      const { nx: corrected_x, ny: corrected_y } = this._getCorrectedNoiseCoordinates(x, y);
      // --- End correction ---

      // 1. Process coordinates through the standardized pipeline
      // Use corrected coordinates from now on
      const [processedX, processedY, procCenterX, procCenterY] = this.processCoordinates(corrected_x, corrected_y, time);

      // 2. Calculate base pattern using the processed coordinates
      // Add type checking for patternStyle
      let patternStyleStr = typeof this.patternStyle === 'string' ? this.patternStyle.toLowerCase() : 'checkerboard';
      let noise = this.calculatePattern(patternStyleStr, processedX, processedY, procCenterX, procCenterY);

      noise = this.applyPhase(noise, time);

      // // 4. Apply contrast and separation as post-processing
      // noise = this.applyContrast((noise + 1) * 0.5, time);
      // // Convert back from [0,1] to [-1,1] range
      // noise = noise * 2 - 1;

      // 5. Apply blur if enabled and requested
      if (applyBlur && this.blurAmount > 0) {
        // Only do the expensive blur calculation if the blur amount is > 0
        // Pass the ORIGINAL x, y for blur sampling, but use corrected base value
        noise = this.applyBlur(x, y, noise, time); // Pass original x,y
      }

      return noise;
    } catch (err) {
      console.error("Error in noise2D:", err);
      return 0.5;
    }
  }

  // Apply blur by sampling multiple nearby points
  applyBlur(x, y, centerValue, time) {
    return blur(this, x, y, centerValue, time);
  }

  // Add preview generation methods
  generatePatternPreview(width, height, patternStyle) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Store current pattern style
    const originalStyle = this.patternStyle;
    // Set the requested pattern style
    this.patternStyle = patternStyle;

    // Generate preview
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const ny = y / height;
        // Enable blur in preview generation
        const value = this.noise2D(nx, ny, this.time, true);

        // Map from [-1, 1] to [0, 255] for display
        const mappedValue = (value + 1) * 0.5;
        const colorValue = Math.floor(mappedValue * 255);

        const index = (y * width + x) * 4;
        data[index] = colorValue;     // R
        data[index + 1] = colorValue; // G
        data[index + 2] = colorValue; // B
        data[index + 3] = 255;         // A
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Restore original pattern style
    this.patternStyle = originalStyle;

    return canvas.toDataURL();
  }

  generateAnimatedPreview(width, height, patternStyle, callback) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Store current pattern style and time
    const originalStyle = this.patternStyle;
    const originalTime = this.time;

    // Set the requested pattern style (ensuring it's a string)
    this.patternStyle = typeof patternStyle === 'string' ? patternStyle : 'checkerboard';

    let animationFrame;
    let lastTime = performance.now();

    const animate = () => {
      const currentTime = performance.now();
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;

      // Update time for animation
      this.time += deltaTime;

      // Generate preview
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const nx = x / width;
          const ny = y / height;
          // Enable blur in animated preview
          const value = this.noise2D(nx, ny, this.time, true);

          // Map from [-1, 1] to [0, 255] for display
          const mappedValue = (value + 1) * 0.5;
          const colorValue = Math.floor(mappedValue * 255);

          const index = (y * width + x) * 4;
          data[index] = colorValue;     // R
          data[index + 1] = colorValue; // G
          data[index + 2] = colorValue; // B
          data[index + 3] = 255;         // A
        }
      }

      ctx.putImageData(imageData, 0, 0);
      callback(canvas.toDataURL());
      animationFrame = requestAnimationFrame(animate);
    };

    // Start animation
    animate();

    // Return cleanup function
    return () => {
      cancelAnimationFrame(animationFrame);
      // Restore original values
      this.patternStyle = originalStyle;
      this.time = originalTime;
    };
  }

  applyTurbulence(position, velocity, dt, particleIndex, system) {
    return force(this, position, velocity, dt, particleIndex, system);
  }

  update(dt) {
    // Update time variable with delta time
    this.time += dt * this.speed;

    if (this.strength <= 0) return;

    // Apply rotation
    this.rotation += dt * this.rotationSpeed;
    // Keep rotation in range [0, 2π]
    this.rotation = this.rotation % (Math.PI * 2);

    // Apply bias physics (acceleration, velocity, position)
    if (this.biasStrength > 0) {
      // Use a smaller friction coefficient for smoother deceleration
      // Scale friction by dt for frame-rate independence
      const frictionFactor = Math.pow(1 - this.biasFriction, dt * 60);

      // Apply acceleration to velocity
      // Increase multiplier from 3.0 to 4.0 to compensate for lower input sensitivity
      // while maintaining responsiveness
      this._biasVelocityX += this._biasAccelX * 4.0 * dt * dt * 60;
      this._biasVelocityY += this._biasAccelY * 4.0 * dt * dt * 60;

      // Apply friction using linear interpolation towards zero
      this._biasVelocityX = this._biasVelocityX * frictionFactor * this.biasSensitivity;
      this._biasVelocityY = this._biasVelocityY * frictionFactor * this.biasSensitivity;

      // Apply velocity to position (scaled by dt)
      this._currentBiasOffsetX += this._biasVelocityX * dt * 60;
      this._currentBiasOffsetY += this._biasVelocityY * dt * 60;
    }

    // Shift phase values occasionally for variation
    if (Math.random() < 0.001) {
      this.timeOffset = Math.random() * 1000;
    }
  }

  setParameters({
    strength,
    scale,
    speed,
    rotation,
    rotationSpeed,
    pullFactor,
    directionBias,
    decayRate,
    domainWarp,
    timeOffset,
    patternFrequency,
    patternStyle,
    phaseEnabled,
    amplitudeEnabled,
    phaseSpeed,
    amplitudeSpeed,
    phase,
    amplitude,
    symmetryAmount,
    // Pattern offset parameters
    patternOffsetX,
    patternOffsetY,
    biasSpeedX,
    biasSpeedY,
    biasStrength,
    contrast,
    separation,
    // Bandpass contrast parameters
    contrastShadowPoint,
    contrastMidPoint,
    contrastHighlightPoint,
    contrastDarkBoost,
    // New bias smoothing parameter
    biasSmoothing,
    // New blur parameter
    blurAmount,
    // Physics parameters
    biasFriction,
    biasTune,
  }) {
    if (strength !== undefined) this.strength = strength;
    if (scale !== undefined) this.scale = scale;
    if (speed !== undefined) this.speed = speed;
    if (rotation !== undefined) this.rotation = rotation;
    if (rotationSpeed !== undefined) this.rotationSpeed = rotationSpeed;
    if (pullFactor !== undefined) this.pullFactor = pullFactor;
    if (directionBias !== undefined) this.directionBias = directionBias;
    if (decayRate !== undefined) this.decayRate = decayRate;
    if (domainWarp !== undefined) this.domainWarp = domainWarp;
    if (timeOffset !== undefined) this.timeOffset = timeOffset;
    if (patternFrequency !== undefined) this.patternFrequency = patternFrequency;

    // Handle pattern style change - always apply pattern-specific offsets
    let patternChanged = false;
    if (patternStyle !== undefined && patternStyle !== this.patternStyle) {
      // Convert to string if a numeric value is provided (from modulation)
      if (typeof patternStyle !== 'string') {
        // Get available pattern styles as fallback
        const patternKeys = Object.keys(this.patternOffsets);
        if (patternKeys.length > 0) {
          // Use modulo to wrap the numeric value to a valid pattern
          const index = Math.floor(Math.abs(patternStyle)) % patternKeys.length;
          patternStyle = patternKeys[index];
        } else {
          patternStyle = 'checkerboard'; // Default fallback
        }
      }

      this.patternStyle = patternStyle;
      patternChanged = true;
    }

    // Time influence controls
    if (phaseEnabled !== undefined) this.phaseEnabled = phaseEnabled;
    if (amplitudeEnabled !== undefined) this.amplitudeEnabled = amplitudeEnabled;
    if (phaseSpeed !== undefined) this.phaseSpeed = phaseSpeed;
    if (amplitudeSpeed !== undefined) this.amplitudeSpeed = amplitudeSpeed;
    if (phase !== undefined) this.phase = phase;
    if (amplitude !== undefined) this.amplitude = amplitude;

    // Symmetry control
    if (symmetryAmount !== undefined) this.symmetryAmount = symmetryAmount;

    // Pattern offset controls
    if (patternOffsetX !== undefined) this.patternOffsetX = patternOffsetX;
    if (patternOffsetY !== undefined) this.patternOffsetY = patternOffsetY;

    // If pattern changed, apply pattern-specific offset
    if (patternChanged) {
      this.applyPatternSpecificOffset();
    }

    // Bias speed controls - update to set acceleration only, not position
    if (biasSpeedX !== undefined) {
      // Store as acceleration for physics model only, not as a direct offset speed
      this._biasAccelX = biasSpeedX * (this.biasStrength || 1);

      // IMPORTANT: Remove the old bias speed property that might be causing the issue
      // We don't want this property to interfere with the physics-based model
      this.biasSpeedX = 0;
    }

    if (biasSpeedY !== undefined) {
      // Store as acceleration for physics model only, not as a direct offset speed
      this._biasAccelY = biasSpeedY * (this.biasStrength || 1);

      // IMPORTANT: Remove the old bias speed property that might be causing the issue
      // We don't want this property to interfere with the physics-based model
      this.biasSpeedY = 0;
    }

    if (biasStrength !== undefined) this.biasStrength = biasStrength;

    // Physics parameters
    if (biasFriction !== undefined) this.biasFriction = biasFriction;
    if (biasTune !== undefined) this.biasTune = biasTune;

    // Contrast and separation controls
    if (contrast !== undefined) this.contrast = contrast;
    if (separation !== undefined) this.separation = separation;

    // Bandpass contrast parameters
    if (contrastShadowPoint !== undefined) this.contrastShadowPoint = contrastShadowPoint;
    if (contrastMidPoint !== undefined) this.contrastMidPoint = contrastMidPoint;
    if (contrastHighlightPoint !== undefined) this.contrastHighlightPoint = contrastHighlightPoint;
    if (contrastDarkBoost !== undefined) this.contrastDarkBoost = contrastDarkBoost;

    // New bias smoothing parameter
    if (biasSmoothing !== undefined) this.biasSmoothing = biasSmoothing;

    // New blur parameter
    if (blurAmount !== undefined) this.blurAmount = blurAmount;
  }

  // Debug function to help diagnose rotation issues
  debugRotation() {
    if (this.db) console.log("=== Turbulence Field Debug ===");
    if (this.db) console.log("Boundary center:", this.boundary.centerX, this.boundary.centerY);
    if (this.db) console.log("Current rotation:", this.rotation);

    // Test noise values at fixed points to verify rotation
    const testPoints = [
      { x: 0.3, y: 0.3 },
      { x: 0.7, y: 0.3 },
      { x: 0.7, y: 0.7 },
      { x: 0.3, y: 0.7 },
      { x: 0.5, y: 0.5 }  // Center
    ];

    if (this.db) console.log("Testing noise values:");
    testPoints.forEach(pt => {
      // Original coordinates
      if (this.db) console.log(`Point (${pt.x}, ${pt.y}): ${this.noise2D(pt.x, pt.y)}`);

      // Compute what the rotated coordinates should be
      const centerX = this.boundary.centerX;
      const centerY = this.boundary.centerY;
      const tx = pt.x - centerX;
      const ty = pt.y - centerY;
      const cos = Math.cos(this.rotation);
      const sin = Math.sin(this.rotation);
      const rx = tx * cos - ty * sin + centerX;
      const ry = tx * sin + ty * cos + centerY;

      if (this.db) console.log(`Should rotate to (${rx.toFixed(3)}, ${ry.toFixed(3)})`);
    });

    if (this.db) console.log("=== End Debug ===");
  }

  resetBias() {
    this._currentBiasOffsetX = 0;
    this._currentBiasOffsetY = 0;
    this._biasVelocityX = 0;
    this._biasVelocityY = 0;
    this._biasAccelX = 0;
    this._biasAccelY = 0;

    // Also reset the old bias speed properties to ensure they don't interfere
    this.biasSpeedX = 0;
    this.biasSpeedY = 0;
  }


  setBiasSensitivity(sensitivity) {
    // Clamp sensitivity to valid range
    const value = Math.max(0, Math.min(1, sensitivity || 0.25));
    this.biasSensitivity = value;



    if (this.db) console.log(`Bias sensitivity set to ${(this.biasSensitivity * 100).toFixed(0)}%`);


    return this.biasSensitivity;
  }


  setBiasSpeed(x, y) {
    // Clamp values to -1..1 range
    const clampedX = Math.max(-1, Math.min(1, x || 0));
    const clampedY = Math.max(-1, Math.min(1, y || 0));

    // Scale down the acceleration for smoother response
    // Reduce multiplier from 0.2 to 0.05 for significantly lower sensitivity
    this._biasAccelX = -clampedX * this.biasStrength * this.biasTune;
    this._biasAccelY = clampedY * this.biasStrength * this.biasTune;

    // Also reduce direction bias sensitivity to match the reduced acceleration
    // Reduce from 0.5 to 0.15 for better balance
    this.directionBias[0] = clampedX * 0.15 * this.biasTune;
    this.directionBias[1] = clampedY * 0.15 * this.biasTune;

    // Always keep the old bias speed properties at zero
    // to ensure they don't interfere with the physics model
    this.biasSpeedX = 0;
    this.biasSpeedY = 0;
  }



  // Debug function to analyze pullFactor behavior
  debugPullFactor() {
    if (this.db) console.log("=== Turbulence Pull Factor Analysis ===");
    if (this.db) console.log(`Current pullFactor: ${this.pullFactor.toFixed(3)}`);

    // Sample a test point at the center
    const centerX = this.boundary.centerX;
    const centerY = this.boundary.centerY;

    // Get noise value at center
    const n = this.noise2D(centerX, centerY, this.time, true);

    // Calculate gradient
    const epsilon = 0.01;
    const nx = this.noise2D(centerX + epsilon, centerY, this.time, true);
    const ny = this.noise2D(centerX, centerY + epsilon, this.time, true);
    const gradX = (nx - n) / epsilon;
    const gradY = (ny - n) / epsilon;

    // Get visualization color (0-255)
    const visualColor = Math.floor(((n + 1) * 0.5) * 255);

    if (this.db) console.log(`Noise at center: ${n.toFixed(3)} (display: RGB ${visualColor},${visualColor},${visualColor})`);
    if (this.db) console.log(`Gradient direction: X=${gradX.toFixed(3)}, Y=${gradY.toFixed(3)}`);

    // Show what direction particles would move
    let moveDir;
    if (this.pullFactor > 0) {
      moveDir = "TOWARD white (gradient direction)";
    } else if (this.pullFactor > -0.5) {
      moveDir = "AWAY from white (opposite gradient)";
    } else {
      moveDir = "TOWARD white (gradient direction)";
    }

    if (this.db) console.log(`Particle movement: ${moveDir}`);
    if (this.db) console.log("=== End Analysis ===");
  }
}