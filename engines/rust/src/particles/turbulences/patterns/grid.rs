use crate::config::params::Params;

/// Pattern 3. Noise pattern, not the suit grid. Same formula as JavaScript `patterns/grid.js`.
pub(crate) fn value(x: f32, y: f32, _cx: f32, _cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    (x * freq).sin() + (y * freq).sin()
}
