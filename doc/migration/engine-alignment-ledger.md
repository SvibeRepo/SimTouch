# Engine alignment ledger (Pass 1)

JavaScript is where comparison starts. A winner is chosen **with the human** before any port. Priorities for arguing: (1) C++ / suit performance, (2) cleanness. Documentation of the settled tree is a later plan.

Status: **§0 + §1 LOCKED and executed.** Rows §2–§9 stay PROPOSED until discussed. Pass 2 code for a row waits until that row is LOCKED here.

**Order of work:** §0 done. §1 done. Next: discuss and lock **§2** (gravity / damp / rest / clamp), then remaining formula rows.

| Verdict | Meaning |
|---------|---------|
| match | Already the same |
| differ | Needs a winner |
| absent | Not a product on that engine; stays absent |

| Lock state | Meaning |
|------------|---------|
| PROPOSED | Agent suggestion; open for discussion |
| LOCKED | Human approved; Pass 2 may edit that row |
| REJECTED | Human rejected; needs a new proposal |

---

## 0. File structure

**Goal:** same folders and shared words across JS / Rust / C++.

**LOCKED winner** (discussed):

| Topic | Decision |
|-------|----------|
| Top folder | `SimTouch/core` → `SimTouch/engines` |
| Case / stems | **`snake_case`** everywhere (`particle_system`, `velocity_grid`, `pic_flip`, …) |
| Particle system type/file | **`particle_system`** (not `ps`; not camelCase file stem) |
| Particle system instance | **`ps`** |
| C++ entry | **`sim_core` → `particle_system`** (parity) |
| Collision | under **`core/`**, file **`collision`** (JS: drop `System`) |
| Boundary | inside **`core/`** |
| PIC/FLIP files | **B:** **`velocity_grid`** (splat / sample / pressure) + **`pic_flip`** (blend only) |
| Rust layout | real folders (not flat); split `field.rs` into forces |
| JS grid/noise | move into `engines/javascript/grid/` (incl. lattice pieces from web) |
| `behaviors/` / organic | all three engines (C++ will get it too) |
| This pass scope | **rename/move only** — **no formula edits** (formulas = later pass) |

**LOCKED tree:**

```
engines/
  javascript/
    core/       particle_system, collision, boundary/, velocity_grid, pic_flip
    forces/     turbulence, gravity, voronoi, touch/mouse, …
    behaviors/  organic, …
    grid/       modes, geometry, noise readers
  rust/src/
    core/       particle_system, collision, boundary, velocity_grid, pic_flip
    forces/     turbulence (from field.rs), touch, voronoi, …
    behaviors/  organic
    grid/
    config/     params
  cpp/src/
    core/       particle_system (from sim_core), collision, boundary, velocity_grid, pic_flip
    forces/     touch (apply inside step); gravity_forces / touch_forces names still deferred
    behaviors/  (organic later)
    grid/
    config/ session/ paint/ arduino/   (host glue stays)
```

**Lock:** LOCKED — structure pass executed (rename/move only). Formula rows still open.

---

## 1. Step order

**LOCKED winner** (shape **B** — flat `step` call list only; workers own math):

```text
1  advance_fields
2  apply_gravity
3  apply_turbulence
4  apply_voronoi       # omit while product absent (C++ this pass)
5  apply_organic       # omit while product absent (C++ this pass); one slot
6  apply_touch         # JS mouse ≡ touch; last force before FLIP
7  apply_pic_flip
8  damp
9  rest                # all three engines
10 advect
11 clamp_velocity
12 resolve_collision
13 enforce_boundary
```

**`timeScale` = playback rate:** `physics_dt = time_step * time_scale` once at entry of `step`; every phase uses `physics_dt` (recording / baked-animation clock). Same on JS, Rust, C++. No position-only scale; no host-only multiply carve-out.

**Deferred:** touch vs turb/voronoi/organic fighting (JS neutralize prelude remains until that pass).

**Lock:** LOCKED — executed (see Step-order pass status).

---

## 2. Gravity, damping, integrate, clamp

**Logic:** match formulas; C++ gravity has no enable gate; rest now on all three (done under §1).
**Naming:** `velocityDamping` / `velocity_damping` — keep local case; shared word **velocityDamping** in docs.
**Workflow:** match (after forces, before collision).

