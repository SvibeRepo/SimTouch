use crate::config::params::Params;

const PI: f32 = std::f32::consts::PI;

/// Pattern 10. Same formula as JavaScript `patterns/cells.js`.
pub(crate) fn value(x: f32, y: f32, _cx: f32, _cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    let cell = 2.4 / freq.max(0.0001);
    let grid_x = (x / cell).floor();
    let grid_y = (y / cell).floor();
    let mut min_dist = f32::MAX;
    for off_y in 0..=1 {
        for off_x in 0..=1 {
            let center_x = (grid_x + off_x as f32 + 0.5) * cell;
            let center_y = (grid_y + off_y as f32 + 0.5) * cell;
            let dx = x - center_x;
            let dy = y - center_y;
            min_dist = min_dist.min((dx * dx + dy * dy).sqrt());
        }
    }
    (min_dist * PI * 1.5).sin()
}
