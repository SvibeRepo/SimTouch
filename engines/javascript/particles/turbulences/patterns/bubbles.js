/** Pattern case "bubbles". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        // Create organic bubble-like patterns
        const bubbleX = (x - centerX) * freq;
        const bubbleY = (y - centerY) * freq;
        const bubbleDist = Math.sqrt(bubbleX * bubbleX + bubbleY * bubbleY);
        patternValue = Math.sin(bubbleDist * 1) * Math.cos(bubbleX * 1) * Math.sin(bubbleY * 1);
  return patternValue;
}
