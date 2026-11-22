/** calculateOverlap moved unchanged from GridRenderModes. */
export function compute(modes, particleSystem) {
    modes.targetValues.fill(0);
    if (!particleSystem) return modes.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return modes.targetValues;

    // renderScale is now 4000 as per your working setup
    // const renderScale = particleSystem.renderScale; // No longer needed directly

    // Get normalized particle radius from ParticleSystem
    const normalizedRadius = particleSystem.particleRadius; // Assuming this property exists
    // Calculate pixel radius dynamically based on dimensions
    const pixelRadius = normalizedRadius * Math.max(modes.dimensions.renderWidth, modes.dimensions.renderHeight);

    particles.forEach((particle) => {
      // Convert particle position to pixel space using dynamic dimensions
      const px = particle.x * modes.dimensions.renderWidth;
      const py = (1 - particle.y) * modes.dimensions.renderHeight;

      // Use the rendered size (diameter) from getParticles()
      // const renderedDiameter = particle.size; // REMOVED
      // const particleRadius = renderedDiameter / 8; // REMOVED old calculation

      // Find all cells that this particle overlaps with using circle-rectangle overlap
      modes.gridMap.forEach((cell) => {
        const { x, y, width, height } = cell.bounds;
        const cellArea = width * height;

        const overlapArea = modes.calculateCircleRectOverlap(
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

          modes.targetValues[cell.index] += coveragePercentage;
        }
      });
    });

    return modes.targetValues;
  }
