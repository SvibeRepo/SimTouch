/** Pattern case "spline". Bands, fill, and along a flattened contour. */
const PI = Math.PI;
const EDGE = 0.03;
const STROKE = 0.015;

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  const dx = qx - px;
  const dy = qy - py;
  return { dist: Math.hypot(dx, dy), t, len: Math.sqrt(ab2) };
}

function segments(contour) {
  const pts = contour.points || [];
  const out = [];
  const n = pts.length;
  const limit = contour.closed ? n : n - 1;
  for (let i = 0; i < limit; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    out.push([a.x, a.y, b.x, b.y, i]);
  }
  return out;
}

function nearest(x, y, contours) {
  let best = null;
  for (const contour of contours) {
    let cum = 0;
    for (const [ax, ay, bx, by] of segments(contour)) {
      const hit = distToSegment(x, y, ax, ay, bx, by);
      const arc = cum + hit.t * hit.len;
      if (!best || hit.dist < best.dist) best = { dist: hit.dist, arc };
      cum += hit.len;
    }
  }
  return best;
}

function winding(x, y, contours) {
  let w = 0;
  for (const contour of contours) {
    if (!contour.closed) continue;
    const pts = contour.points || [];
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        if (x < a.x + t * (b.x - a.x)) w += a.y <= y ? 1 : -1;
      }
    }
  }
  return w;
}

function filled(x, y, contours) {
  const w = winding(x, y, contours);
  if (contours.some((c) => c.evenodd)) return Math.abs(w) % 2 === 1;
  return w !== 0;
}

function smooth(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

const GRID = 64;

export function exact(x, y, _centerX, _centerY, freq, field) {
  const mode = field && field.splineMode;
  const contours = (field && field.splineContours) || [];
  if (contours.length === 0) return 0;
  if (mode === "fill") {
    if (!filled(x, y, contours)) {
      const hit = nearest(x, y, contours.filter((c) => c.closed));
      if (!hit || hit.dist >= EDGE) return 0;
      return 0.5 * smooth(0.5 - hit.dist / EDGE);
    }
    const hit = nearest(x, y, contours.filter((c) => c.closed));
    const signed = hit ? -hit.dist : -1;
    return 0.5 * smooth(0.5 - signed / EDGE);
  }
  const hit = nearest(x, y, contours);
  if (!hit) return 0;
  if (mode === "bands") return Math.sin(hit.dist * freq * PI * 0.3);
  if (mode === "along") {
    if (hit.dist > STROKE) return 0;
    return Math.sin(hit.arc * freq * PI * 0.3);
  }
  return 0;
}

function sampleGrid(grid, x, y) {
  if (x < 0 || y < 0 || x > 1 || y > 1) return 0;
  const u = Math.min(GRID - 1.001, Math.max(0, x * GRID - 0.5));
  const v = Math.min(GRID - 1.001, Math.max(0, y * GRID - 0.5));
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(x0 + 1, GRID - 1);
  const y1 = Math.min(y0 + 1, GRID - 1);
  const tx = u - x0;
  const ty = v - y0;
  const i00 = grid[y0 * GRID + x0];
  const i10 = grid[y0 * GRID + x1];
  const i01 = grid[y1 * GRID + x0];
  const i11 = grid[y1 * GRID + x1];
  const a = i00 * (1 - tx) + i10 * tx;
  const b = i01 * (1 - tx) + i11 * tx;
  return a * (1 - ty) + b * ty;
}

export function value(x, y, centerX, centerY, freq, field) {
  const contours = (field && field.splineContours) || [];
  if (contours.length === 0 || !field || field._splineExact) {
    return exact(x, y, centerX, centerY, freq, field);
  }
  const key = `${field.splineRevision || 0}|${field.splineMode}|${freq}`;
  if (field._splineKey !== key) {
    const grid = new Float32Array(GRID * GRID);
    const probe = {
      splineMode: field.splineMode,
      splineContours: contours,
      _splineExact: true,
    };
    for (let j = 0; j < GRID; j++) {
      const py = (j + 0.5) / GRID;
      for (let i = 0; i < GRID; i++) {
        grid[j * GRID + i] = exact((i + 0.5) / GRID, py, 0, 0, freq, probe);
      }
    }
    field._splineGrid = grid;
    field._splineKey = key;
  }
  return sampleGrid(field._splineGrid, x, y);
}
