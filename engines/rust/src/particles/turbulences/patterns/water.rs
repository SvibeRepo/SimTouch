use crate::config::params::Params;

/// Pattern 8. Same formula as JavaScript `patterns/water.js`.
pub(crate) fn value(x: f32, y: f32, _cx: f32, _cy: f32, freq: f32, p: &Params, time: f32) -> f32 {
    let base = (y * freq * 0.5 + x * freq * 0.2 + time * p.turb_speed * 0.5).sin();
    let ripples = (x * freq * 1.5 + y * freq * 1.2 + time * p.turb_speed * 0.3).sin() * 0.3;
    base * 0.5 + ripples
}
