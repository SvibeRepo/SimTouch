use crate::config::params::Params;

const TAU: f32 = std::f32::consts::TAU;
const PI: f32 = std::f32::consts::PI;

/// Pattern 11. Noise pattern, not `forces/voronoi`. Same formula as JavaScript `patterns/voronoi.js`.
pub(crate) fn value(x: f32, y: f32, cx: f32, cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    let num = 4;
    let mut min_dist = f32::MAX;
    for i in 0..num {
        let angle = (i as f32 / num as f32) * TAU;
        let seed_x = cx + angle.cos() * 1.5;
        let seed_y = cy + angle.sin() * 1.5;
        let dx = x - seed_x;
        let dy = y - seed_y;
        min_dist = min_dist.min((dx * dx + dy * dy).sqrt());
    }
    (min_dist * freq * PI * 0.5).sin()
}