**PROPOSED winner:** JS/Rust formulas. Gravity enable gate stays on lab engines. Rest thresholds already on JS/Rust/C++ via §1. `timeScale` playback owned by §1 (done).

**Lock:** open — next discuss row after §1

---

## 3. Collision and boundary

**Collision logic:** match (metric bins, spacing, ¾-power repulsion).
**Boundary logic:** differ — C++ circular bounce is leaner (no tangential restitution split, no repulsion zone).
**Naming:** `resolve` / `enforce` — settle word **enforce** for the boundary call; collision **resolve**.
**Workflow:** match (collision then boundary).

**PROPOSED winner:** Pair collision math = current shared formula (already green on gravity fixture). Boundary: **JS/Rust circular path** is the lab truth; C++ lean path stays for suit until a fixture demands wall fidelity (performance). Cap C++ collision grid at 16 stays (RAM). Do not port JS grid realloc.

**Lock:** open

---

## 4. Turbulence sample

**Logic:** blur 0 = phase only on all three (match). Blur > 0: JS/Rust ring (4 taps Classic Drop); C++ always 16 taps; C++ `reshape01` always applies pull; JS/Rust zero pullReshape on Classic Drop. Domain warp / aspect / amplitude: differ on C++.
**Naming:** `pullReshape`, `quantize`, `domainWarp` already shared — **PROPOSED keep**.
**Workflow:** match (reshape inside blur ring only).

**PROPOSED winner:**
- Blur 0 phase-only (already).
- Classic Drop: **4-tap ring** and **pullReshape = 0** (JS/Rust). Port into C++ — cheaper and matches lab. Performance wins on Classic Drop (fewer taps).
- Amortized 128² field (Rust) is the **suit/lab-Rust** model when a field is filled. C++ keeps on-demand `sampleLab` + `fastPath` above 80 particles (performance). No mandatory 128² on ESP32 this pass.
- Aspect / warp absolute vs center: remaining differ; follow-up slice after Classic Drop port.

**Lock:** open

---

## 5. Turbulence force

**Logic:** largely match; Classic Drop `onRipple` gate for pull force on JS/Rust, missing on C++.
**Workflow:** match (in force phase before integrate).

**PROPOSED winner:** Keep current force path. Classic Drop pullForce ripple gate = JS/Rust; port to C++ when Classic Drop is used on suit (same pass as sample). Bias second-step fixture stays GOALS queue.

**Lock:** open

---

## 6. Voronoi force

**Logic:** JS random cells + per-particle edge; Rust deterministic + 128² raster; C++ **absent**.
**Workflow:** differ (raster vs on the fly).

**PROPOSED winner:** **Rust model** (deterministic place/move + one raster + bilinear) for any future C++ port. C++ stays **absent**. JS random motion is lab-only until a fixture replaces it with the deterministic path (cleanness + compareability). No C++ product this pass.

**Lock:** open

---

## 7. Organic and FLIP/PIC

**Organic:** JS + Rust; C++ absent. Rust pre-snapshot of velocity — **PROPOSED keep** (correct neighbor read; cleanness).
**FLIP:** JS/Rust run pressure solve with scale 0 (dead work); C++ splat-only.

**PROPOSED winner:** PIC/FLIP blend semantics = shared. Pressure: **skip the solve when it does not push velocity** (C++ behavior / performance). Rust must early-out the dead pressure iterations. Full incompressibility remains a future lab option behind a non-zero scale.

**Lock:** open

---

## 8. Grid modes

**Mode IDs:** JS/Rust `GridField` order; C++ uses a **different** numeric map (2=ProximityB, 3=Density, …).
**Algorithms:** proximity splat on C++ vs pair geometry on JS/Rust; vorticity absent on C++.

**PROPOSED winner:** Algorithms may stay cheaper on C++ (splat) for suit display. **Mode IDs stay local on C++** with an explicit remap table in this ledger — renumbering would break NVS presets (performance/stability of shipped boards). Remap (lab id → C++ id) when projecting presets later.

| Lab / Rust id | Name | C++ `gridMode` |
|---------------|------|----------------|
| 0 | NOISE | 0 |
| 1 | PROXIMITY | 1 |
| 5 | PROXIMITY_B | 2 |
| 6 | DENSITY | 3 |
| 2 | VELOCITY | 4 |
| 3 | PRESSURE | 5 |
| 7 | VORTICITY | absent (6 reserved / deferred) |
| 4 | COLLISION | 7 |
| 8 | OVERLAP | 8 |

