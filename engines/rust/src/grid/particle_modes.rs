//! Per-particle theme levels for the lab particle output class.
//! Same method names as cell / Grid modes, rewritten for one particle.
//! Visual only: no cell data array.

use crate::forces::turbulence::{bilinear_sample, FIELD_N};
use crate::grid::{MODE_NOISE, MODE_PROXIMITY, MODE_VELOCITY, MODE_VELOCITY_C};

/// Beyond 4 sigma a neighbour adds < 0.1 LSB (same cutoff as C++).
const CUTOFF: f32 = 16.0;
const NOISE_TUNE: f32 = 2.2;

fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

fn speed_norm(speed: f32, max_velocity: f32, max_density: f32) -> f32 {
    let denom = max_velocity.max(1e-6) * max_density.max(1e-6);
    clamp01(speed / denom)
}

/// Write one float level per particle into `out` (length >= count).
/// `max_density` is the engine divisor (from lab Sensitivity gain).
/// Unsupported mode names leave `out[..count]` at 0.
pub fn eval(
    mode: u32,
    x: &[f32],
    y: &[f32],
    vx: &[f32],
    vy: &[f32],
    radii: &[f32],
    count: usize,
    fallback_radius: f32,
    max_density: f32,
    max_velocity: f32,
    field: &[f32],
    out: &mut [f32],
) {
    let n = count
        .min(out.len())
        .min(x.len())
        .min(y.len())
        .min(vx.len())
        .min(vy.len());
    for v in out.iter_mut().take(n) {
        *v = 0.0;
    }
    if n == 0 {
        return;
    }
    let max_density = if max_density > 1e-6 { max_density } else { 1e-6 };
    let max_velocity = if max_velocity > 1e-6 {
        max_velocity
    } else {
        1e-6
    };
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
        MODE_VELOCITY => {
            for i in 0..n {
                let speed = (vx[i] * vx[i] + vy[i] * vy[i]).sqrt();
                out[i] = speed_norm(speed, max_velocity, max_density);
            }
        }
        MODE_VELOCITY_C => {
            for i in 0..n {
                let mut w_sum = 0.0;
                let mut speed_sum = 0.0;
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
                    let w = (-e).exp();
                    w_sum += w;
                    let speed = (vx[j] * vx[j] + vy[j] * vy[j]).sqrt();
                    speed_sum += speed * w;
                }
                out[i] = if w_sum > 0.0 {
                    speed_norm(speed_sum / w_sum, max_velocity, max_density)
                } else {
                    0.0
                };
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::MODE_PRESSURE;

    #[test]
    fn proximity_self_excluded_and_neighbour_adds() {
        let x = [0.5, 0.51];
        let y = [0.5, 0.5];
        let vx = [0.0, 0.0];
        let vy = [0.0, 0.0];
        let r = [0.05, 0.05];
        let mut out = [0.0; 2];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_PROXIMITY,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            2,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        assert!(out[0] > 0.0, "particle 0 should see neighbour");
        assert!(out[1] > 0.0, "particle 1 should see neighbour");
        assert!((out[0] - out[1]).abs() < 1e-5);
    }

    #[test]
    fn velocity_own_speed() {
        let x = [0.5];
        let y = [0.5];
        let vx = [0.5];
        let vy = [0.0];
        let r = [0.05];
        let mut out = [0.0];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_VELOCITY,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            1,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        assert!((out[0] - 0.5).abs() < 1e-5, "got {}", out[0]);
    }

    #[test]
    fn velocity_c_uses_neighbour_speed() {
        let x = [0.5, 0.51];
        let y = [0.5, 0.5];
        let vx = [0.0, 1.0];
        let vy = [0.0, 0.0];
        let r = [0.05, 0.05];
        let mut out = [0.0; 2];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_VELOCITY_C,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            2,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        // Particle 0 is still; neighbour 1 moves at speed 1 → level ~1.
        assert!(out[0] > 0.9, "particle 0 should pick up neighbour speed, got {}", out[0]);
        // Particle 1's only neighbour is still → level 0.
        assert!(out[1] < 1e-5, "particle 1 neighbour is still, got {}", out[1]);
    }

    #[test]
    fn unsupported_mode_zeros() {
        let x = [0.5];
        let y = [0.5];
        let vx = [1.0];
        let vy = [0.0];
        let r = [0.05];
        let mut out = [1.0];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_PRESSURE,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            1,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        assert_eq!(out[0], 0.0);
    }
}
