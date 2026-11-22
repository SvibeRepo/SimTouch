/** Pattern case "ripples". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        const rippleDist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        patternValue = Math.sin(rippleDist * freq * Math.PI * .4 - field.time * field.speed);
  return patternValue;
}
