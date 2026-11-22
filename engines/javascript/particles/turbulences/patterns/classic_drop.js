/** Pattern case "classicdrop". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        // Generate classic water drop effect with expanding ripples
        // Initialize with a calm water surface
        patternValue = 0;

        // Ensure animation continues by using phaseSpeed for timing
        // Create a time factor that always advances regardless of UI state
        const phaseTime = field.time * Math.max(Math.abs(field.phaseSpeed), 1) * field.speed;

        // Use the frequency to control the rate of drops
        // Higher frequency = more drops
        const maxDrops = Math.max(3, Math.floor(freq * 3)); // 3 drops minimum, more with higher freq

        // Create several drops that appear at random times and locations
        for (let i = 0; i < maxDrops; i++) {
          // Use drop-specific seeds for pseudo-random but deterministic behavior
          const dropSeed = 12.9898 * (i + 1) + 4.1414;
          const timeSeed = 78.233 * (i + 1) + 7.7575;
          const sizeSeed = 43758.5453 * (i + 1) + 1.8989;

          // Add time-based randomness to drop positions
          // Creating a chaotic but smooth variation in positions
          const timeVariation = phaseTime * 0.05; // Subtle time influence
          const positionNoise = Math.sin(dropSeed * 13.33 + timeVariation) * 0.3; // ±0.3 variation

          // Calculate drop position using hash function for consistent randomness
          // Now with added time-based variation for less repetitive patterns
          const positionRadius = 1 + positionNoise; // Radius varies between 0.7 and 1.3
          const angleVariation = Math.sin(timeSeed * 0.75 + timeVariation * 0.3) * 0.2; // ±0.2 angle variation

          const dropX = centerX + positionRadius * Math.cos(dropSeed + i * 2.2 + angleVariation);
          const dropY = centerY + positionRadius * Math.sin(timeSeed + i * 4.3 + angleVariation);

          // Calculate time cycle for each drop (when it appears)
          // Each drop has its own cycle offset to avoid all drops appearing at once
          const dropCycleOffset = i * (Math.PI * 2) / maxDrops; // Evenly distribute drop timing
          const dropCycleLength = 8.0 / freq; // Longer cycles with lower frequency

          // Add small random variation to cycle timing for more natural look
          const cycleVariation = Math.sin(sizeSeed * 3.333 + i * 7.1) * 0.1; // ±10% variation in timing
          const adjustedDropCycleOffset = dropCycleOffset * (1 + cycleVariation);

          // Use phaseTime instead of field.time * field.speed to keep animation going
          const dropTimeNorm = (phaseTime + adjustedDropCycleOffset) % dropCycleLength;

          // Drop only appears in the first part of its cycle, then disappears until next cycle
          const dropActiveTime = dropCycleLength * 0.75; // Active for 75% of cycle

          if (dropTimeNorm < dropActiveTime) {
            // Calculate normalized age of the drop (0 to 1)
            const dropAge = dropTimeNorm / dropActiveTime;

            // Calculate distance from drop center
            const dropDist = Math.sqrt(Math.pow(x - dropX, 2) + Math.pow(y - dropY, 2));

            // Calculate expanding ripple radius
            // Starts small and expands outward based on age
            const rippleSpeed = 1.0 + Math.sin(sizeSeed) * 0.4; // Significantly increased speed per drop
            const rippleRadius = dropAge * rippleSpeed;

            // Calculate width of the ripple (thinner as it expands)
            const rippleWidth = 0.12 + 0.18 * (1 - dropAge);

            // Calculate intensity of the ripple (fades as it expands)
            const rippleIntensity = 1.0 - dropAge * 0.8;

            // Create the ripple effect using distance from expanding circle
            const rippleDist = Math.abs(dropDist - rippleRadius);
            const ripple = Math.exp(-rippleDist * rippleDist / (rippleWidth * rippleWidth)) * rippleIntensity;

            // Add this drop's contribution to the overall pattern
            patternValue += ripple;
          }
        }

        // Add some subtle background waves for a water surface effect
        const calmWater = Math.sin(x * freq * 0.2 + y * freq * 0.3 + phaseTime * 0.2) * 0.1;
        patternValue += calmWater;

        // Normalize the pattern value to avoid excessive brightness with multiple drops
        patternValue = Math.min(1.0, patternValue * 0.7);
  return patternValue;
}
