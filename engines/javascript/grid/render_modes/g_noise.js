/** computeNoise moved unchanged from GridRenderModes. */
export function compute(modes, particleSystem) {
    modes.targetValues.fill(0);

    if (!particleSystem?.turbulence) {
      return modes.targetValues;
    }

    const turbulence = particleSystem.turbulence;
    const noiseTune = 2.2;

    // Calculate noise value for each cell center
    modes.gridMap.forEach((cell) => {
      const centerX = cell.bounds.x + cell.bounds.width / 2;
      const centerY = cell.bounds.y + cell.bounds.height / 2;

      // Convert to normalized coordinates (0-1) using dynamic dimensions
      const nx = centerX / modes.dimensions.renderWidth;
      const ny = 1 - centerY / modes.dimensions.renderHeight;

      // Get noise value at cell center with blur applied
      const noiseValue = turbulence.noise2D(nx, ny, turbulence.time, true);

      modes.targetValues[cell.index] = noiseValue * noiseTune;
    });

    return modes.targetValues;
  }
