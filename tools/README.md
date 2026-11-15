# Tools

Headless helpers: generating parameter tables from `spec/`, and comparing step traces. A tool in this folder does not run the simulation and does not draw it.

`check-fields.mjs` reads `spec/fields.json` and fails when a Rust slot or a suit index on that chart no longer matches the source tables. Run it from the repo root: `node tools/check-fields.mjs`.

`compare-slice.mjs` steps slice fixtures on the JavaScript tick, the Rust tick (`core/rust` `slice_step`), and `core/cpp/test/slice_step`. With no arguments it runs `fixtures/gravity-step.json` and `fixtures/noise-step.json`; extra arguments are paths to fixture JSON files. Run it from the repo root: `node --import ./tools/lab-register.mjs tools/compare-slice.mjs [fixture.json ...]`. The compare pins off-chart noise knobs to match the JavaScript reference (turbulence blur 0, Rust pattern offset 0). Build both binaries first. From `core/cpp`, the host `g++` line in `test/host/slice_step.cpp`. From `core/rust`: `cargo build --bin slice_step`.

The pattern lab stays in `applications/web`. The wasm build script stays in `applications/web/scripts/build-core.mjs`.