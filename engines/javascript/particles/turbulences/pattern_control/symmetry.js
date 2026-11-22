/** applySymmetry moved unchanged from TurbulenceField. */
export function symmetry(field, x, y, centerX, centerY) {
    if (field.symmetryAmount <= 0) return [x, y];

    // Calculate distance from center
    const dx = x - centerX;
    const dy = y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Calculate angle from center
    const angle = Math.atan2(dy, dx);

    // Calculate symmetric angle based on symmetry amount
    const symmetricAngle = angle * (1 + field.symmetryAmount);

    // Convert back to coordinates
    return [
      centerX + dist * Math.cos(symmetricAngle),
      centerY + dist * Math.sin(symmetricAngle)
    ];
  }
