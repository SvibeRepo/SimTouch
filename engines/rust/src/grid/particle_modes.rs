//! Per-particle theme levels for the lab particle output class.
//! Same method names as cell / Grid modes, rewritten for one particle.
//! Visual only: no cell data array. Formulas match engines/cpp ParticleModes.

use crate::forces::turbulence::{bilinear_sample, FIELD_N};
use crate::grid::{MODE_NOISE, MODE_PROXIMITY};

/// Beyond 4 sigma a neighbour adds < 0.1 LSB (same cutoff as C++).
const CUTOFF: f32 = 16.0;
const NOISE_TUNE: f32 = 2.2;

fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

/// Write one float level per particle into `out` (length >= count).
/// `max_density` is the engine divisor (from lab Sensitivity gain).
/// Unsupported mode names leave `out[..count]` at 0.
pub fn eval(
    mode: u32,
    x: &[f32],
    y: &[f32],
    radii: &[f32],
    count: usize,
    fallback_radius: f32,
    max_density: f32,
    field: &[f32],
    out: &mut [f32],
) {
    let n = count.min(out.len()).min(x.len()).min(y.len());
    for v in out.iter_mut().take(n) {
        *v = 0.0;
    }
    if n == 0 {
        return;
    }
    let max_density = if max_density > 1e-6 { max_density } else { 1e-6 };
    let fallback = if fallback_radius > 1e-4 {
        fallback_radius
    } else {
        1e-4
    };

    match mode {
        MODE_NOISE => {
            for i in 0..n {
                let noise01 = bilinear_sample(field, FIELD_N, x[i], y[i]);
                out[i] = clamp01(noise01 * NOISE_TUNE / max_density);
            }
        }
        MODE_PROXIMITY => {
            for i in 0..n {
                let mut density = 0.0;
                for j in 0..n {
                    if j == i {
                        continue;
                    }
                    let dx = x[i] - x[j];
                    let dy = y[i] - y[j];
                    let sigma = if j < radii.len() && radii[j] > 1e-4 {
                        radii[j]
                    } else {
                        fallback
                    };
                    let e = (dx * dx + dy * dy) / (sigma * sigma);
                    if e > CUTOFF {
                        continue;
                    }
                    density += (-e).exp();
                }
                out[i] = clamp01(density / max_density);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::MODE_VELOCITY;

    #[test]
    fn proximity_self_excluded_and_neighbour_adds() {
        let x = [0.5, 0.51];
        let y = [0.5, 0.5];
        let r = [0.05, 0.05];
        let mut out = [0.0; 2];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_PROXIMITY,
            &x,
            &y,
            &r,
            2,
            0.05,
            1.0,
            &field,
            &mut out,
        );
        assert!(out[0] > 0.0, "particle 0 should see neighbour");
        assert!(out[1] > 0.0, "particle 1 should see neighbour");
        assert!((out[0] - out[1]).abs() < 1e-5);
    }

    #[test]
    fn unsupported_mode_zeros() {
        let x = [0.5];
        let y = [0.5];
        let r = [0.05];
        let mut out = [1.0];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(MODE_VELOCITY, &x, &y, &r, 1, 0.05, 1.0, &field, &mut out);
        assert_eq!(out[0], 0.0);
    }
}
