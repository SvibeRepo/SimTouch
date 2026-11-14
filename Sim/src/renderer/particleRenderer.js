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
    if (this.xyScratch && this.xyScratch.length >= count * 2 && this.sizeScratch.length >= count) {
      return;
    }
    const n = Math.max(count, this.xyScratch ? this.xyScratch.length / 2 : 0);
    this.xyScratch = new Float32Array(n * 2);
    this.sizeScratch = new Float32Array(n);
    this.lineScratch = new Float32Array(n * 4);
  }

  draw(view) {
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
    for (let i = 0; i < count; i++) {
      const x = view.x ? view.x[i] : view.particles[i * 2];
      const y = view.y ? view.y[i] : view.particles[i * 2 + 1];
      xy[i * 2] = x;
      xy[i * 2 + 1] = y;
      const raw = view.affectScale ? view.radius[i] : view.baseRadius;
      sizes[i] = Math.max(1.0, (raw ?? view.baseRadius ?? 0) * (view.renderScale || 1) || defaultSize);
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, xy.subarray(0, count * 2), this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(program.attributes.position);
    this.gl.vertexAttribPointer(program.attributes.position, 2, this.gl.FLOAT, false, 0, 0);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.sizeBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, sizes.subarray(0, count), this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(program.attributes.size);
    this.gl.vertexAttribPointer(program.attributes.size, 1, this.gl.FLOAT, false, 0, 0);
    // Explicitly set divisor to 0 for non-instanced attribute
    this.gl.vertexAttribDivisor(program.attributes.size, 0);

    // Enable blending for transparent particles
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // Create color with opacity
    const finalColor = [...this.config.color];
    finalColor[3] = this.particleOpacity;

    // // Set particle color uniform with opacity
    this.gl.uniform4fv(program.uniforms.color, finalColor);

    // Draw the particles
    this.gl.drawArrays(this.gl.POINTS, 0, count);

    // Cleanup GL state
    this.gl.disable(this.gl.BLEND);
    this.gl.disableVertexAttribArray(program.attributes.position);
    this.gl.disableVertexAttribArray(program.attributes.size);

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
    // Add cleanup for velocity line buffer
    if (this.velocityLineBuffer) {
      this.gl.deleteBuffer(this.velocityLineBuffer);
      this.velocityLineBuffer = null;
    }
  }
}
