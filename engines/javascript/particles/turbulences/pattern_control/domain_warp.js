/** applyDomainWarp moved unchanged from TurbulenceField. */
export function domainWarp(field, x, y, time, centerX, centerY) {
    const domainWarp = field.domainWarp;
    if (domainWarp <= 0) return [x, y];

    // Apply warp relative to center
    const tx = x - centerX;
    const ty = y - centerY;
    const warpFreq = 2.0;

    // Apply warping
    let wx, wy;
    if (field.speed > 0 && field.domainWarpSpeed > 0) {
      // Time-driven warping
      wx = tx + domainWarp * Math.sin(ty * warpFreq + time * field.speed * field.domainWarpSpeed);
      wy = ty + domainWarp * Math.cos(tx * warpFreq + time * field.speed * field.domainWarpSpeed);
    } else {
      // Static warping
      wx = tx + domainWarp * Math.sin(ty * warpFreq);
      wy = ty + domainWarp * Math.cos(tx * warpFreq);
    }

    // Return to original coordinate space
    return [wx + centerX, wy + centerY];
  }
