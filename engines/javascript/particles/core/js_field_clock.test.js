import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Rust advances noise once inside step:
 *   physics_dt = timeStep * SimSpeed
 *   time += physics_dt * noise speed
 * The lab JS branch used to call turbulenceField.update(timeStep) before
 * step, so noise also moved by timeStep * speed with SimSpeed left out.
 */
function jsEngineBranch(mainSource) {
  const start = mainSource.indexOf('if (sim.engine === "js")');
  assert.notEqual(start, -1);
  const end = mainSource.indexOf("} else {", start);
  assert.notEqual(end, -1);
  return mainSource.slice(start, end);
}

const mainPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../applications/web/src/main.js"
);

test("js tick advances noise only inside step, on the playback dt", () => {
  const branch = jsEngineBranch(readFileSync(mainPath, "utf8"));
  assert.equal(branch.includes("turbulenceField.update"), false);
  assert.equal(branch.includes("voronoiField.update"), false);
  assert.match(branch, /emuForces\.apply\(\s*timeStep\s*\*\s*timeScale\s*\)/);
  assert.match(branch, /this\.ps\.step\(\)/);
});
