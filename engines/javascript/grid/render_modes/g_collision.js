/** calculateCollision moved unchanged from GridRenderModes. */
export function compute(modes, particleSystem) {
    modes.targetValues.fill(0);
    const particles = particleSystem?.getParticles?.();
    if (!particles?.length) return modes.targetValues;

    // Spatial bins for the viz only — physics bins live in the wasm tick.
    const gridSize = Math.max(
      1,
      Math.min(128, Math.round(particleSystem.collisionGridSize || 10))
    );
    const bins = Array.from({ length: gridSize * gridSize }, () => []);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.x < 0 || p.x >= 1 || p.y < 0 || p.y >= 1) continue;
      const cx = Math.min(gridSize - 1, Math.floor(p.x * gridSize));
      const cy = Math.min(gridSize - 1, Math.floor(p.y * gridSize));
      bins[cy * gridSize + cx].push(i);
    }

    const tune = 50.0;
    const normalizedRadius = particleSystem.particleRadius;
    const pixelRadius =
      normalizedRadius *
      Math.max(modes.dimensions.renderWidth, modes.dimensions.renderHeight);

    const cellCollisions = new Float32Array(modes.targetValues.length);
    const cellWeights = new Float32Array(modes.targetValues.length);

    for (let i = 0; i < bins.length; i++) {
      const collisionCell = bins[i];
      if (collisionCell.length < 2) continue;

      for (let j = 0; j < collisionCell.length; j++) {
        const particle1 = particles[collisionCell[j]];
        for (let k = j + 1; k < collisionCell.length; k++) {
          const particle2 = particles[collisionCell[k]];

          const dvx = particle2.vx - particle1.vx;
          const dvy = particle2.vy - particle1.vy;
          const relativeSpeed = Math.sqrt(dvx * dvx + dvy * dvy);

          const p1x = particle1.x * modes.dimensions.renderWidth;
          const p1y = (1 - particle1.y) * modes.dimensions.renderHeight;
          const p2x = particle2.x * modes.dimensions.renderWidth;
          const p2y = (1 - particle2.y) * modes.dimensions.renderHeight;

          const p1Radius = pixelRadius;
          const p2Radius = pixelRadius;

          const dx = p2x - p1x;
          const dy = p2y - p1y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = p1Radius + p2Radius;

          if (dist < minDist * 2) {
            const overlap = Math.max(0, minDist * 2 - dist);
            const collisionIntensity = (overlap / (minDist * 2)) * relativeSpeed;

            modes.gridMap.forEach((cell) => {
              const { x, y, width, height } = cell.bounds;
              const cellArea = width * height;

              const p1Overlap = modes.calculateCircleRectOverlap(
                p1x,
                p1y,
                p1Radius,
                x,
                y,
                width,
                height
              );

              const p2Overlap = modes.calculateCircleRectOverlap(
                p2x,
                p2y,
                p2Radius,
                x,
                y,
                width,
                height
              );

              if (p1Overlap > 0 || p2Overlap > 0) {
                let weight = ((p1Overlap + p2Overlap) / cellArea) * 100;
                weight = Math.pow(weight / 100, 1.5) * 100;
                weight = Math.min(weight * 0.25, 100);

                cellCollisions[cell.index] += collisionIntensity * weight * tune;
                cellWeights[cell.index] += weight;
              }
            });
          }
        }
      }
    }

    for (let i = 0; i < modes.targetValues.length; i++) {
      if (cellWeights[i] > 0) {
        modes.targetValues[i] = cellCollisions[i] / cellWeights[i];
      }
    }

    return modes.targetValues;
  }
