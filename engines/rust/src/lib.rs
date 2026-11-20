pub mod behaviors;
pub mod config;
pub mod core;
pub mod forces;
pub mod grid;

pub use config::params;
pub use core::ParticleSystem;

#[cfg(target_arch = "wasm32")]
mod wasm_api;
