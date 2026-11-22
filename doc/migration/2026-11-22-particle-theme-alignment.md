# Particle theme path alignment

> **For agentic workers:** Do not start the next phase until the user confirms the check. No formula edits. No particle-cap edits.

**Goal:** One directory and the same mode-file stems for particle theme modes on JavaScript, Rust, and C++.

**Architecture:** Rust already uses `engines/rust/src/grid/particle/` with one file per mode plus `mod.rs` (`eval` dispatch only). JavaScript and C++ move to that same relative directory. Mode math stays in the mode file. Smoothing stays host-only: JavaScript `manager.js` (lab, both ticks) and the C++ `ParticleModes` class (panel bytes). Rust does not gain a smoother.

**Tech stack:** Lab ES modules, Rust `grid::particle`, C++ library under `engines/cpp` (include root `src/grid`).

## Global constraints

- Path under the language root is `grid/particle/` on all three. Language roots are `engines/javascript/`, `engines/rust/src/`, `engines/cpp/src/`.
- Mode stems that exist on a language match: `shared`, `noise`, `proximity`, `proximity_b`, `density`, `velocity`, `velocity_c`, `pressure`, `overlap`, `collision`, `vorticity`.
- Do not add C++ files for modes the panel does not implement yet (today: proximity and noise only).
- Do not change a mode formula, cutoff, or normalize while moving files.
- Do not change `MAX_PARTICLES` or the lab P-Count slider.
- Phase2 firmware (`applications/embedded/phase2`) is out of this plan.
- Stop after each phase check. Do not continue into the next phase without an explicit yes.

## Current drift

| | Directory | Mode files |
|---|---|---|
| JavaScript | `engines/javascript/particle/render/` | one file per mode, plus `manager.js` |
| Rust | `engines/rust/src/grid/particle/` | one file per mode, plus `mod.rs` |
| C++ | `engines/cpp/src/grid/particle_modes.h` and `.cpp` | both modes inside `ParticleModes` |

Lab import today: `applications/web/src/renderer/gridGenRenderer.js` imports `../simulation/grid/particle_render_modes.js`, which re-exports `../particle/render/manager.js`. C++ include today: `src/session/SimSession.h` uses `#include "particle_modes.h"` with `-I src/grid`. Host tests compile `src/grid/*.cpp` only, so a nested `.cpp` is invisible to those globs until the glob is updated. PlatformIO compiles `src/` recursively, so the panel build follows the move without a new source list.

## Target

```
engines/javascript/grid/particle/     manager.js, shared.js, <mode>.js
engines/rust/src/grid/particle/       mod.rs, shared.rs, <mode>.rs     (unchanged)
engines/cpp/src/grid/particle/        particle_modes.h/.cpp, shared, noise, proximity
```

`grid/particle_render_modes.js` remains the lab import path and re-exports `./particle/manager.js`. Delete `engines/javascript/particle/` after the move. C++ `ParticleModes` stays the panel type; `SimSession.h` includes `"particle/particle_modes.h"`.

Host-only, named here: `manager.js` smoothing / capacity / engine switch; `ParticleModes::smoothInto` writes panel bytes. Mode files only compute.

---

### Phase 1: Move JavaScript beside Rust

**Files:**
- Move: `engines/javascript/particle/render/*.js` → `engines/javascript/grid/particle/*.js` (same filenames)
- Modify: `engines/javascript/grid/particle_render_modes.js`
- Modify: comment in `engines/javascript/grid/particle/manager.js` that still says `particle/render/`
- Delete: `engines/javascript/particle/` once nothing imports it

Imports inside the mode files are `./shared.js` and stay valid because the files move together. `manager.js` imports `../../grid/grid_render_modes.js` today; from `grid/particle/` that becomes `../grid_render_modes.js`. `shared.js` imports `../../grid/grid_render_modes.js` today; that becomes `../grid_render_modes.js`.

`particle_render_modes.js` becomes:

```javascript
/** Re-export: particle theme modes live in grid/particle/. */
export { ParticleRenderModes } from "./particle/manager.js";
```

**Check (pause):** Lab Class=Particle, Engine=js and Engine=rust, mode Proximity. Disks keep theme color. `engines/javascript/particle/` is gone. Do not start Phase 2 until confirmed.

---

### Phase 2: Move C++ into `grid/particle/` and split the two existing modes

No new modes. Cut `computeProximity` into `grid/particle/proximity.cpp` and `computeNoise` into `grid/particle/noise.cpp`. Constants `kCutoff`, `kNoiseTune`, and `clamp01` move to `grid/particle/shared.cpp` (declared in `shared.h`). `particle_modes.cpp` keeps `smoothInto` and calls the two compute functions.

`SimSession.h` include becomes `#include "particle/particle_modes.h"`.

Host-test compile lines that say `src/grid/*.cpp` gain `src/grid/particle/*.cpp` in:

- `engines/cpp/test/host/session_test.cpp`
- `engines/cpp/test/host/simparams_test.cpp`
- `engines/cpp/test/host/simcore_test.cpp`
- `engines/cpp/test/host/slice_step.cpp`
- `engines/cpp/test/host/paint_test.cpp`

**Check (pause):** Panel particle class still paints proximity and noise. Host session test still links. Do not start Phase 3 until confirmed.

---

### Phase 3: Point the queue at this layout

Update `doc/GOALS.md` Next so the finished "lab catches up on proximity/noise" line is replaced by: particle theme files live in `grid/particle/` on JavaScript, Rust, and C++; further particle modes land as the same stem in that directory on the engines that implement them.

**Check (pause):** The rule, this plan, and GOALS name one directory. Done when you sign off.
