/** Pattern case "voronoi". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;

        // Create a cellular pattern using multiple centers
        const numCenters = 4; // Reduced from 6 for simpler pattern
        let minDist = Infinity;
        let secondMinDist = Infinity;

        for (let i = 0; i < numCenters; i++) {
          const angle = (i / numCenters) * Math.PI * 2;
          // Scale up the circle radius for larger cells
          const seedX = centerX + Math.cos(angle) * 1.5; // Increased from 1.0
          const seedY = centerY + Math.sin(angle) * 1.5; // Increased from 1.0
          const dx = x - seedX;
          const dy = y - seedY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Keep track of two smallest distances for edge detection
          if (dist < minDist) {
            secondMinDist = minDist;
            minDist = dist;
          } else if (dist < secondMinDist) {
            secondMinDist = dist;
          }
        }

        // Use a gentler frequency for smoother transitions
        patternValue = Math.sin(minDist * freq * Math.PI * .5); // Reduced from 2.0
  return patternValue;
}
