use crate::particles::turbulences::turbulence_manager::{bilinear_sample, FIELD_N};
use crate::particles::render_modes::p_shared::{clamp01, NOISE_TUNE};

pub fn compute(x: &[f32], y: &[f32], n: usize, max_density: f32, field: &[f32], out: &mut [f32]) {
    for i in 0..n {
        let noise01 = bilinear_sample(field, FIELD_N, x[i], y[i]);
        out[i] = clamp01(noise01 * NOISE_TUNE / max_density);
    }
}
