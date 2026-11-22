//! Suit-cell values. Mode math lives in `render_modes`.

pub mod render_modes;

pub(crate) use render_modes::{
    Grid, MODE_COLLISION, MODE_DENSITY, MODE_NOISE, MODE_OVERLAP, MODE_PRESSURE,
    MODE_PROXIMITY, MODE_PROXIMITY_B, MODE_VELOCITY, MODE_VELOCITY_C, MODE_VORTICITY,
};
