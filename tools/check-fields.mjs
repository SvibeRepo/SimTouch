// Checks spec/fields.json against the Rust pack, the wasm PARAM table, and the C++ registry.
// Run from the SimTouch root: node tools/check-fields.mjs

import { readFileSync } from "node:fs";

const chart = JSON.parse(readFileSync("spec/fields.json", "utf8"));
const rustSrc = readFileSync("core/rust/src/params.rs", "utf8");
const jsSrc = readFileSync("core/javascript/core/rustCore.js", "utf8");
const cppSrc = readFileSync("core/cpp/src/config/sim_config.h", "utf8");

function rustIds(source) {
  const block = source.match(/pub mod id \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("params.rs has no pub mod id");
  const ids = new Map();
  for (const match of block[1].matchAll(/pub const ([A-Z0-9_]+): usize = (\d+);/g)) {
    ids.set(match[1], Number(match[2]));
  }
  return ids;
}

function jsParams(source) {
  const block = source.match(/export const PARAM = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error("rustCore.js has no PARAM table");
  const ids = new Map();
  for (const match of block[1].matchAll(/([A-Z0-9_]+): (\d+),/g)) {
    ids.set(match[1], Number(match[2]));
  }
  return ids;
}

function cppRegistry(source) {
  const ids = new Map();
  for (const match of source.matchAll(/\{\s*(\d+),\s*"([^"]+)"/g)) {
    ids.set(Number(match[1]), match[2]);
  }
  return ids;
}

const rust = rustIds(rustSrc);
const js = jsParams(jsSrc);
const cpp = cppRegistry(cppSrc);
const errors = [];
const fields = chart.fields;

if (!Array.isArray(fields) || fields.length === 0) {
  errors.push("fields.json has no fields array");
}

const seen = new Set();
fields?.forEach((row, i) => {
  if (row.index !== i) errors.push(`${row.name || i}: index ${row.index} is not contiguous from 0`);
  if (seen.has(row.name)) errors.push(`duplicate name ${row.name}`);
  seen.add(row.name);

  const rustSlot = rust.get(row.rustName);
  if (rustSlot === undefined) errors.push(`${row.name}: ${row.rustName} missing from params.rs`);
  else if (rustSlot !== row.rust) errors.push(`${row.name}: params.rs ${row.rustName} is ${rustSlot}, chart says ${row.rust}`);

  const jsSlot = js.get(row.rustName);
  if (jsSlot === undefined) errors.push(`${row.name}: ${row.rustName} missing from rustCore.js PARAM`);
  else if (jsSlot !== row.rust) errors.push(`${row.name}: rustCore.js ${row.rustName} is ${jsSlot}, chart says ${row.rust}`);

  const label = cpp.get(row.cpp);
  if (label === undefined) errors.push(`${row.name}: suit index ${row.cpp} missing from kParamRegistry`);
  else if (label !== row.cppLabel) errors.push(`${row.name}: suit index ${row.cpp} is "${label}", chart says "${row.cppLabel}"`);
});

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`fields ok ${fields.length}`);
