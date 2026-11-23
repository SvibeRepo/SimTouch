# Particle and cell mode paths

**Status:** JavaScript and Rust locked 2026-11-22. C++ is a later stem pass. Do not move these files to `grid/particle/`.

**Layout:** one stem per mode. Mode math stays in the mode file. The managers dispatch.

```
engines/javascript/particles/render_modes/     particle_render_manager.js, p_shared.js, p_<mode>.js
engines/rust/src/particles/render_modes/       particle_render_manager.rs, p_shared.rs, p_<mode>.rs
engines/javascript/grid/render_modes/          grid_render_manager.js, g_shared.js, g_<mode>.js
engines/rust/src/grid/render_modes/            grid_render_manager.rs, g_shared.rs, g_<mode>.rs
```

Mode stems on both engines: `noise`, `proximity`, `proximity_b`, `density`, `velocity`, `velocity_c`, `pressure`, `collision`, `overlap`, `vorticity`, plus `shared`.

`velocity_c` is particle-class only. Rust `g_shared.rs` reserves the id and the cell path fills zeros.

Host-only, named in ledger section 0: JavaScript manager smoothing and the engine switch; fade duration and density-gain helpers in `g_shared.js`. Rust managers do not smooth.

C++ today is `engines/cpp/src/grid/particle_modes` (proximity and noise) and `engines/cpp/src/grid/grid_modes` (cell modes, vorticity clears). `grid/point_modes` is panel sample points and has no JavaScript or Rust twin. Those names wait for the C++ stem pass.
