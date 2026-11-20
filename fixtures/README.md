# Fixtures

Saved patterns and step traces that use `spec/`. Rust tests and the library host tests will both read them. Nothing here is compiled into a board.

`gravity-step.json` is one interior step on the shared slice. Collision is on, and turbulence affect-position is on. Pull is 0.

`noise-step.json` is one interior step with pull on checkerboard. Contrast, separation, warp, and symmetry are 0. The runners pin blur and pattern offset to 0.

`boundary-step.json` is one circular bounce step. One particle hits the wall (restitution + damping); another sits in the soft repulsion zone. `expectMotion` is on.

`node --import ./tools/lab-register.mjs tools/compare-slice.mjs` steps all three on the JavaScript tick, the Rust tick, and `engines/cpp`. The positions must match within `tolerance`. The queue after that is `doc/GOALS.md`.