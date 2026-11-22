/** applyTurbulence moved unchanged from TurbulenceField. */
export function force(field, position, velocity, dt, particleIndex, system) {
    const [x, y] = position;
    const [vx, vy] = velocity;

    let newVx = vx * field.decayRate;
    let newVy = vy * field.decayRate;

    // Even if strength is low, still process if we're affecting particle scale
    if (Math.abs(field.strength) < 0.001 && !field.affectScale) {
      return [newVx, newVy];
    }

    try {
      // APPLY DIRECTION BIAS FIRST - this should work in either mode
      // Scale direction bias by strength and apply it consistently
      if ((field.directionBias[0] !== 0 || field.directionBias[1] !== 0) && field.affectPosition) {
        newVx += field.directionBias[0] * field.strength * dt;
        newVy += field.directionBias[1] * field.strength * dt;
      }

      // pullReshape bends the sample inside applyContrast. pullForce steers
      // particles along the gradient from the same T-Pull slider. Classic Drop
      // normalizes every slope into a full shove, including the faint surface,
      // so the shove runs only where a ripple is present.
      const n1 = field.noise2D(x, y, field.time, true);
      const pullForce = field.pullFactor;
      const patternName = typeof field.patternStyle === 'string' ? field.patternStyle.toLowerCase() : 'checkerboard';
      let onRipple = true;
      if (patternName === "classicdrop") {
        const { nx, ny } = field._getCorrectedNoiseCoordinates(x, y);
        const [px, py, cx, cy] = field.processCoordinates(nx, ny, field.time);
        onRipple = field.calculatePattern(patternName, px, py, cx, cy) > 0.08;
      }

      if (field.affectPosition && onRipple) {
        if (pullForce > 0) {
          // PULL MODE: Move toward noise peaks (positive pullForce)
          // Sample additional points to calculate gradient
          const epsilon = 0.01;  // Small sampling distance
          const nx = field.noise2D(x + epsilon, y, field.time, true);
          const ny = field.noise2D(x, y + epsilon, field.time, true);

          // Calculate approximate gradient (direction toward higher values)
          const gradX = (nx - n1) / epsilon;
          const gradY = (ny - n1) / epsilon;

          // Calculate gradient magnitude and normalize
          const gradMag = Math.sqrt(gradX * gradX + gradY * gradY);
          if (gradMag > 0.001) {
            const normalizedGradX = gradX / gradMag;
            const normalizedGradY = gradY / gradMag;

            const pullStrength = pullForce * field.strength;
            newVx += normalizedGradX * pullStrength * dt;
            newVy += normalizedGradY * pullStrength * dt;
          }
        } else if (pullForce < 0) {
          // PUSH MODE: Particles are pushed by the noise field values
          const epsilon = 0.01;  // Small sampling distance
          const nx = field.noise2D(x + epsilon, y, field.time, true);
          const ny = field.noise2D(x, y + epsilon, field.time, true);

          const gradX = (nx - n1) / epsilon;
          const gradY = (ny - n1) / epsilon;

          const gradMag = Math.sqrt(gradX * gradX + gradY * gradY);
          if (gradMag > 0.001) {
            // Mild negative: push away from white. Stronger negative: pull toward white.
            let normalizedGradX, normalizedGradY;

            if (pullForce > -0.5) {
              normalizedGradX = -gradX / gradMag;
              normalizedGradY = -gradY / gradMag;
            } else {
              normalizedGradX = gradX / gradMag;
              normalizedGradY = gradY / gradMag;
            }

            const pushStrength = Math.abs(pullForce) * field.strength;
            newVx += normalizedGradX * pushStrength * dt;
            newVy += normalizedGradY * pushStrength * dt;
          }
        }
        // At pullFactor = 0, no additional forces are applied
      }

      // Apply velocity scaling if enabled - works the same in either mode
      if (field.scaleField) {
        // Use the new noise2D implementation (which uses proper coordinate processing)
        // instead of directly scaling x and y
        const n1 = field.noise2D(x, y, field.time, true);
        const scaleFactorField = 1.0 + (n1 - 0.5) * field.strength * 0.1;
        newVx *= scaleFactorField;
        newVy *= scaleFactorField;
      }

      // Apply particle radius scaling if enabled - works the same in either mode
      if (field.affectScale && system?.particleRadii) {
        // Now uses normalized coordinate processing
        const n1 = field.noise2D(x, y, field.time, true);

        // n1 is a value between 0 and 1 from the noise function
        const particleSize = field.minScale + n1 * (field.maxScale - field.minScale);

        // Ensure the size is within the valid range
        const finalSize = Math.max(field.minScale, Math.min(field.maxScale, particleSize));

        // Set the particle size for this specific particle
        system.particleRadii[particleIndex] = finalSize;
        if (field.tick.GetTick() && field.db) {
          console.log("Particle sizes:", system.particleRadii[0], system.particleRadii[1], system.particleRadii[2], system.particleRadii[3], system.particleRadii[4]);
        }
      }
    } catch (err) {
      console.error("Error in turbulenceField.applyTurbulence:", err);
    }

    return [newVx, newVy];
  }
