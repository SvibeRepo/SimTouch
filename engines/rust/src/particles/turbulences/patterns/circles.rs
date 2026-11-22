use crate::config::params::Params;

const PI: f32 = std::f32::consts::PI;

/// Pattern 4. Same formula as JavaScript `patterns/circles.js`.
pub(crate) fn value(x: f32, y: f32, cx: f32, cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    let dist = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
    (dist * freq * PI * 0.3).sin()
}
