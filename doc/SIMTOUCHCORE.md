# SimTouchCore Library and the Phase2 fork

**Last checked**: 2026-11-13, against the library headers under `src/`.

`doc/ARCHITECTURE.md` describes the **Phase2 in-tree fork** (`applications/embedded/phase2/`). The **library** is a second tree:

`engines/cpp/`

PlatformIO name `SimTouchCore`, version 0.2.0 (`library.json`). The portable core is `src/config`, `src/core`, `src/forces`, and `src/grid`. There is no `src/app`, `src/output`, `src/input`, or `src/arduino`. Wi-Fi and the tuning page live in the 3.4C example, not in the library. The module write-up is [the library README](../engines/cpp/README.md). This page is the fork map so Phase2 docs are not read as the library API. When the two disagree about the library, the README wins.

## Who builds which tree

| Tree | Path | What links it |
|---|---|---|
| SimTouchCore Library | `engines/cpp/` | P4 panel and `engines/cpp/examples/waveshare_esp32p4_3.4c`. Separate git repo, gitignored by SimTouch. |
| Phase2 fork | `applications/embedded/phase2/` | Phase2 PlatformIO envs. Its `include/` and `src/` are separate copies. |
| JavaScript sources | `engines/javascript/` | Pattern lab, through the `src/simulation` junction. The running tick is `engines/rust`. |
| Pattern lab | `applications/web/` | Browser host. |

Phase2 has not been synced onto the library. Editing one tree does not change the other.

The suit slave (`Svibe_Firmware_Slave`) does not link the library yet. Older notes that place a future library at `SimTouch-lib/` or `applications/embedded/phase2/lib/SimTouch/` describe a sketch that was not created. See the dated note in `doc/migration/migration-plan.md` under "SimTouch Library Distribution".

## Intended library call order

1. Write `SimConfig`, including `gravityX` / `gravityY`.
2. `SimCore::init()`, then each tick `TouchForces::setTouch` + `apply` (optional) and `SimCore::step(dt, timeSec)`.
3. Then either `PointModes` (`setPoints` once, then `computeProximity` or `computeNoise`) or `GridGeometry::rebuild` + `GridModes::compute`.

`GridModes::compute` is the only public grid output. Per-mode methods are private on the library. P4 uses `PointModes` on the suit mesh and does not call `GridModes`. Noise mode on P4 (`gridMode == 0`) advances turbulence bias and calls `computeNoise` without `step`.

Masks, the preset blob, and the host `g++` lines are in the [library README](../engines/cpp/README.md). Short form: `simParamMaskCore`, `simParamMaskPointModes`, and `simParamMaskGridModes` in `src/config/sim_params.cpp`. P4 merges core with point modes and then clears indices 71 and 72.

## Symbols removed from the library only

Verified: absent from the library headers, which sit next to their sources under `src/`. Present or absent on the Phase2 fork as noted. Do not put the removed functions back on the library.

| Symbol | Library | Phase2 fork |
|---|---|---|
| `Boundary::getBoundaryType()` | Removed. Shape is `config->boundaryShape`. `BoundaryType` and `BOUNDARY_*` remain (`src/core/boundary.h`). | Still declared (`applications/embedded/phase2/include/Boundary.h`) and defined. Returns the enum from `boundaryShape`. |
| `SimCore::setGravity(gx, gy)` | Removed. `step` reads `config->gravityX` / `gravityY` via `GravityForces::apply`. | Still declared. Writes those two fields. No Phase2 caller. `ImuForces::apply()` writes the fields itself (`src/ImuForces.cpp`). |
| `SimCore::mutableVx()` / `mutableVy()` | Removed. Const `getVx` / `getVy` remain. `mutableRadii()` remains. | Still inline on `applications/embedded/phase2/include/SimCore.h`, next to `mutableRadii()`. |
| `PointModes::pointX()` / `pointY()` | Removed. `setPoints`, `count`, `computeProximity`, `computeNoise` remain. | No `PointModes` class in `applications/embedded/phase2/`. |

## Other header differences that matter

These are easy to miss if a Phase2 example is copied onto the library:

- **`ImuForces`** exists only on the Phase2 fork. The library has no IMU module. A caller writes `config.gravityX` and `config.gravityY` before `step`.
- **`GridModes` mode methods** (`computeProximity`, `computeDensity`, and the rest) are public on the Phase2 fork and private on the library. Library callers use `compute`.
- **Library `SimCore`** also exposes `advanceTurbulenceBias`, `biasOffsetX` / `biasOffsetY`, `patternSpace`, and `placePattern`. The Phase2 `SimCore` header does not. Phase2 `step` does not advance the turbulence bias; library `step` does.
- **`TouchForces::setTouch(x01, y01, active)`** on the library takes normalized coordinates. Phase2 touch entry is documented in `ARCHITECTURE.md` and is not this signature.

## Host tests

Build from `engines/cpp/`. Commands are in the library README. They compile the `src/*/*.cpp` sources with `g++ -std=c++17` and do not build Phase2.
