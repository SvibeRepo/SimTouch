# JavaScript core

Particle sources for the pattern lab. The page imports this folder through the `src/simulation` junction.

Shared stems with Rust are `doc/migration/engine-alignment-ledger.md` section 0. This folder also keeps the lab glue the page constructs here: `particles/core/rust_core.js` (wasm), `particles/forces/mic.js`, `particles/forces/emu.js`, and `grid/lattice/`.

`applications/web` calls `particleSystem.step()` when `sim.engine` is `js`. It calls `rustCore.step(dt)` otherwise.

`particles/forces/touch.js` is the pointer force. `getParticles()` reads `x` and `y` when the Rust tick has attached them.
