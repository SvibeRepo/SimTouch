/** calculateDensity moved unchanged from GridRenderModes. */
export function compute(modes, particleSystem) {
    if (modes.db) console.log(`calculateDensity: particles.length = ${particles?.length ?? 'N/A'}`);
    modes.targetValues.fill(0);
    if (!particleSystem) return modes.targetValues;

    const particles = particleSystem.getParticles();
    if (!particles?.length) return modes.targetValues;

    // renderScale is now 4000 as per your working setup
    const renderScale = particleSystem.renderScale; // 4000

    particles.forEach((particle) => {
      // Convert particle position to pixel space
      const px = particle.x * modes.dimensions.renderWidth;
      const py = (1 - particle.y) * modes.dimensions.renderHeight;

      // getParticles size = rawRadius * renderScale (not a diameter).
      const renderedSize = particle.size;
      const densityRadius = renderedSize / 8;

      // Find all cells that this particle overlaps with using circle-rectangle overlap
      modes.gridMap.forEach((cell) => {
        const { x, y, width, height } = cell.bounds;
        const cellArea = width * height;

        const overlapArea = modes.calculateCircleRectOverlap(
          px,
          py,
          densityRadius,
          x,
          y,
          width,
          height
        );

        if (overlapArea > 0) {
          // Same content elements as Rust shaped_coverage / eval_density.
          const coveragePercent = (overlapArea / cellArea) * 100;
          const shapedCoverage = Math.pow(coveragePercent / 100, 1.5) * 100;
          const densityGain = 0.1;
          const densityValue = Math.min(shapedCoverage * densityGain, 100);

          modes.targetValues[cell.index] += densityValue;
        }
      });
    });

    return modes.targetValues;
  }
