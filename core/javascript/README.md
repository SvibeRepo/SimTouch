# JavaScript core

Particle sources for the pattern lab. The page imports this folder through the `src/simulation` junction.

`applications/web` calls `particleSystem.step()` when `sim.engine` is `js`. It calls `rustCore.step(dt)` otherwise. `rustCore.js` is the wasm adapter. It stays here because the page constructs it next to `ParticleSystem`.

The known-good tick was copied from branch `JavaScript` (`Sim/src/simulation` at `364fdc7`). `mouseForces.js` keeps the wasm position reads. `getParticles()` reads `x` and `y` when the Rust tick has attached them.