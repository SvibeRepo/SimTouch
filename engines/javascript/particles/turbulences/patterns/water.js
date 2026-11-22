/** Pattern case "water". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        const waterBase = Math.sin(y * freq * 0.5 + x * freq * 0.2 + field.time * field.speed * 0.5);
        const surfaceRipples = Math.sin(x * freq * 1.5 + y * freq * 1.2 + field.time * field.speed * 0.3) * 0.3;
        patternValue = waterBase * 0.5 + surfaceRipples;
  return patternValue;
}
