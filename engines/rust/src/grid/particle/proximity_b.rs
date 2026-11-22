use crate::grid::particle::shared::{
    clamp01, fallback_radius, for_each_candidate, overlap_hash,
};

/// Soft overlap kernel: sum of (r_i+r_j - dist)+ / (r_i+r_j).
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
    let hash = overlap_hash(x, y, radii, n, fallback);
    let hash_ref = hash.as_ref();
    for i in 0..n {
        let mut total = 0.0;
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
            let min_dist = ri + rj;
            if min_dist <= 1e-8 {
                return;
            }
            let dx = x[i] - x[j];
            let dy = y[i] - y[j];
            let dist = (dx * dx + dy * dy).sqrt();
            let overlap = (min_dist - dist).max(0.0);
            if overlap <= 0.0 {
                return;
            }
            total += overlap / min_dist;
        });
        out[i] = clamp01(total / max_density);
    }
}
