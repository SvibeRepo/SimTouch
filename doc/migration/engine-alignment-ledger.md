# Engine alignment ledger (Pass 1)

JavaScript is where comparison starts. A winner is chosen **with the human** before any port. Priorities for arguing: (1) C++ / suit performance, (2) cleanness. Documentation of the settled tree is a later plan.

Status: **§0–§9 LOCKED and executed.** Pass 2 code for a row waits until that row is LOCKED here.

**Order of work:** §0–§9 done. Polarity: factory refresh + P-VeloDamp (0–0.2) + B-Friction (0–1) on lab/C++/fixtures done; next Density (lab then C++).

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

**Logic:** match formulas; rest on all three (done under §1).
**Naming:** `velocityDamping` / `velocity_damping` — keep local case; shared word **velocityDamping** in docs.
**Workflow:** match (after forces, before collision).

**LOCKED winner:**
| Topic | Decision |
|-------|----------|
| Gravity gate | Nonzero components = on (`\|gx\| + \|gy\| > 1e-6`). Same on JS / Rust / C++. No separate enable flag for apply. |
| Damp formula | Keep retain scale: `v *= velocityDamping` (**1 = no damp**, lower = heavier). |
| Shared default | `velocityDamping = 1.0` on JS / Rust / C++ / lab. |
| Rest / advect / clamp | Already match; unchanged. |

**Deferred:** remaining polarity knobs (B-Friction, Density, Fade) — P-VeloDamp amount (`0 = none`, `1 = max`; retain = `1 - amount`) done on lab + C++ / fixtures.

**Lock:** LOCKED — executed (see Gravity/damp pass status).

---

## 3. Collision and boundary

**Collision logic:** match (metric bins, spacing, ¾-power repulsion).
**Boundary logic:** circular match (lab restitution/tangent + soft zone) after `fixtures/boundary-step.json`. C++ rectangular bounce still lean.
**Naming:** `resolve` / `enforce` — settle word **enforce** for the boundary call; collision **resolve**.
**Workflow:** match (collision then boundary).

**Organization rule (C++ / suit):** Same spine as JS/Rust. Performance may omit work, but omitted steps stay in place as early `return` (or no-op) with the lab-aligned body commented beside the live lean override. Alternatives override; they do not fork structure.

**LOCKED winner:**
| Topic | Decision |
|-------|----------|
| Pair collision | Shared formula (metric bins, spacing, ¾-power). Cap C++ grid at 16. No JS grid realloc. |
| Boundary spine | Same `enforce` steps as lab: outside → warp **or** bounce; else soft repulsion zone. |
| C++ circular live | Lab restitution on normal + damping on tangent; `0.001` inset; soft repulsion on. (Prior lean reflect×damping kept as a history comment.) |
| Naming | Boundary call **enforce**; collision **resolve**. |

**Deferred:** C++ rectangular wall fidelity (fixture is circle-only).

**Lock:** LOCKED — executed (see Collision/boundary pass status).

---

## 4. Turbulence sample

**Logic:** blur 0 = phase only on all three (match). Blur > 0: JS/Rust ring (4 taps Classic Drop); C++ always 16 taps; C++ `reshape01` always applies pull; JS/Rust zero pullReshape on Classic Drop. Domain warp / aspect / amplitude: differ on C++.
**Naming:** `pullReshape`, `quantize`, `domainWarp` already shared — **keep**.
**Workflow:** match (reshape inside blur ring only).

**LOCKED winner:**
| Topic | Decision |
|-------|----------|
| Blur 0 | Phase only (already). |
| Classic Drop ring | **4 taps** + **`pullReshape = 0`** on JS / Rust / C++. |
| Field model | Rust may amortize 128²; C++ keeps on-demand `sampleLab` + `fastPath` >80. Same sample math spine. No mandatory 128² on ESP32. |
| Naming | Keep `pullReshape` / `quantize` / `domainWarp`. |
| Aspect / warp | **Deferred** (unsure) — follow-up slice; do not block this pass. |

**Lock:** LOCKED — executed with §5 (see Turbulence sample/force pass status).

---

## 5. Turbulence force

**Logic:** largely match; Classic Drop `onRipple` gate for pull force on JS/Rust, missing on C++.
**Workflow:** match (in force phase before integrate).

**LOCKED winner:** Keep current force path. Classic Drop `onRipple` (`pattern > 0.08`) gates pullForce on C++ to match JS/Rust. Bias second-step fixture stays GOALS queue.