**Lock:** open

---

## 9. Noise readers (grid / points / preview)

| | Sample | Scale / polarity |
|---|--------|------------------|
| JS `calculateNoise` | `noise2D(..., true)` per cell | `× noiseTune (2.2)` |
| Rust `eval_noise` | bilinear of filled field | `× 2.2` |
| C++ `GridModes::computeNoise` | `sampleTurbulence01` once | **`(1 - noise01) / maxDensity`** — inverted |
| C++ `PointModes::computeNoise` | same sample | `noise01 * 2.2 / maxDensity` |

**PROPOSED winner:** **One sample per cell/point from the turbulence sample path. Bright = high noise. Scale `noiseTune = 2.2`, then `/ maxDensity` on uint8 paths.** No polarity invert. Amortized field (Rust) when available; on-demand sample (C++/JS) otherwise. Lab JS may keep the blur ring inside `noise2D` for authoring quality; suit/grid must not invert.

**If locked:** Fix `GridModes::computeNoise` to match `PointModes`.

**Lock:** open

---

## 10. Code shape (file size / splits)

Mass “split every large file” is **not** a separate pass. Structure is **§0** (LOCKED and executed). Further splits only when a subsystem is touched for a formula win. Tests stay under each engine’s host/test tree.

**Lock:** follows §0 (done for this pass)

---

## Structure pass status

**Executed** (rename/move only; no formula edits):

| Done | Detail |
|------|--------|
| Top folder | `SimTouch/core` → `SimTouch/engines` |
| C++ | `sim_core` → `particle_system`; `velocity_grid` + `pic_flip` split; class `SimCore` → `ParticleSystem` |
| JS | snake_case stems; collision under `core/`; boundary under `core/boundary/`; `velocity_grid` + `pic_flip`; grid/lattice from web → `engines/javascript/grid/`; Main instance `this.ps` |
| Rust | folders `core/`, `forces/`, `behaviors/`, `grid/`, `config/`; `field.rs` → `forces/turbulence.rs`; `Engine` → `ParticleSystem`; `FlipGrid` → `VelocityGrid` + `pic_flip` |
| Glue | `.gitignore`, lab link/build scripts, compare-slice / check-fields, docs, P4 `lib_deps`, firmware workspace paths |

**Verified:** Rust lib tests (35), C++ `simcore_test`, `compare-slice` gravity + noise, `check-fields` (33).

**Still deferred (naming only, not formula):**
- C++ force files still `gravity_forces` / `touch_forces` (tree wants `gravity` / `touch`)
- Wasm bindgen export still `SimCore` (keeps `sim_core.js` glue)
- JS class names still CamelCase (`TurbulenceField`, …); file stems are snake_case
- C++ `behaviors/` folder not created yet (organic later)

---

## Step-order pass status (§1)

**Executed** (Pass 2 for this row):

| Done | Detail |
|------|--------|
| Spine | Flat `ParticleSystem.step` call list on JS / Rust / C++ (shape B) |
| `timeScale` | Engine-entry `physics_dt = time_step * time_scale` on all three; forces + advect share it |
| Rest | C++ gained `velocityThreshold` / `positionThreshold` (defaults match lab) |
| Touch | Apply inside `step` (C++ / Rust module; JS `applyInStep` from state). Session no longer applies touch before `step` |
| Organic (JS) | One `apply_organic` slot after voronoi (legacy + `OrganicBehavior`) |
| Hosts | Rust `slice_step` / lab wasm: raw `dt` + `set_time_scale`; C++ session passes raw `timeStep` |

**Verified:** `compare-slice` gravity + noise green; Rust lib tests 35 (`cargo +stable-x86_64-pc-windows-gnullvm test`).

---

## Pass 2 queue (formulas)

Former premature formula edits were **reverted** before the structure pass. §1 is done.

Deferred candidates (still PROPOSED): touch/field interaction; JS voronoi deterministic; C++ boundary fidelity; C++ aspect/warp; grid mode ID renumber; docs/flowcharts. Rows §2–§9 stay open until discussed.
