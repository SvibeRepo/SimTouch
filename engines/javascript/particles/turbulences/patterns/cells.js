/** Pattern case "cells". Formulas moved unchanged from calculatePattern. */
export function value(x, y, centerX, centerY, freq, field) {
  let patternValue;
 // Simplified cellular pattern
        // Use a larger cell size for fewer cells
        const cellSize = 2.4 / freq; // Scaled up from 1.6
        const gridX = Math.floor(x / cellSize);
        const gridY = Math.floor(y / cellSize);

        // Only check the 4 nearest cells instead of 9
        let minCellDist = Infinity;
        for (let offY = 0; offY <= 1; offY++) {
          for (let offX = 0; offX <= 1; offX++) {
            const cellGridX = gridX + offX;
            const cellGridY = gridY + offY;

            // Simpler hash function with less variation
            const cellHash = Math.sin(cellGridX * 12.9898 + cellGridY * 78.233) * 43758.5453;

            // Cell centers are more predictable (less random variation)
            const cellCenterX = (cellGridX + 0.5) * cellSize;
            const cellCenterY = (cellGridY + 0.5) * cellSize;

            const cellDx = x - cellCenterX;
            const cellDy = y - cellCenterY;
            const cellDist = Math.sqrt(cellDx * cellDx + cellDy * cellDy);

            minCellDist = Math.min(minCellDist, cellDist);
          }
        }

        // Use a gentler frequency for smoother transitions
        patternValue = Math.sin(minCellDist * Math.PI * 1.5); // Reduced from 2.0
  return patternValue;
}
