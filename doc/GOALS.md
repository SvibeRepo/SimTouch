# Goals

Direction for the next steps. When `START_HERE.md`, `doc/migration/`, `doc/SIMTOUCHCORE.md`, `engines/cpp/doc/NEXT.md`, or a plan under `.superpowers/plans/` disagrees with this file about what to build next, follow this file.

## Now (2026-11-16)

The slice order below is done. The queue is the Next section.

`master` is the Rust layout (`2dc08f1`). Branch `JavaScript` at `364fdc7` keeps the pre-merge tree. Branch `JavaRustCpp` runs both ticks: `particleSystem.step()` when `sim.engine` is `js`, and `rustCore.step(dt)` otherwise. The default engine is `rust`.

The shared slice chart is `spec/fields.json` (33 fields). Its `index` is the shared name. The Rust pack slot and the suit index stay local columns. The suit mask and rectangular domain stay as they are.

`fixtures/gravity-step.json` is one interior step. Two particles overlap, so collision runs. Turbulence affect-position is on (decay and a direction bias). Pull is 0, so the noise samplers do not change velocity. `node --import ./tools/lab-register.mjs tools/compare-slice.mjs` steps the JavaScript tick, the Rust tick, and `engines/cpp`. Positions match within `1e-5`.

`fixtures/noise-step.json` is one interior step with pull 0.5 on checkerboard (pattern 0), frequency 2, scale 1, and speed 0. Contrast, separation, warp, and symmetry are 0. Blur and pattern offset stay off the chart; the runners pin both to 0. The same compare command steps it. Positions match within `1e-5`. Rust samples that field at the particle. The 128² grid remains the sample when blur is non-zero. Each cell is the phase sample, then the JavaScript ring (center plus 16 samples, or 4 for Classic Drop, radius `0.05 * blur`) is gathered from that grid. Pull reshape, contrast, and quantize (T-Quantize / separation) run on each sample before the gather only when that slider is off zero. Blur 0 leaves the phase sample alone. Other pattern styles stay uncompared.

On `engines/cpp`, the sample follows the same order: blur 0 is the phase sample; above 0 the ring reshapes with pullReshape, contrast, and quantize only when each slider is off zero. The library default blur is 0.8. This fixture pins blur to 0, so that path stays uncompared.

`fixtures/boundary-step.json` is one circular bounce step. Particle 0 starts outside the wall with outward + tangential velocity (restitution and damping both apply). Particle 1 sits in the soft repulsion zone. Mode is bounce, shape is circle, `expectMotion` is on. Positions match within `1e-5`. That fixture also flipped C++ circular `Boundary::enforce` to the lab restitution/tangent split, `0.001` inset, and soft repulsion (ledger §3 deferred fidelity).

## Lab first

New behaviour is authored and watched in the pattern lab (`applications/web`, JS + Rust ticks) before it lands on the suit or `engines/cpp` panel. The lab is the testing ground. Suit/panel ports follow a proven lab path.

## Next (2026-11-22)

JavaScript and Rust file stems match. The lock is `doc/migration/engine-alignment-ledger.md` section 0. C++ file names are the later stem pass.

Cell class / particle class in the lab (JS + Rust): `cellMode`, exclusive `outputClass`, particle modes under `particles/render_modes/`, cell modes under `grid/render_modes/`. C++ panel already has the mirror (`engines/cpp` `db1c833`) as `grid/particle_modes` and `grid/grid_modes`.

Developer-preset projection onto the suit mask is done. The mask, the rectangular domain, the Rust pack slots, and today's `STP1` bag stay as they are.

Still later:

- A step fixture for pattern styles after checkerboard. The index list now matches the lab on Rust and C++: checkerboard, waves, spiral, grid, circles, diamonds, ripples, dots, water, classic drop, cells, voronoi, fractal, vortex, bubbles.
- Contrast above 0, separation, blur, domain warp, and symmetry. The blur path above is real and stays uncompared. Pattern offset stays off the chart.
- A Rust 128² grid that matches a direct sample to `1e-5`. With blur at 0, Rust samples at the particle.
- Pulse, microphone bands, organic rules, Voronoi, a new `STP1` layout, Phase2, and the suit `/sim` page.

The three green fixtures also leave these chart paths idle: warp mode, turbulence speed and rotation, affect-scale and the scale field, and one step where collision and pull both run. A second step on a green fixture is the check that bias advance matches. Those wait behind the preset plan. Rectangular boundary fidelity on C++ is still lean.

## Products

1. **Suit library.** `engines/cpp` is the physics the P4 panel links. It stays its own git repository. For development, the suit is the slave of a shared field chart (same name and index for every engine). The working suit mask and rectangular domain stay as they are; a board slot still receives only the compact float bag that fits the P4 NVS partition (`0x5000`, no LittleFS). Today's `STP1` is that bag, not a frozen byte layout.
2. **Pattern lab.** `applications/web` is where a behavior is watched. The JavaScript tick is the reference. The Rust tick in `engines/rust` matches that tick. `master` runs Rust. The known-good JavaScript tree is branch `JavaScript` at `364fdc7`. On `JavaRustCpp` the lab steps that tick when `sim.engine` is `js`.
3. **Developer preset.** Authoring stays lab JSON (panels, modulators, string enums). The board receives the compact projection of that document onto the existing suit mask. `spec/` holds the shared field chart when written.

## Order

Done (2026-11-15).

1. **JavaScript tick.** Done. The known-good JavaScript tree is branch `JavaScript` at `364fdc7`. On `JavaRustCpp`, that tick is in `engines/javascript`, `rustCore.js` is kept, and it runs when `sim.engine === "js"`. The lab steps JavaScript and Rust from the engine switch.
2. **Shared field chart.** Done. `spec/fields.json` is one name and index for Rust, JavaScript, and `engines/cpp` for gravity, damping, collision, boundary, and turbulence.
3. **Shared slice.** Done. `fixtures/gravity-step.json`, `fixtures/noise-step.json`, and `fixtures/boundary-step.json` step the JavaScript tick, the Rust tick, and `engines/cpp`. Positions match within `1e-5`. The queue is the Next section.

Phase2 (`applications/embedded/phase2`) stays its own firmware. Library work lands in `engines/cpp`. Phase1 stays the display slave of the lab.
