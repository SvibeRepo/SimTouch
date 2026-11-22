/** Pattern case "spiral". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        // Calculate angle and radius from center coordinates
        const angle = Math.atan2(y - centerY, x - centerX);
        const radius = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        patternValue = Math.sin(angle * freq + radius * freq * 0.1);
  return patternValue;
}
