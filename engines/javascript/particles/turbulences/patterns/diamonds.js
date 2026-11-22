/** Pattern case "diamonds". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;
 // New pattern replacing maze
        patternValue = Math.sin(x * freq + y * freq) * Math.cos(x * freq - y * freq) * .8;
  return patternValue;
}
