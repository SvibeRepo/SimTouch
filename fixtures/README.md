# Fixtures

Saved patterns and step traces that use `spec/`. Rust tests and the library host tests will both read them. Nothing here is compiled into a board.

`gravity-step.json` is one interior step on the shared slice. `node --import ./tools/lab-register.mjs tools/compare-slice.mjs` steps it on the JavaScript tick and on `core/cpp`, and the positions must match within `tolerance`.