import { presetFlags } from "../presets/presetFlags.js";

const MODE = { bands: 0, fill: 1, along: 2 };
const SVG_NAME = /^[^/\\]+\.svg$/i;
const PATH_STEPS = 64;

export function packSpline(mode, contours) {
  const out = [MODE[mode] ?? 0, contours.length];
  for (const contour of contours) {
    const pts = contour.points || [];
    out.push(pts.length, contour.closed ? 1 : 0);
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

function sampleGeometry(el, vb, closed) {
  if (typeof el.getTotalLength !== "function" || typeof el.getPointAtLength !== "function") {
    return null;
  }
  const total = el.getTotalLength();
  if (!(total > 0)) return null;
  const points = [];
  const steps = closed ? PATH_STEPS : PATH_STEPS;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * total;
    const p = el.getPointAtLength(Math.min(t, total));
    points.push(normalizePoint(p.x, p.y, vb));
  }
  if (closed && points.length > 1) points.pop();
  return points.length >= 2 ? { closed, points } : null;
}

function flattenWithDom(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return tagScan(svgText);
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
    if (tag === "polygon" || tag === "polyline") {
      const points = parsePointsAttr(el.getAttribute("points") || "")
        .map((p) => normalizePoint(p.x, p.y, vb));
      if (points.length >= 2) contours.push({ closed: tag === "polygon", points });
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
        points: [
          normalizePoint(x, y, vb),
          normalizePoint(x + w, y, vb),
          normalizePoint(x + w, y + h, vb),
          normalizePoint(x, y + h, vb),
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
        points: [normalizePoint(x1, y1, vb), normalizePoint(x2, y2, vb)],
      });
      continue;
    }
    const closed = tag !== "line";
    const sampled = sampleGeometry(el, vb, closed || tag === "path" || tag === "circle" || tag === "ellipse");
    if (sampled) contours.push(sampled);
  }
  return contours.filter((c) => (c.points || []).length >= 2);
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
