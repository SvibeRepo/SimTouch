use crate::config::params::Params;

/// Pattern 0. Same formula as JavaScript `patterns/checkerboard.js`.
pub(crate) fn value(x: f32, y: f32, _cx: f32, _cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    (x * freq).sin() * (y * freq).sin()
}
