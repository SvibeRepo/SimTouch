/** calculateProximity moved unchanged from GridRenderModes. */
export function compute(modes, particleSystem) {
    if (modes.db) console.log(`calculateProximity: particles.length = ${particles?.length ?? 'N/A'}`);
    modes.targetValues.fill(0);
    if (!particleSystem) return modes.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return modes.targetValues;

    // Constants
    const tune = 0.15;
    // Scale proximity radius based on current dimensions relative to old 240x240 target
    const baseRadius = 20; // Original value for 240x240
    const avgDimension = (modes.dimensions.renderWidth + modes.dimensions.renderHeight) / 2;
    const radius = baseRadius * (avgDimension / 240);
    const radiusSq = radius * radius;

    // Pre-calculate particle positions and cells
    const particleData = particles.map((p, idx) => {
      // Use dynamic dimensions
      const px = p.x * modes.dimensions.renderWidth;
      const py = (1 - p.y) * modes.dimensions.renderHeight;

      // Use gridMap to find cell (maintain correct coordinate system)
      const cell = modes.gridMap.find((cell) => cell.contains(px, py));

      return {
        x: px,
        y: py,
        idx,
        cellIndex: cell ? cell.index : -1,
      };
    });

    // Group by cells (using correct grid indices)
    const cellMap = new Map();
    particleData.forEach((p) => {
      if (p.cellIndex !== -1) {
        if (!cellMap.has(p.cellIndex)) {
          cellMap.set(p.cellIndex, []);
        }
        cellMap.get(p.cellIndex).push(p);
      }
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

              if (distSq < radiusSq) {
                totalProximity += 1 - distSq / radiusSq;
              }
            });
          });
        });

        modes.targetValues[cell.index] =
          (totalProximity / particlesInCell.length) * tune;
      }
    });

    return modes.targetValues;
  }
