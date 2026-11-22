//! Cell-mode ids. Order matches JavaScript `GridField` in `g_shared.js`.
//! `MODE_VELOCITY_C` has no cell formula. Selecting it fills zeros.

pub const MODE_NOISE: u32 = 0;
pub const MODE_PROXIMITY: u32 = 1;
pub const MODE_VELOCITY: u32 = 2;
pub const MODE_PRESSURE: u32 = 3;
pub const MODE_COLLISION: u32 = 4;
pub const MODE_PROXIMITY_B: u32 = 5;
pub const MODE_DENSITY: u32 = 6;
pub const MODE_VORTICITY: u32 = 7;
pub const MODE_OVERLAP: u32 = 8;
/// Particle-class only: neighbour-weighted speed. Appended so existing ids stay stable.
pub const MODE_VELOCITY_C: u32 = 9;
