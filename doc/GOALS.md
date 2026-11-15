# Goals

Direction for the next steps. When `START_HERE.md`, `doc/migration/`, `doc/SIMTOUCHCORE.md`, `core/cpp/doc/NEXT.md`, or a plan under `.superpowers/plans/` disagrees with this file about what to build next, follow this file.

## Now (2026-11-15, order done)

`master` is the Rust layout (`2dc08f1`). Branch `JavaScript` at `364fdc7` keeps the pre-merge tree. Branch `JavaRustCpp` runs both ticks: `particleSystem.step()` when `sim.engine` is `js`, and `rustCore.step(dt)` otherwise. The default engine is `rust`.

The shared slice chart is `spec/fields.json` (33 fields). Its `index` is the shared name. The Rust pack slot and the suit index stay local columns. The suit mask and rectangular domain stay as they are.

`fixtures/gravity-step.json` is one interior step. Two particles overlap, so collision runs. Turbulence affect-position is on (decay and a direction bias). Pull is 0, so the noise samplers do not change velocity. `node --import ./tools/lab-register.mjs tools/compare-slice.mjs` steps the JavaScript tick, the Rust tick, and `core/cpp`. Positions match within `1e-5`.

`fixtures/noise-step.json` is one interior step with pull 0.5 on checkerboard (pattern 0), frequency 2, scale 1, and speed 0. Contrast, separation, warp, and symmetry are 0. Blur and pattern offset stay off the chart; the runners pin both to 0. The same compare command steps it. Positions match within `1e-5`. Rust samples that field at the particle; the 128² grid remains the sample when contrast, separation, or blur is non-zero. Other pattern styles stay uncompared.

## Products

1. **Suit library.** `core/cpp` is the physics the P4 panel links. It stays its own git repository. For development, the suit is the slave of a shared field chart (same name and index for every engine). The working suit mask and rectangular domain stay as they are; a board slot still receives only the compact float bag that fits the P4 NVS partition (`0x5000`, no LittleFS). Today's `STP1` is that bag, not a frozen byte layout.
2. **Pattern lab.** `applications/web` is where a behavior is watched. The JavaScript tick is the reference. The Rust tick in `core/rust` matches that tick. `master` runs Rust. The known-good JavaScript tree is branch `JavaScript` at `364fdc7`. On `JavaRustCpp` the lab steps that tick when `sim.engine` is `js`.
3. **Developer preset.** Authoring stays lab JSON (panels, modulators, string enums). The board receives the compact projection of that document onto the existing suit mask. `spec/` holds the shared field chart when written.

## Order

Done (2026-11-15).

1. **JavaScript tick.** Done. The known-good JavaScript tree is branch `JavaScript` at `364fdc7`. On `JavaRustCpp`, that tick is in `core/javascript`, `rustCore.js` is kept, and it runs when `sim.engine === "js"`. The lab steps JavaScript and Rust from the engine switch.
2. **Shared field chart.** Done. `spec/fields.json` is one name and index for Rust, JavaScript, and `core/cpp` for gravity, damping, collision, boundary, and turbulence.
3. **Shared slice.** Done. `fixtures/gravity-step.json` steps the JavaScript tick, the Rust tick, and `core/cpp`. Positions match within `1e-5`.

Phase2 (`applications/embedded/phase2`) stays its own firmware. Library work lands in `core/cpp`. Phase1 stays the display slave of the lab.
