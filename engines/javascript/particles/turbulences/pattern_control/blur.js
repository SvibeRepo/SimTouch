/** applyBlur moved unchanged from TurbulenceField. */
export function blur(field, x, y, centerValue, time) {
    if (field.blurAmount <= 0) return centerValue;

    // Check if this is the Classic Drop pattern and reduce samples for better performance
    // Add type checking for patternStyle
    const patternStyleStr = typeof field.patternStyle === 'string' ? field.patternStyle.toLowerCase() : 'checkerboard';
    const isClassicDrop = patternStyleStr === "classicdrop";

    // Scale blur amount to a more useful range (0 to 0.05)
    const sampleRadius = 0.05 * field.blurAmount;

    // Use significantly fewer samples for Classic Drop pattern to improve performance
    // For other patterns, use the full 16 samples for quality
    const numSamples = isClassicDrop ? 4 : 16; // Only use 4 samples for Classic Drop vs 16 for others

    // Convert centerValue to 0-1 range for contrast processing
    const centerValueNormalized = (centerValue + 1) * 0.5;
    let sum = field.applyContrast(centerValueNormalized, time); // Start with the processed center value
    let count = 1; // We've already counted the center

    // Take samples in a circle around the center point
    for (let i = 0; i < numSamples; i++) {
      const angle = (i / numSamples) * Math.PI * 2;
      const sampleX = x + Math.cos(angle) * sampleRadius;
      const sampleY = y + Math.sin(angle) * sampleRadius;

      // --- Apply aspect ratio correction to sample coordinates ---
      const { nx: corrected_sampleX, ny: corrected_sampleY } = field._getCorrectedNoiseCoordinates(sampleX, sampleY);
      // --- End correction ---

      // Process the sample through the full pipeline except blur (to avoid recursion)
      const centerX = (field.boundary && typeof field.boundary.centerX === 'number') ? field.boundary.centerX : 0.5;
      const centerY = (field.boundary && typeof field.boundary.centerY === 'number') ? field.boundary.centerY : 0.5;

      // Process coordinates with the same order as processCoordinates
      let px = corrected_sampleX;
      let py = corrected_sampleY;
      [px, py] = field.applyRotation(px, py, centerX, centerY, field.rotation);
      [px, py] = field.applyScale(px, py, field.scale, centerX, centerY);
      [px, py] = field.applyDomainWarp(px, py, time, centerX, centerY);
      [px, py] = field.applySymmetry(px, py, centerX, centerY);

      // Apply pattern offset separately from physics-based bias (match processCoordinates exactly)
      px = px - field.patternOffsetX;
      py = py + field.patternOffsetY;

      // Apply physics-based bias offset only
      px = px + field._currentBiasOffsetX;
      py = py + field._currentBiasOffsetY;

      // Calculate pattern
      let sampleNoise = field.calculatePattern(patternStyleStr, px, py, centerX, centerY);

      sampleNoise = field.applyPhase(sampleNoise, time);

      // Apply contrast to the sample (convert to 0-1 range first)
      sampleNoise = field.applyContrast((sampleNoise + 1) * 0.5, time);

      // Add to our sum
      sum += sampleNoise;
      count++;
    }

    // Return the average and convert back to -1 to 1 range
    return sum / count * 2 - 1;
  }
