use crate::particles::render_modes::p_shared::{
    clamp01, fallback_radius, for_each_candidate, gaussian_hash, CUTOFF,
};

/// Neighbour count inside the Gaussian cutoff, Sensitivity-scaled.
pub fn compute(
    x: &[f32],
    y: &[f32],
    radii: &[f32],
    n: usize,
    fallback: f32,
    max_density: f32,
    out: &mut [f32],
) {
    let fallback = fallback_radius(fallback);
    let hash = gaussian_hash(x, y, radii, n, fallback);
    let hash_ref = hash.as_ref();
    for i in 0..n {
        let mut near = 0.0;
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
            near += 1.0;
        });
        out[i] = clamp01(near / max_density);
    }
}
