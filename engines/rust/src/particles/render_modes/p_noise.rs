use crate::config::params::Params;
use crate::particles::render_modes::p_shared::{clamp01, NOISE_TUNE};
use crate::particles::turbulences::turbulence_manager::{
    bilinear_sample, sample_analytic, FIELD_N,
};

pub fn compute(x: &[f32], y: &[f32], n: usize, max_density: f32, field: &[f32], out: &mut [f32]) {
    for i in 0..n {
        let noise01 = bilinear_sample(field, FIELD_N, x[i], y[i]);
        out[i] = clamp01(noise01 * NOISE_TUNE / max_density);
    }
}

/// Blur 0: one phase sample at the particle, same as JavaScript `noise2D`.
pub fn compute_analytic(
    x: &[f32],
    y: &[f32],
    n: usize,
    max_density: f32,
    p: &Params,
    time: f32,
    rotation: f32,
    bias_x: f32,
    bias_y: f32,
    out: &mut [f32],
) {
    let n = n.min(out.len()).min(x.len()).min(y.len());
    let max_density = if max_density > 1e-6 { max_density } else { 1e-6 };
    for v in out.iter_mut().take(n) {
        *v = 0.0;
    }
    for i in 0..n {
        let noise = sample_analytic(p, x[i], y[i], time, rotation, bias_x, bias_y);
        out[i] = clamp01(noise * NOISE_TUNE / max_density);
    }
}
