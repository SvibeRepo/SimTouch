# Goals

Direction for the next steps. When `START_HERE.md`, `doc/migration/`, `doc/SIMTOUCHCORE.md`, `core/cpp/doc/NEXT.md`, or a plan under `.superpowers/plans/` disagrees with this file about what to build next, follow this file.

## Now (2026-11-15, after the merge)

`master` is `2dc08f1` (`Merge branch 'rust'`), matching `origin/master`. The layout move and the Rust tick are on `master`: pattern lab at `applications/web`, JavaScript sources at `core/javascript`, Rust crate at `core/rust`, C++ library nested at `core/cpp` (its own git repo, gitignored here). Phase1 and Phase2 sit under `applications/embedded/`. Branch `rust` remains at `87716de` (the pre-merge tip).

The page runs the Rust/wasm tick. `sim.engine === "js"` only warns and still steps wasm. The JavaScript sources are in place through the `src/simulation` junction; the tick itself is not wired. Rust already matched the JavaScript tick on the earlier tree. That tree, plus the synced README link, is branch `JavaScript` at `364fdc7` (master after syncing `origin/master`, before merging `rust`). Current `master` is the Rust layout, not that snapshot.

Three parameter tables still disagree: lab UI labels / JSON, Rust’s 107-float pack, and the C++ / suit registry (`STP1`, suit indices). The P4 suit (`touch-round-p4`) already runs `core/cpp` with a working mask, rectangular domain, and NVS presets; for development it stays the slave of a shared field chart, not the source of the chart. `spec/` is still only a shelf README.

Next concrete step: order item 1 (JavaScript tick).

## Products

1. **Suit library.** `core/cpp` is the physics the P4 panel links. It stays its own git repository. For development, the suit is the slave of a shared field chart (same name and index for every engine). The working suit mask and rectangular domain stay as they are; a board slot still receives only the compact float bag that fits the P4 NVS partition (`0x5000`, no LittleFS). Today's `STP1` is that bag, not a frozen byte layout.
2. **Pattern lab.** `applications/web` is where a behavior is watched. The JavaScript tick is the reference. The Rust tick in `core/rust` matches that tick. `master` runs Rust. The known-good JavaScript tree is branch `JavaScript` at `364fdc7`. Restore the tick on a branch off `master`.
3. **Developer preset.** Authoring stays lab JSON (panels, modulators, string enums). The board receives the compact projection of that document onto the existing suit mask. `spec/` holds the shared field chart when written.

## Order

1. **JavaScript tick.** The known-good JavaScript tree is branch `JavaScript` at `364fdc7`. On a branch off `master`, bring that tick into `core/javascript`, keep `rustCore.js`, and run it when `sim.engine === "js"`. Done when the lab can step JavaScript and Rust from the engine switch.
2. **Shared field chart.** One name and index for every engine that steps the shared slice. Done when Rust, JavaScript, and `core/cpp` read the same chart for gravity, damping, collision, boundary, and turbulence.
3. **Shared slice.** Compare the lab tick and `core/cpp` on that chart. Done when one fixture steps both and the positions match within a stated tolerance.

Phase2 (`applications/embedded/phase2`) stays its own firmware. Library work lands in `core/cpp`. Phase1 stays the display slave of the lab.
