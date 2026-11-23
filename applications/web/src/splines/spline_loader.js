import { presetFlags } from "../presets/presetFlags.js";

const MODE = { bands: 0, fill: 1, along: 2 };
const SVG_NAME = /^[^/\\]+\.svg$/i;

export function packSpline(mode, contours) {
  const out = [MODE[mode] ?? 0, contours.length];
  for (const contour of contours) {
    const pts = contour.points || [];
    out.push(pts.length, contour.closed ? (contour.evenodd ? 2 : 1) : 0);
    for (const p of pts) {
      out.push(p.x, p.y);
    }
  }
  return out;
}

function parseViewBox(svgText, attrs) {
  const match = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)
    || svgText.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (match) {
    const parts = match[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const width = Number((attrs.match(/\bwidth\s*=\s*["']([0-9.]+)["']/i) || [])[1]);
  const height = Number((attrs.match(/\bheight\s*=\s*["']([0-9.]+)["']/i) || [])[1]);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { x: 0, y: 0, width, height };
  }
  return { x: 0, y: 0, width: 100, height: 100 };
}

function normalizePoint(x, y, vb) {
  return {
    x: (x - vb.x) / vb.width,
    y: 1 - (y - vb.y) / vb.height,
  };
}

function parsePointsAttr(raw) {
  const nums = String(raw).trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    points.push({ x: nums[i], y: nums[i + 1] });
  }
  return points;
}

function tagScan(svgText) {
  const open = svgText.match(/<svg\b([^>]*)>/i);
  const vb = parseViewBox(svgText, open ? open[1] : "");
  const contours = [];
  const re = /<(polygon|polyline|rect|line)\b([^>]*)\/?>/gi;
  let m;
  while ((m = re.exec(svgText))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    if (tag === "polygon" || tag === "polyline") {
      const ptsRaw = (attrs.match(/\bpoints\s*=\s*["']([^"']*)["']/i) || [])[1];
      if (!ptsRaw) continue;
      const points = parsePointsAttr(ptsRaw).map((p) => normalizePoint(p.x, p.y, vb));
      if (points.length >= 2) {
        contours.push({ closed: tag === "polygon", points });
      }
      continue;
    }
    if (tag === "rect") {
      const x = Number((attrs.match(/\bx\s*=\s*["']([^"']*)["']/i) || [])[1] || 0);
      const y = Number((attrs.match(/\by\s*=\s*["']([^"']*)["']/i) || [])[1] || 0);
      const w = Number((attrs.match(/\bwidth\s*=\s*["']([^"']*)["']/i) || [])[1]);
      const h = Number((attrs.match(/\bheight\s*=\s*["']([^"']*)["']/i) || [])[1]);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
      const points = [
        normalizePoint(x, y, vb),
        normalizePoint(x + w, y, vb),
        normalizePoint(x + w, y + h, vb),
        normalizePoint(x, y + h, vb),
      ];
      contours.push({ closed: true, points });
      continue;
    }
    if (tag === "line") {
      const x1 = Number((attrs.match(/\bx1\s*=\s*["']([^"']*)["']/i) || [])[1]);
      const y1 = Number((attrs.match(/\by1\s*=\s*["']([^"']*)["']/i) || [])[1]);
      const x2 = Number((attrs.match(/\bx2\s*=\s*["']([^"']*)["']/i) || [])[1]);
      const y2 = Number((attrs.match(/\by2\s*=\s*["']([^"']*)["']/i) || [])[1]);
      if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
      contours.push({
        closed: false,
        points: [normalizePoint(x1, y1, vb), normalizePoint(x2, y2, vb)],
      });
    }
  }
  return contours;
}

function isEvenOdd(el) {
  for (let node = el; node; node = node.parentNode) {
    const rule = node.getAttribute && node.getAttribute("fill-rule");
    if (rule) return rule.toLowerCase() === "evenodd";
  }
  return false;
}

function toViewBox(el, svg, x, y, vb) {
  let px = x;
  let py = y;
  try {
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const elCtm = el.getScreenCTM && el.getScreenCTM();
    const svgCtm = svg.getScreenCTM && svg.getScreenCTM();
    if (elCtm && svgCtm) {
      const user = pt.matrixTransform(elCtm).matrixTransform(svgCtm.inverse());
      px = user.x;
      py = user.y;
    }
  } catch {
    px = x;
    py = y;
  }
  return normalizePoint(px, py, vb);
}

function sampleStroke(el, svg, vb, closed) {
  if (typeof el.getTotalLength !== "function" || typeof el.getPointAtLength !== "function") {
    return null;
  }
  const total = el.getTotalLength();
  if (!(total > 0)) return null;
  const steps = Math.max(12, Math.min(48, Math.ceil(total / 8)));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const p = el.getPointAtLength(Math.min((i / steps) * total, total));
    points.push(toViewBox(el, svg, p.x, p.y, vb));
  }
  if (closed && points.length > 1) points.pop();
  return points.length >= 2 ? points : null;
}

function contoursFromPath(el, svg, vb) {
  const evenodd = isEvenOdd(el);
  const points = sampleStroke(el, svg, vb, false);
  if (!points) return [];
  const dists = [];
  for (let i = 1; i < points.length; i++) {
    dists.push(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const sorted = dists.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const jump = Math.max(median * 8, 0.06);
  const contours = [];
  let current = [points[0]];
  const flush = () => {
    if (current.length < 2) {
      current = [];
      return;
    }
    const a = current[0];
    const b = current[current.length - 1];
    const closed = Math.hypot(a.x - b.x, a.y - b.y) <= jump;
    contours.push({ closed, evenodd, points: current });
  };
  for (let i = 1; i < points.length; i++) {
    if (dists[i - 1] > jump) {
      flush();
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  flush();
  return contours;
}

function flattenWithDom(svgText) {
  if (typeof document === "undefined" || !document.body) return tagScan(svgText);
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return tagScan(svgText);
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;left:-10000px;top:0;pointer-events:none";
  holder.appendChild(svg);
  document.body.appendChild(holder);
  try {
    const vbAttr = svg.getAttribute("viewBox");
    let vb;
    if (vbAttr) {
      const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
      vb = { x: parts[0] || 0, y: parts[1] || 0, width: parts[2] || 100, height: parts[3] || 100 };
    } else {
      const width = Number(svg.getAttribute("width")) || 100;
      const height = Number(svg.getAttribute("height")) || 100;
      vb = { x: 0, y: 0, width, height };
    }
    const contours = [];
    const curves = [...svg.querySelectorAll("path,circle,ellipse")];
    const primitives = [...svg.querySelectorAll("polygon,polyline,rect,line")];
    const elements = curves.length ? curves : primitives;
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      const evenodd = isEvenOdd(el);
      if (tag === "path") {
        contours.push(...contoursFromPath(el, svg, vb));
        continue;
      }
      if (tag === "polygon" || tag === "polyline") {
        const points = parsePointsAttr(el.getAttribute("points") || "")
          .map((p) => toViewBox(el, svg, p.x, p.y, vb));
        if (points.length >= 2) contours.push({ closed: tag === "polygon", evenodd, points });
        continue;
      }
      if (tag === "rect") {
        const x = Number(el.getAttribute("x") || 0);
        const y = Number(el.getAttribute("y") || 0);
        const w = Number(el.getAttribute("width"));
        const h = Number(el.getAttribute("height"));
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
        contours.push({
          closed: true,
          evenodd,
          points: [
            toViewBox(el, svg, x, y, vb),
            toViewBox(el, svg, x + w, y, vb),
            toViewBox(el, svg, x + w, y + h, vb),
            toViewBox(el, svg, x, y + h, vb),
          ],
        });
        continue;
      }
      if (tag === "line") {
        const x1 = Number(el.getAttribute("x1"));
        const y1 = Number(el.getAttribute("y1"));
        const x2 = Number(el.getAttribute("x2"));
        const y2 = Number(el.getAttribute("y2"));
        if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
        contours.push({
          closed: false,
          evenodd: false,
          points: [toViewBox(el, svg, x1, y1, vb), toViewBox(el, svg, x2, y2, vb)],
        });
        continue;
      }
      const points = sampleStroke(el, svg, vb, true);
      if (points) contours.push({ closed: true, evenodd, points });
    }
    return contours.filter((c) => (c.points || []).length >= 2);
  } finally {
    holder.remove();
  }
}

export function flattenSvg(svgText) {
  if (typeof globalThis.DOMParser === "function") {
    return flattenWithDom(svgText);
  }
  return tagScan(svgText);
}

export async function loadSplineList(origin = presetFlags.storeOrigin) {
  const response = await fetch(`${origin}/splines/`);
  if (!response.ok) throw new Error(`spline list ${response.status}`);
  const names = await response.json();
  if (!Array.isArray(names)) throw new Error("spline list was not an array");
  return names.filter((name) => SVG_NAME.test(name));
}

export async function loadSplineFile(origin, name) {
  if (!SVG_NAME.test(name)) throw new Error(`bad spline name: ${name}`);
  const response = await fetch(`${origin}/splines/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`spline file ${response.status}`);
  return response.text();
}

export { SVG_NAME };
