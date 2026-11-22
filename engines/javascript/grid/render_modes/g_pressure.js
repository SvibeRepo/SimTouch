/** calculatePressure moved unchanged from GridRenderModes. */
export function compute(modes, particleSystem) {
    modes.targetValues.fill(0);
    if (!particleSystem) return modes.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return modes.targetValues;

    // Track total overlap area for each cell
    const cellOverlaps = new Float32Array(modes.targetValues.length).fill(0);
    const tune = 0.5; // Increased pressure sensitivity

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
    for (let i = 0; i < modes.targetValues.length; i++) {
      if (cellOverlaps[i] > 0) {
        // Use squared relationship for pressure, but with smoother scaling
        // Increased the base multiplier to make pressure more visible
        modes.targetValues[i] = Math.pow(cellOverlaps[i] / 100, 2) * tune * 200;
      }
    }

    return modes.targetValues;
  }
