/** Pattern case "grid". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        patternValue = Math.sin(x * freq) + Math.sin(y * freq);
  return patternValue;
}
