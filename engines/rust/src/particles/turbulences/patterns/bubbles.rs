use crate::config::params::Params;

/// Pattern 14. Same formula as JavaScript `patterns/bubbles.js`.
pub(crate) fn value(x: f32, y: f32, cx: f32, cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    let bx = (x - cx) * freq;
    let by = (y - cy) * freq;
    let dist = (bx * bx + by * by).sqrt();
    dist.sin() * bx.cos() * by.sin()
}
