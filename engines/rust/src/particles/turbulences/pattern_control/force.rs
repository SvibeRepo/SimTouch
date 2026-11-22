use crate::config::params::{pattern, Params};
use crate::particles::turbulences::turbulence_manager::{
    bilinear_sample, pattern_value, process_xy, sample_analytic, FIELD_N,
};

pub fn sample_force(
    field: &[f32],
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    dt: f32,
    p: &Params,
    time: f32,
    rotation: f32,
    bias_x: f32,
    bias_y: f32,
) -> (f32, f32, f32) {
    let drive = p.turb_affect_position || p.turb_scale_field;
    let active = drive || p.turb_affect_scale;
    if !active {
        return (vx, vy, 0.0);
    }
    // Size-only must not apply T-Decay: that path only writes radii, and decaying
    // velocity here starved collision/boundary feedback (Gate_02 "restricted" feel).
    let mut nvx = if drive { vx * p.turb_decay } else { vx };
    let mut nvy = if drive { vy * p.turb_decay } else { vy };
    if p.turb_strength.abs() < 0.001 && !p.turb_affect_scale {
        return (nvx, nvy, 0.0);
    }
    if p.turb_affect_position && (p.turb_dir_x != 0.0 || p.turb_dir_y != 0.0) {
        nvx += p.turb_dir_x * p.turb_strength * dt;
        nvy += p.turb_dir_y * p.turb_strength * dt;
    }
    // Contrast, pull, and separation live inside the blur ring. With blur at 0,
    // JavaScript `noise2D` returns the phase sample and never those passes.
    let analytic = p.turb_blur == 0.0;
    let sample = |sx: f32, sy: f32| {
        if analytic {
            sample_analytic(p, sx, sy, time, rotation, bias_x, bias_y)
        } else {
            bilinear_sample(field, FIELD_N, sx, sy)
        }
    };
    let n1 = sample(x, y);
    // Pull follows the gradient, then normalizes it, so a shallow slope shoves
    // as hard as a ring. Classic Drop's folded surface is that slope. Steer
    // only where a ripple is present. Reshape stays off, so the slider does
    // not repaint the rings.
    let pull_force = p.turb_pull;
    let on_ripple = p.turb_pattern != pattern::CLASSIC_DROP || {
        let (px, py, cx, cy) = process_xy(x, y, p, time, rotation, bias_x, bias_y);
        pattern_value(p.turb_pattern, px, py, cx, cy, p, time) > 0.08
    };
    if p.turb_affect_position && pull_force != 0.0 && on_ripple {
        // Match the JS epsilon so soft grids still produce usable gradients.
        let eps = 0.01;
        let gx = (sample(x + eps, y) - n1) / eps;
        let gy = (sample(x, y + eps) - n1) / eps;
        let mag = (gx * gx + gy * gy).sqrt();
        if mag > 1e-5 {
            let mut nx = gx / mag;
            let mut ny = gy / mag;
            if pull_force < 0.0 && pull_force > -0.5 {
                nx = -nx;
                ny = -ny;
            }
            let strength = pull_force.abs() * p.turb_strength;
            nvx += nx * strength * dt;
            nvy += ny * strength * dt;
        }
    }
    if p.turb_scale_field {
        let t = ((n1 + 1.0) * 0.5).clamp(0.0, 1.0);
        let factor = 1.0 + (t - 0.5) * p.turb_strength * 0.1;
        nvx *= factor;
        nvy *= factor;
    }
    (nvx, nvy, n1)
}

/// Original sim treats the field sample as already `0..1` and clamps:
/// `size = min + noise * (max - min)`. Samples are `[-1, 1]`, so every
/// negative value sits on T-Min Size and only the positive lobe grows toward
/// T-Max Size. Remapping with `(noise + 1) / 2` makes the average particle
/// mid-size, so the group cannot pack small and then get shoved when a crest
/// scales up (Gate_02, Swarm_01).
pub fn radius_from_noise(noise: f32, min_scale: f32, max_scale: f32) -> f32 {
    let lo = min_scale.min(max_scale).max(0.0);
    let hi = min_scale.max(max_scale).max(lo);
    (lo + noise * (hi - lo)).clamp(lo, hi)
}
