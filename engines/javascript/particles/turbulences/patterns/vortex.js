/** Pattern case "vortex". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        // Create a swirling vortex pattern
        const vortexX = (x - centerX);
        const vortexY = (y - centerY);
        const vortexAngle = Math.atan2(vortexY, vortexX);
        const vortexDist = Math.sqrt(vortexX * vortexX + vortexY * vortexY);
        patternValue = Math.sin(vortexAngle * freq + vortexDist * 2);
  return patternValue;
}
