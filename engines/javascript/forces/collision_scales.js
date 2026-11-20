/**
 * Pixel-proportional scales for pair tests and rectangular wall insets.
 * Circular shape always returns (1, 1). Rectangular uses render size over its long side.
 */
export function collisionScales(shape, renderWidth, renderHeight) {
  const rectangular =
    shape === "rectangular" ||
    shape === "RECTANGULAR" ||
    shape === 1;
  if (!rectangular) {
    return { sx: 1, sy: 1 };
  }
  const w = Math.max(Number(renderWidth) || 0, 1e-8);
  const h = Math.max(Number(renderHeight) || 0, 1e-8);
  const m = Math.max(w, h);
  return { sx: w / m, sy: h / m };
}
