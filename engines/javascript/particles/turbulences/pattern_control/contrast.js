/** applyContrast moved unchanged from TurbulenceField. */
export function contrast(field, value, time) {
    // Store original value for debugging
    const originalValue = value;
    // T-Pull steers Classic Drop. Reshape stays off so the slider does not
    // repaint the rings while it moves.
    const pattern = typeof field.patternStyle === 'string' ? field.patternStyle.toLowerCase() : 'checkerboard';
    const pullReshape = pattern === "classicdrop" ? 0 : field.pullFactor;
    const quantize = field.separation;
    const contrastValue = field.contrast;
    // Each pass is identity at zero — skip the whole reshape when all are idle.
    if (pullReshape === 0 && contrastValue <= 0 && quantize <= 0) {
      return Math.max(0, Math.min(1, value));
    }

    // ===== pullReshape (sample bend from T-Pull; not the particle force) =====
    if (pullReshape !== 0) {
      if (pullReshape < 0) {
        // BLACK MODE (negative values)
        // Linear interpolation toward inverted pattern
        // At pullReshape = -1: fully inverted
        // At pullReshape = 0: no effect
        value = value * (1 + pullReshape) + (1 - value) * (-pullReshape);
      } else {
        // WHITE MODE (positive values)
        // Enhance white areas by applying a stronger curve
        // At pullReshape = 1: maximum enhancement
        // At pullReshape = 0: no effect

        // Apply a more aggressive enhancement for white mode
        if (value > 0.5) {
          // For brighter areas, push toward white (1.0)
          value = 0.5 + (value - 0.5) * (1.0 + pullReshape * 3.0);
        } else {
          // For darker areas, push toward black (0.0)
          value = value * (1.0 - pullReshape * 0.5);
        }

        // Ensure values stay in valid range
        value = Math.max(0.0, Math.min(1.0, value));
      }
    }

    // ===== BANDPASS CONTRAST =====
    if (contrastValue > 0) {
      // Apply bandpass contrast - enhance dark to mid-tones while preserving whites

      // Step 1: Boost contrast in dark regions (below midpoint)
      if (value < field.contrastMidPoint) {
        // Calculate how far into the shadow range we are (0-1 range)
        const shadowRange = (value - field.contrastShadowPoint) /
          (field.contrastMidPoint - field.contrastShadowPoint);

        // Apply stronger contrast to darker areas while preserving very dark shadows
        if (shadowRange > 0) {
          // Apply a non-linear curve to the dark range
          const boostedValue = field.contrastShadowPoint +
            shadowRange * (field.contrastMidPoint - field.contrastShadowPoint) *
            Math.pow(shadowRange, 1.0 / (1.0 + field.contrastDarkBoost * contrastValue));

          // Mix with original value based on contrast strength
          value = value * (1 - contrastValue) + boostedValue * contrastValue;
        }
      }
      // Step 2: Gradually reduce contrast effect as we approach highlights
      else if (value < field.contrastHighlightPoint) {
        // Calculate how far into the transition range we are (0-1)
        const transitionRange = (value - field.contrastMidPoint) /
          (field.contrastHighlightPoint - field.contrastMidPoint);

        // Apply less contrast as we approach highlights
        const contrastReduction = Math.pow(transitionRange, 0.5);
        const adjustedContrast = contrastValue * (1 - contrastReduction);

        // Apply a gentler curve to the mid-tone range
        const midCurve = field.contrastMidPoint +
          (value - field.contrastMidPoint) *
          Math.pow(transitionRange, 1.0 - adjustedContrast * 0.5);

        // Mix with original value based on adjusted contrast strength
        value = value * (1 - adjustedContrast) + midCurve * adjustedContrast;
      }
      // Step 3: Leave values above highlight point untouched
      // (no code needed - we simply don't modify values above contrastHighlightPoint)
    }

    // quantize (T-Quantize / separation field): soft ramp → hard step
    if (quantize > 0) {
      const centered = value - 0.5;
      const sepFactor = 1.0 + quantize * 12.0; // 1.0 to 13.0
      value = 1.0 / (1.0 + Math.exp(-centered * sepFactor));
    }

    // // Debug logging - randomly log some values to avoid flooding console
    // if (field.db && Math.random() < 0.0001) {
    //   console.log(`Contrast ${field.contrast.toFixed(2)} applied:`,
    //     originalValue.toFixed(3), "->", value.toFixed(3));
    // }

    return Math.max(0, Math.min(1, value)); // Clamp to [0,1] range to be safe
  }
