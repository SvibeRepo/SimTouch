/** calculateVorticity moved unchanged from GridRenderModes. */
export function compute(modes, particleSystem) {
    modes.targetValues.fill(0);
    if (!particleSystem) return modes.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return modes.targetValues;

    // Track velocity components and weights for each cell
    const cellVxSums = new Float32Array(modes.targetValues.length).fill(0);
    const cellVySums = new Float32Array(modes.targetValues.length).fill(0);
    const cellWeights = new Float32Array(modes.targetValues.length).fill(0);
    const tune = 5.0; // Adjusted tuning factor for better visualization

    // Get normalized particle radius from ParticleSystem
    const normalizedRadius = particleSystem.particleRadius; // Assuming this property exists
    // Calculate pixel radius dynamically based on dimensions
    const pixelRadius = normalizedRadius * Math.max(modes.dimensions.renderWidth, modes.dimensions.renderHeight);

    // First pass: accumulate weighted velocities in each cell
    particles.forEach((particle) => {
      // Use dynamic dimensions
      const px = particle.x * modes.dimensions.renderWidth;
      const py = (1 - particle.y) * modes.dimensions.renderHeight;
      // const particleRadius = particle.size / 8; // REMOVED old calculation

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
    const cellVx = new Float32Array(modes.targetValues.length);
    const cellVy = new Float32Array(modes.targetValues.length);
    for (let i = 0; i < modes.targetValues.length; i++) {
      if (cellWeights[i] > 0) {
        cellVx[i] = cellVxSums[i] / cellWeights[i];
        cellVy[i] = cellVySums[i] / cellWeights[i];
      }
    }

    // Second pass: calculate vorticity using spatial derivatives
    modes.gridMap.forEach((cell) => {
      // Skip cells with no data
      if (cellWeights[cell.index] === 0) return;

      // Find neighboring cells
      const neighbors = modes.gridMap.filter(n => {
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

        modes.targetValues[cell.index] = scaledVorticity * tune;
      }
    });

    return modes.targetValues;
  }
