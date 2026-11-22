use crate::config::params::Params;

/// Pattern 13. Same formula as JavaScript `patterns/vortex.js`.
pub(crate) fn value(x: f32, y: f32, cx: f32, cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    let vx = x - cx;
    let vy = y - cy;
    let angle = vy.atan2(vx);
    let dist = (vx * vx + vy * vy).sqrt();
    (angle * freq + dist * 2.0).sin()
}
