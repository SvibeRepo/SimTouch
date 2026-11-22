/** Pattern case "circles". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        patternValue = Math.sin(dist * freq * Math.PI * .3);
  return patternValue;
}
