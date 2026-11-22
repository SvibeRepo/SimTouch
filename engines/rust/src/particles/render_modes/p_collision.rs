use crate::particles::render_modes::p_shared::{
    fallback_radius, for_each_candidate, overlap_hash, speed_norm,
};

/// Sum of closing relative speeds with overlapping neighbours.
pub fn compute(
    x: &[f32],
    y: &[f32],
    vx: &[f32],
    vy: &[f32],
    radii: &[f32],
    n: usize,
    fallback: f32,
    max_density: f32,
    max_velocity: f32,
    out: &mut [f32],
) {
    let fallback = fallback_radius(fallback);
    let hash = overlap_hash(x, y, radii, n, fallback);
    let hash_ref = hash.as_ref();
    for i in 0..n {
        let mut approach = 0.0;
        let ri = if i < radii.len() && radii[i] > 1e-4 {
            radii[i]
        } else {
            fallback
        };
        for_each_candidate(hash_ref, x, y, n, i, |j| {
            let rj = if j < radii.len() && radii[j] > 1e-4 {
                radii[j]
            } else {
                fallback
            };
            let dx = x[j] - x[i];
            let dy = y[j] - y[i];
            let dist = (dx * dx + dy * dy).sqrt();
            let min_dist = ri + rj;
            if dist <= 1e-8 || dist > min_dist {
                return;
            }
            let nx = dx / dist;
            let ny = dy / dist;
            let rvx = vx[j] - vx[i];
            let rvy = vy[j] - vy[i];
            let closing = -(rvx * nx + rvy * ny);
            if closing > 0.0 {
                approach += closing;
            }
        });
        out[i] = speed_norm(approach, max_velocity, max_density);
    }
}
