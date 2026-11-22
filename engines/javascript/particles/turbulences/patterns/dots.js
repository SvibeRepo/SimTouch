/** Pattern case "dots". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;
 // New pattern replacing starfield
        // Create a grid of soft dots
        const dotX = Math.sin(x * freq * 0.17 * Math.PI);
        const dotY = Math.sin(y * freq * 0.17 * Math.PI);
        const dotValue = Math.sqrt(dotX * dotX + dotY * dotY);
        patternValue = Math.cos(dotValue * Math.PI * 1);
  return patternValue;
}
