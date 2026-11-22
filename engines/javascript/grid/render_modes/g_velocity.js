/** calculateVelocity moved unchanged from GridRenderModes. */
export function compute(modes, particleSystem) {
    modes.targetValues.fill(0);
    if (!particleSystem) return modes.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return modes.targetValues;

    // Track weighted sums and total weights for averaging
    const weightedSums = new Float32Array(modes.targetValues.length).fill(0);
    const totalWeights = new Float32Array(modes.targetValues.length).fill(0);
    const tune = 5; // Keep the same tuning factor

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

      // Calculate particle speed
      const speed = Math.sqrt(
        particle.vx * particle.vx + particle.vy * particle.vy
      );

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
    for (let i = 0; i < modes.targetValues.length; i++) {
      if (totalWeights[i] > 0) {
        modes.targetValues[i] = weightedSums[i] / totalWeights[i];
      }
    }

    return modes.targetValues;
  }