**Lock:** LOCKED — executed with §4 (see Turbulence sample/force pass status).

---

## 6. Voronoi force

**Logic:** JS random cells + per-particle edge; Rust deterministic + 128² raster; C++ **absent**.
**Workflow:** differ (raster vs on the fly).

**Long-term goals** (not all this pass):
1. Organic feel without obvious loop — **compatible with deterministic** (fixed place + sin-nudged move; no `Math.random`).
2. Grid mode like NOISE (sample edge field) — **later**, with multi-mode work.
3. C++ compute-cheap path — **favoured**; no mandatory 128² on suit this pass.

**LOCKED winner:**
| Topic | Decision |
|-------|----------|
| Lab truth | **Rust model** — deterministic `place_cells` / `move_cells`; edge force via `edge_at` / raster sample. |
| JS | Align place + move to Rust (drop random regen / velocity / add-remove). Per-particle `edge_at` OK this pass (same formula as Rust before bilinear). |
| C++ | **Absent product** — keep `apply_voronoi` spine slot as early-return stub (org rule). Cheap sampler / force later. |
| Grid-as-NOISE | **Deferred** to multi-mode pass. |

**Lock:** LOCKED — executed (see Voronoi pass status).

---

## 7. Organic and FLIP/PIC

**Organic:** JS + Rust; C++ absent. Rust pre-snapshot of velocity — **keep** (correct neighbor read; cleanness).
**FLIP:** JS already early-outs pressure when `pressureScale` ≤ 0; Rust ran dead Jacobi at scale 0; C++ splat-only.

**LOCKED winner:**
| Topic | Decision |
|-------|----------|
| Organic snapshot | Keep Rust pre-snapshot of neighbor velocity. |
| Organic C++ | Absent product — `apply_organic` spine stub (early return). |
| PIC/FLIP blend | Shared semantics unchanged. |
| Pressure | **Skip solve when it does not push velocity** (`pressureScale` / scale ≤ 0). JS already; Rust early-out; C++ stays splat-only. Full incompressibility later behind non-zero scale. |

**Lock:** LOCKED — executed (see Organic/FLIP pass status).

---

## 8. Grid modes

**Mode IDs:** JS/Rust `GridField` order; C++ previously used a different numeric map.
**Algorithms:** proximity splat on C++ vs pair geometry on JS/Rust; vorticity absent on C++.

**LOCKED winner:**
| Topic | Decision |
|-------|----------|
| Mode IDs | **Align C++ `cellMode` (was `gridMode`) to Lab/Rust** `GridField` order. Suit NVS presets not important this pass. Index 140 unchanged. |
| Algorithms | Keep cheap C++ splat paths (no formula port). |
| Vorticity | Absent on C++ (id 7 reserved → clear). |

| id | Name |
|----|------|
| 0 | NOISE |
| 1 | PROXIMITY |
| 2 | VELOCITY |
| 3 | PRESSURE |
| 4 | COLLISION |
| 5 | PROXIMITY_B |
| 6 | DENSITY |
| 7 | VORTICITY (absent / reserved) |
| 8 | OVERLAP |

**Lock:** LOCKED — executed (see Grid modes pass status).

---

## 9. Noise readers (grid / points / preview)

**Logic:** One sample per cell/point from the turbulence sample path. Bright = high noise. Scale `noiseTune = 2.2`, then `/ maxDensity` on C++ uint8 paths. No `(1 − noise)` invert.
**Naming:** shared word **`compute_noise`** — JS `computeNoise`, Rust `compute_noise`, C++ already `computeNoise` (GridModes + PointModes).
**Workflow:** Amortized field (Rust) when available; on-demand sample (C++/JS) otherwise. Lab JS may keep the blur ring inside `noise2D` for authoring quality.

**LOCKED winner:**
| Topic | Decision |
|-------|----------|
| Sample | One turbulence sample per cell/point. |
| Noise polarity | Bright = high noise. No `(1 − noise)`. |
| Scale | `noiseTune = 2.2`; C++ uint8 paths then `/ maxDensity`. |
| Pass 2 | Fix `GridModes::computeNoise` → match `PointModes` (`noise × 2.2 / maxDensity`). Rename JS `calculateNoise` / Rust `eval_noise` → `compute_noise` / `computeNoise`. |
| Deferred | maxDensity slider polarity invert (0.1↔12 feel), with other retain-style knobs, after ledger. |

**Lock:** LOCKED — executed (see Noise readers pass status).

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

