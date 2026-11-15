# Spec

Named fields, the preset file layout, and the mesh file layout. Both engines will read this. Nothing here is compiled into a board.

The shared slice is `fields.json`. Its `index` is the shared name. `rust` is the current pack slot. `cpp` is the current suit index. `node tools/check-fields.mjs` checks those columns against `core/rust/src/params.rs`, `core/javascript/core/rustCore.js`, and `core/cpp/src/config/sim_config.h`. The suit mask and the Rust pack are not renumbered by this file.