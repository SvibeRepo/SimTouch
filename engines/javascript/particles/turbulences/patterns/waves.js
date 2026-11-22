/** Pattern case "waves". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        patternValue = Math.sin(x * freq + y * freq * 0.5);
  return patternValue;
}
