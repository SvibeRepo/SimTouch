use crate::particles::render_modes::p_shared::{
    fallback_radius, for_each_candidate, gaussian_hash, speed_norm, CUTOFF,
};

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
    let hash = gaussian_hash(x, y, radii, n, fallback);
    let hash_ref = hash.as_ref();
    for i in 0..n {
        let mut w_sum = 0.0;
        let mut speed_sum = 0.0;
        for_each_candidate(hash_ref, x, y, n, i, |j| {
            let dx = x[i] - x[j];
            let dy = y[i] - y[j];
            let sigma = if j < radii.len() && radii[j] > 1e-4 {
                radii[j]
            } else {
                fallback
            };
            let e = (dx * dx + dy * dy) / (sigma * sigma);
            if e > CUTOFF {
                return;
            }
            let w = (-e).exp();
            w_sum += w;
            let speed = (vx[j] * vx[j] + vy[j] * vy[j]).sqrt();
            speed_sum += speed * w;
        });
        out[i] = if w_sum > 0.0 {
            speed_norm(speed_sum / w_sum, max_velocity, max_density)
        } else {
            0.0
        };
    }
}
