# JavaScript core

Particle sources for the pattern lab. The page imports this folder through the `src/simulation` junction.

The running tick is the Rust crate in `core/rust`. `applications/web` calls `rustCore.step(dt)`. When `sim.engine` is `js`, `main.js` logs a warning and still runs the wasm tick.

A new behavior may be drafted in this folder when it can be tried from the pattern lab without also changing `core/rust` and `core/cpp` in the same change. The page will not execute that draft until a later plan restores the JavaScript tick from `master` (`Sim/src/simulation` on that branch) and honors the engine switch.

`rustCore.js` is the wasm adapter. It stays here because the page constructs it next to `ParticleSystem`.