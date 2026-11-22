use crate::config::params::Params;

const PI: f32 = std::f32::consts::PI;

/// Pattern 6. Same formula as JavaScript `patterns/ripples.js`.
pub(crate) fn value(x: f32, y: f32, cx: f32, cy: f32, freq: f32, p: &Params, time: f32) -> f32 {
    let dist = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
    (dist * freq * PI * 0.4 - time * p.turb_speed).sin()
}
