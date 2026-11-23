import assert from "node:assert/strict";
import test from "node:test";
import { packSpline, flattenSvg } from "./spline_loader.js";

test("packSpline writes mode, count, and points", () => {
  const packed = packSpline("along", [{
    closed: true,
    points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }],
  }]);
  assert.deepEqual(packed, [2, 1, 2, 1, 0.2, 0.2, 0.8, 0.2]);
});

test("flattenSvg flips y inside the viewBox", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="20,20 80,20 80,80 20,80"/></svg>`;
  const contours = flattenSvg(svg);
  assert.equal(contours.length, 1);
  assert.equal(contours[0].closed, true);
  const top = contours[0].points[0];
  assert.ok(Math.abs(top.x - 0.2) < 1e-4);
  assert.ok(Math.abs(top.y - 0.8) < 1e-4, "svg y 20 of 100 becomes pattern y 0.8");
});
