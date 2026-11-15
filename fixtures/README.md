# Fixtures

Saved patterns and step traces that use `spec/`. Rust tests and the library host tests will both read them. Nothing here is compiled into a board.

`gravity-step.json` is one interior step on the shared slice. Collision is on, and turbulence affect-position is on. `node --import ./tools/lab-register.mjs tools/compare-slice.mjs` steps it on the JavaScript tick, the Rust tick, and `core/cpp`. The positions must match within `tolerance`.