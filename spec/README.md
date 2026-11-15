# Spec

Named fields, the preset file layout, and the mesh file layout. Both engines will read this. Nothing here is compiled into a board.

The field list is not written yet. Rust still packs its own float array (`core/rust/src/params.rs`). The C++ registry still uses suit indices (`core/cpp/src/config`).