## Gravity/damp pass status (§2)

**Executed** (Pass 2 for this row):

| Done | Detail |
|------|--------|
| Gravity gate | JS / Rust / C++ apply only when `|gx| + |gy| > 1e-6`; lab pack uses nonzero components |
| Damp default | JS ctor `velocityDamping` aligned to `1.0` (match Rust / C++ / lab) |
| Damp formula | Unchanged retain scale (`v *= d`) |

**Follow-up:** P-VeloDamp amount polarity on lab + C++ (fixtures/chart amount, slider/registry **0–0.2**). Other retain-style knobs still queued.

**Verified:** `compare-slice` gravity + noise + boundary green after amount remap; C++ `simcore_test` OK.

---

## Collision/boundary pass status (§3)

**Executed** (Pass 2 for this row; circular fidelity follow-up with `fixtures/boundary-step.json`):

| Done | Detail |
|------|--------|
| Collision | Unchanged shared formula; C++ grid cap 16 |
| C++ `Boundary::enforce` | Circular (and rect) reshaped to lab spine; circular now lab restitution/tangent + soft zone + `0.001` inset |
| Rust naming | `boundary::resolve` → `boundary::enforce` |
| Fidelity | Circular matched by boundary-contact fixture; rectangular still lean |

**Verified:** `compare-slice` gravity + noise + boundary green; Rust lib tests 35; C++ `simcore_test` OK.

---

## Turbulence sample/force pass status (§4–§5)

**Executed** (Pass 2 for these rows):

| Done | Detail |
|------|--------|
| Classic Drop ring | C++ `sampleLab` uses 4 taps when style == 9 |
| `pullReshape` | C++ `reshape01` forces 0 on Classic Drop |
| `onRipple` | C++ `apply` gates pullForce when Classic Drop pattern ≤ 0.08 |
| Field model | C++ on-demand + fastPath unchanged |
| Deferred | Aspect / warp absolute vs center |

**Verified:** `compare-slice` gravity + noise green; C++ `simcore_test` OK (incl. Classic Drop reshape gate).

---

## Voronoi pass status (§6)

**Executed** (Pass 2 for this row):

| Done | Detail |
|------|--------|
| JS place/move | Deterministic golden-angle place + Rust bounce / sin velocity nudge; no random add-remove |
| C++ spine | `apply_voronoi` early-return stub in `ParticleSystem::step` |
| Deferred | Grid-as-NOISE mode; C++ cheap sampler/force; JS optional 128² raster |

**Verified:** `compare-slice` gravity + noise green; C++ `simcore_test` OK.

---

## Organic/FLIP pass status (§7)

**Executed** (Pass 2 for this row):

| Done | Detail |
|------|--------|
| Organic Rust | Pre-snapshot kept |
| Organic C++ | `apply_organic` early-return stub in spine |
| Pressure | Rust `velocity_grid::solve` early-outs when scale ≤ 0 (JS already); Jacobi path kept for non-zero scale |
| Blend | Unchanged |

**Verified:** `compare-slice` gravity + noise green; Rust lib tests 35; C++ `simcore_test` OK.

---

## Grid modes pass status (§8)

**Executed** (Pass 2 for this row):

| Done | Detail |
|------|--------|
| C++ IDs | `GridModes::compute` switch matches Lab/Rust `GridField` order |
| Algorithms | Unchanged cheap splat |
| Vorticity | id 7 → clearToZero |

**Verified:** `compare-slice` gravity + noise green; C++ `simcore_test` OK.

---

## Noise readers pass status (§9)

**Executed** (Pass 2 for this row):

| Done | Detail |
|------|--------|
| C++ `GridModes::computeNoise` | `noise01 * 2.2 / maxDensity` (match `PointModes`; no invert) |
| Naming | JS `calculateNoise` → `computeNoise`; Rust `eval_noise` → `compute_noise` |
| Deferred | maxDensity slider polarity invert (later retain-style pass) |

**Verified:** `compare-slice` gravity + noise green; Rust lib tests 35; C++ `simcore_test` OK (incl. `test_gridmodes_noise_matches_lab_scale`).

---

## Pass 2 queue (formulas)

Former premature formula edits were **reverted** before the structure pass. §1–§9 done.

Deferred candidates (still PROPOSED): polarity invert with presets (incl. maxDensity slider); touch/field interaction; voronoi grid-as-NOISE; C++ voronoi cheap path; C++ rectangular boundary fidelity; C++ aspect/warp (unsure); docs/flowcharts.
