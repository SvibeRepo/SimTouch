import assert from "node:assert/strict";
import test from "node:test";
import { value } from "./spline.js";

const square = [{
  closed: true,
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ],
}];

function field(mode) {
  return { splineMode: mode, splineContours: square };
}

test("fill is 0.5 at the center and 0 outside the corner", () => {
  assert.equal(value(0.5, 0.5, 0.5, 0.5, 2, field("fill")), 0.5);
  assert.equal(value(0.1, 0.1, 0.5, 0.5, 2, field("fill")), 0);
});

test("bands at the center match the circles formula at distance 0.3", () => {
  const freq = 2;
  const expected = Math.sin(0.3 * freq * Math.PI * 0.3);
  const got = value(0.5, 0.5, 0.5, 0.5, freq, field("bands"));
  assert.ok(Math.abs(got - expected) < 1e-5, `${got} vs ${expected}`);
});

test("along the middle of the bottom edge uses arc length 0.3", () => {
  const freq = 2;
  const expected = Math.sin(0.3 * freq * Math.PI * 0.3);
  const got = value(0.5, 0.2, 0.5, 0.5, freq, field("along"));
  assert.ok(Math.abs(got - expected) < 1e-5, `${got} vs ${expected}`);
  assert.equal(value(0.5, 0.5, 0.5, 0.5, freq, field("along")), 0);
});

test("empty contours and an unknown look return 0", () => {
  assert.equal(value(0.5, 0.5, 0.5, 0.5, 2, { splineMode: "bands", splineContours: [] }), 0);
  assert.equal(value(0.5, 0.5, 0.5, 0.5, 2, { splineMode: "nope", splineContours: square }), 0);
});
