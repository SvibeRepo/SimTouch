# Tools

Headless helpers: generating parameter tables from `spec/`, and comparing step traces. A tool in this folder does not run the simulation and does not draw it.

`check-fields.mjs` reads `spec/fields.json` and fails when a Rust slot or a suit index on that chart no longer matches the source tables. Run it from the repo root: `node tools/check-fields.mjs`.

`compare-slice.mjs` steps `fixtures/gravity-step.json` on the JavaScript tick and on `core/cpp/test/slice_step`. Run it from the repo root: `node --import ./tools/lab-register.mjs tools/compare-slice.mjs`. Build the C++ binary from `core/cpp` first.

The pattern lab stays in `applications/web`. The wasm build script stays in `applications/web/scripts/build-core.mjs`.