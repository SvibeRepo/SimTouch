use crate::config::params::Params;

const PI: f32 = std::f32::consts::PI;

/// Pattern 7. Same formula as JavaScript `patterns/dots.js`.
pub(crate) fn value(x: f32, y: f32, _cx: f32, _cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    let dot_x = (x * freq * 0.17 * PI).sin();
    let dot_y = (y * freq * 0.17 * PI).sin();
    let dot = (dot_x * dot_x + dot_y * dot_y).sqrt();
    (dot * PI).cos()
}
