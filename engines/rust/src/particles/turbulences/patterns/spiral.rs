use crate::config::params::Params;

/// Pattern 2. Same formula as JavaScript `patterns/spiral.js`.
pub(crate) fn value(x: f32, y: f32, cx: f32, cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    let angle = (y - cy).atan2(x - cx);
    let radius = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
    (angle * freq + radius * freq * 0.1).sin()
}
