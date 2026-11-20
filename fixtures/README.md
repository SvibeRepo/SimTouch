# Fixtures

Saved patterns and step traces that use `spec/`. Rust tests and the library host tests will both read them. Nothing here is compiled into a board.

`gravity-step.json` is one interior step on the shared slice. Collision is on, and turbulence affect-position is on. Pull is 0.

`noise-step.json` is one interior step with pull on checkerboard. Contrast, separation, warp, and symmetry are 0. The runners pin blur and pattern offset to 0.

`node --import ./tools/lab-register.mjs tools/compare-slice.mjs` steps both on the JavaScript tick, the Rust tick, and `engines/cpp`. The positions must match within `tolerance`. The next file is a boundary-contact fixture. The queue after that is `doc/GOALS.md`.