# Lab cell class / particle class

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the C++ `cellMode` / `outputClass` / `ParticleModes` design in the pattern lab (JavaScript + Rust). Lab is the testing ground; new features land here first.

**Architecture:** Exclusive `outputClass` (`cell` | `particle`). Mode name selects a method on that class. Cell class keeps today’s `GridRenderModes`. Particle class rewrites proximity/noise for one particle (same idea as `engines/cpp` `ParticleModes`): theme levels color disks; no cell evaluation or cell data send. Rust exposes `particle_eval` + values for the wasm tick.

**Tech Stack:** Lab web (`applications/web`), JS engine (`engines/javascript`), Rust wasm (`engines/rust`).

## Global Constraints

- Lab first: do not change suit firmware in this plan.
- Index/name parity with C++ where it matters: mode 0 = Noise, 1 = Proximity; class 0 = cell, 1 = particle.
- `particle` is visual only: no cell data array / no UDP cell payload.
- Particle methods available now: Noise, Proximity only. Other mode names stay unavailable on the particle class (do not fall back to cell).
- Particle proximity/noise formulas match C++ `ParticleModes` (Gaussian neighbour kernel + `noiseTune` 2.2), not a cell splat sampled at a particle.
- Cell Noise still parks the particle step via existing lab noise-mode behaviour. Particle Noise does not pause; it colors disks and leaves the step running.
- Preset key `"Mode"` must still restore cell mode (alias to `"Cell Mode"`). New saves use `"Cell Mode"` and `"Class"`.
- Rename `simParams.rendering.gridMode` → `cellMode`. Add `rendering.outputClass` default `"cell"`.

---

## File map

| File | Role |
|------|------|
| `engines/javascript/grid/particle_render_modes.js` | New: proximity + noise for particles |
| `engines/javascript/grid/grid_render_modes.js` | Cell class unchanged; keep `GridField` |
| `engines/javascript/core/rust_core.js` | `set_cell_mode`, `particleEval` / `particleValues` |
| `engines/rust/src/grid/particle_modes.rs` (or methods on `ParticleSystem`) | Rust particle eval |
| `engines/rust/src/wasm_api.rs` | Export particle eval + rename/alias cell mode |
| `applications/web/src/main.js` | Defaults: `cellMode`, `outputClass` |
| `applications/web/src/ui/panels/paramUi.js` | Class + Cell Mode controls |
| `applications/web/src/renderer/gridGenRenderer.js` | Skip cell eval/paint/send when particle |
| `applications/web/src/renderer/particleRenderer.js` | Per-particle theme colors when particle class |
| `applications/web/src/shader/shaderManager.js` | Particle color attribute |
| Factory presets / randomizer | Alias Mode; add Class default cell |

## Tasks

### Task 1: JS ParticleRenderModes + param rename

- [x] Add `particle_render_modes.js` with `computeProximity` / `computeNoise` matching C++.
- [x] Rename `gridMode` → `cellMode` in main, paramUi, gridGenRenderer, noisePreview, uiManager.
- [x] Add `outputClass` (`cell`/`particle`) UI labeled Class.
- [x] Preset alias: `"Mode"` → Cell Mode controller; target key `"Cell Mode"`.

### Task 2: Lab paint / data skip

- [x] Particle class: skip `GridRenderModes` evaluation, skip cell draw colors, send empty/no cell data.
- [x] Color disks from particle levels via current theme gradient; opacity blends (0 → opaque for this path).
- [x] Shader: per-vertex color attribute for particles.

### Task 3: Rust particle_eval

- [x] Implement proximity + noise for particles; expose via wasm.
- [x] Alias/rename `set_grid_mode` → `set_cell_mode` (keep old name as thin alias if needed).
- [x] Wire rust_core + particle path: when particle class + rust engine, call particle_eval.
- [x] Unit tests in `particle_modes.rs` (host `cargo test` may fail on this machine’s gnu linker; wasm `build:core` OK).

### Task 4: Docs

- [x] Note lab-first in `doc/GOALS.md`.
- [x] Update cursor plan / this plan todos when done.
