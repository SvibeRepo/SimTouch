/** Pattern case "fractal". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        // Create a recursive pattern
        let fractalValue = 1;
        let amplitude = 1;
        let frequency = freq;
        for (let i = 0; i < 3; i++) {
          // Scale coordinates properly for each octave
          const scaledX = x * frequency;
          const scaledY = y * frequency;
          fractalValue += amplitude * Math.sin(scaledX) * Math.sin(scaledY);
          amplitude *= 0.5;
          frequency *= 1;
        }
        patternValue = fractalValue;
  return patternValue;
}
