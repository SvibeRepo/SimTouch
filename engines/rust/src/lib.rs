pub mod config;
pub mod grid;
pub mod particles;

pub use config::params;
pub use particles::core::ParticleSystem;

#[cfg(target_arch = "wasm32")]
mod wasm_api;
