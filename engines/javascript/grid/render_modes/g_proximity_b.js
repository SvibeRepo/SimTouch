/** calculateProximityB moved unchanged from GridRenderModes. */
export function compute(modes, particleSystem) {
    modes.targetValues.fill(0);
    if (!particleSystem) return modes.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return modes.targetValues;

    // Constants
    const tune = 1;
    // Scale proximity radius based on current dimensions relative to old 240x240 target
    const baseRadius = 20; // Original value for 240x240
    const avgDimension = (modes.dimensions.renderWidth + modes.dimensions.renderHeight) / 2;
    const radius = baseRadius * (avgDimension / 240);
    const radiusSq = radius * radius;

    // Get normalized particle radius from ParticleSystem
    const normalizedRadius = particleSystem.particleRadius; // Assuming this property exists
    // Calculate pixel radius dynamically based on dimensions
    const pixelRadius = normalizedRadius * Math.max(modes.dimensions.renderWidth, modes.dimensions.renderHeight);

    // Pre-calculate particle positions and cells, considering radius
    const particleData = particles.map((p, idx) => {
      // Use dynamic dimensions
      const px = p.x * modes.dimensions.renderWidth;
      const py = (1 - p.y) * modes.dimensions.renderHeight;

      // Find all cells that this particle overlaps with using circle-rectangle overlap
      const overlappingCells = modes.gridMap.filter(cell => {
        const overlap = modes.calculateCircleRectOverlap(
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
    modes.gridMap.forEach((cell) => {
      const particlesInCell = cellMap.get(cell.index) || [];
      let totalProximity = 0;

      if (particlesInCell.length > 0) {
        // Find neighboring cells using gridMap (Use dynamic radius)
        const neighbors = modes.gridMap.filter(
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
        modes.targetValues[cell.index] =
          (totalProximity / particlesInCell.length) * tuneAfterAvg;
      }
    });

    return modes.targetValues;
  }
