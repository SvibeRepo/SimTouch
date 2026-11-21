import { BaseRenderer } from "./baseRenderer.js";
import { eventBus } from '../util/eventManager.js'; // Added import
import { debugManager } from '../util/debugManager.js';
// Helper function (add outside the class or import)
function hexToRgb(hex) {
  if (!hex) return null;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

export class ParticleRenderer extends BaseRenderer {
  showVelocityField = false;
  particleCount = 0; // Initialize particle count
  vertexArray = null;

  constructor(gl, shaderManager) {
    super(gl, shaderManager);
    if (!gl || !shaderManager) {
      throw new Error(
        "ParticleRenderer requires gl, shaderManager."
      );
    }
    this.gl = gl;
    this.shaderManager = shaderManager;
    this.shaderType = "particles";
    this.positionBuffer = gl.createBuffer();
    this.sizeBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.velocityLineBuffer = gl.createBuffer(); // Add buffer for velocity lines
    this.config = {
      size: 10.0,
      color: [1, 1, 1, 0.1],
    };
    this.particleOpacity = 0.1;

    // Subscribe to parameter updates
    eventBus.on('simParamsUpdated', this.handleParamsUpdate.bind(this));
  }

  get db() {
    return debugManager.get('particles');
  }

  // Add handler for simParams updates
  handleParamsUpdate({ simParams }) {
    if (simParams?.particleRenderer) {
      const rendererParams = simParams.particleRenderer;

      this.particleOpacity = rendererParams.opacity ?? this.particleOpacity;

      // Update color based on hex string from simParams
      if (rendererParams.color !== undefined) {
        // Ensure config object exists
        if (!this.config) { this.config = { color: [1, 1, 1, 1] }; }
        const rgb = hexToRgb(rendererParams.color);
        if (rgb) {
          // Update the RGB part of the config color array
          this.config.color[0] = rgb.r / 255;
          this.config.color[1] = rgb.g / 255;
          this.config.color[2] = rgb.b / 255;
          // Note: Alpha is handled by particleOpacity, keep config.color[3] as 1 or default?
          // For consistency, let's set it, draw() will override with particleOpacity
          this.config.color[3] = 1.0;
        } else {
          console.warn(`Invalid hex color received: ${rendererParams.color}`);
        }
      }

      // Update velocity field visibility
      if (rendererParams.showVelocityField !== undefined) {
        this.showVelocityField = rendererParams.showVelocityField;
      }
    }
  }

  ensureScratch(count) {
    if (this.xyScratch && this.xyScratch.length >= count * 2 && this.sizeScratch.length >= count && this.colorScratch.length >= count * 4) {
      return;
    }
    const n = Math.max(count, this.xyScratch ? this.xyScratch.length / 2 : 0);
    this.xyScratch = new Float32Array(n * 2);
    this.sizeScratch = new Float32Array(n);
    this.colorScratch = new Float32Array(n * 4);
    this.lineScratch = new Float32Array(n * 4);
  }

  /**
   * @param {object} view SoA buffers
   * @param {{ levels?: Float32Array|null, gradientValues?: Array|null }} [theme]
   *        When levels + gradient are set (particle class), disks use theme colors.
   */
  draw(view, theme = null) {
    if (!view || typeof view.count !== "number") {
      throw new Error("ParticleRenderer.draw expects SoA buffers { count, x, y, vx, vy, radius }");
    }

    const count = view.count;
    if (count === 0) {
      return;
    }
    this.ensureScratch(count);

    // Unbind any VAO to ensure clean attribute state
    this.gl.bindVertexArray(null);

    const program = this.shaderManager.use(this.shaderType);
    if (!program) {
      throw new Error(`Failed to use shader "${this.shaderType}" for particle rendering`);
    }

    const defaultSize = this.config.size;
    const xy = this.xyScratch;
    const sizes = this.sizeScratch;
    const colors = this.colorScratch;
    const levels = theme?.levels;
    const gradientValues = theme?.gradientValues;
    const useTheme = !!(levels && gradientValues && levels.length >= count);
    // Opacity 0 would blank the only paint path in particle class; treat as opaque.
    const opacity = useTheme
      ? (this.particleOpacity > 0 ? this.particleOpacity : 1)
      : this.particleOpacity;

    for (let i = 0; i < count; i++) {
      const x = view.x ? view.x[i] : view.particles[i * 2];
      const y = view.y ? view.y[i] : view.particles[i * 2 + 1];
      xy[i * 2] = x;
      xy[i * 2 + 1] = y;
      const raw = view.affectScale ? view.radius[i] : view.baseRadius;
      sizes[i] = Math.max(1.0, (raw ?? view.baseRadius ?? 0) * (view.renderScale || 1) || defaultSize);

      const o = i * 4;
      if (useTheme) {
        // Gradients.getValues() entries are { r, g, b }, same as gridGenRenderer.
        const idx = Math.min(255, Math.max(0, Math.floor(levels[i] * 255)));
        const c = gradientValues[idx];
        colors[o] = c ? c.r : 1;
        colors[o + 1] = c ? c.g : 1;
        colors[o + 2] = c ? c.b : 1;
        colors[o + 3] = opacity;
      } else {
        colors[o] = this.config.color[0];
        colors[o + 1] = this.config.color[1];
        colors[o + 2] = this.config.color[2];
        colors[o + 3] = opacity;
      }
    }

    const posLoc = program.attributes.position;
    const sizeLoc = program.attributes.size;
    const colorLoc = program.attributes.particleColor;

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, xy.subarray(0, count * 2), this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(posLoc);
    this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);
    // Clear leftover divisors from gridCell instancing on the same locations.
    this.gl.vertexAttribDivisor(posLoc, 0);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.sizeBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, sizes.subarray(0, count), this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(sizeLoc);
    this.gl.vertexAttribPointer(sizeLoc, 1, this.gl.FLOAT, false, 0, 0);
    this.gl.vertexAttribDivisor(sizeLoc, 0);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, colors.subarray(0, count * 4), this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(colorLoc);
    this.gl.vertexAttribPointer(colorLoc, 4, this.gl.FLOAT, false, 0, 0);
    this.gl.vertexAttribDivisor(colorLoc, 0);

    // Enable blending for transparent particles
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // Draw the particles
    this.gl.drawArrays(this.gl.POINTS, 0, count);

    // Cleanup GL state
    this.gl.disable(this.gl.BLEND);
    this.gl.disableVertexAttribArray(posLoc);
    this.gl.disableVertexAttribArray(sizeLoc);
    this.gl.disableVertexAttribArray(colorLoc);

    // --- START: Velocity Field Rendering ---
    if (this.showVelocityField && count > 0) {
      const lineProgram = this.shaderManager.use('lines');
      if (!lineProgram) {
        console.error("Failed to use 'lines' shader for velocity field rendering");
      } else {
        const scale = 0.1;
        const lines = this.lineScratch;
        for (let i = 0; i < count; i++) {
          const x1 = view.x ? view.x[i] : view.particles[i * 2];
          const y1 = view.y ? view.y[i] : view.particles[i * 2 + 1];
          const o = i * 4;
          lines[o] = x1;
          lines[o + 1] = y1;
          lines[o + 2] = x1 + view.vx[i] * scale;
          lines[o + 3] = y1 + view.vy[i] * scale;
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.velocityLineBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, lines.subarray(0, count * 4), this.gl.DYNAMIC_DRAW);

        this.gl.enableVertexAttribArray(lineProgram.attributes.position);
        this.gl.vertexAttribPointer(
          lineProgram.attributes.position,
          2,
          this.gl.FLOAT,
          false,
          0,
          0
        );

        this.gl.uniform4fv(lineProgram.uniforms.color, [1.0, 1.0, 0.0, 0.7]);
        this.gl.drawArrays(this.gl.LINES, 0, count * 2);
        this.gl.disableVertexAttribArray(lineProgram.attributes.position);
      }
    }
    // --- END: Velocity Field Rendering ---
  }

  dispose() {
    if (this.positionBuffer) {
      this.gl.deleteBuffer(this.positionBuffer);
      this.positionBuffer = null;
    }
    if (this.sizeBuffer) {
      this.gl.deleteBuffer(this.sizeBuffer);
      this.sizeBuffer = null;
    }
    if (this.colorBuffer) {
      this.gl.deleteBuffer(this.colorBuffer);
      this.colorBuffer = null;
    }
    if (this.velocityLineBuffer) {
      this.gl.deleteBuffer(this.velocityLineBuffer);
      this.velocityLineBuffer = null;
    }
  }
}
