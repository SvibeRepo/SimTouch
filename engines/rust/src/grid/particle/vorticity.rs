use crate::grid::particle::shared::{
    clamp01, fallback_radius, for_each_candidate, gaussian_hash, CUTOFF,
};

/// Gaussian-weighted neighbour curl proxy.
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
    let denom = max_velocity.max(1e-6) * max_density.max(1e-6);
    let hash = gaussian_hash(x, y, radii, n, fallback);
    let hash_ref = hash.as_ref();
    for i in 0..n {
        let mut curl = 0.0;
        let mut w_sum = 0.0;
        for_each_candidate(hash_ref, x, y, n, i, |j| {
            let dx = x[j] - x[i];
            let dy = y[j] - y[i];
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
            let dvx = vx[j] - vx[i];
            let dvy = vy[j] - vy[i];
            curl += w * (dx * dvy - dy * dvx);
            w_sum += w;
        });
        if w_sum <= 0.0 {
            out[i] = 0.0;
            continue;
        }
        let scaled = (curl / w_sum).abs() / denom;
        out[i] = clamp01(scaled.powf(0.75));
    }
}
