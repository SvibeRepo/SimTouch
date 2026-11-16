//! Turbulence on a fixed grid. Patterns, contrast, symmetry, and domain warp run
//! as passes over the grid. Blur 0 stores the phase sample and skips contrast,
//! which is the soft edge JavaScript shows for free. Above 0, contrast runs on
//! that sample and the JavaScript ring is gathered from the raster, still one
//! analytic sample per cell. Particles only bilinear-sample the result.

use crate::params::{pattern, Params};

pub const FIELD_N: usize = 128;
pub const FIELD_AREA: usize = FIELD_N * FIELD_N;

const TAU: f32 = std::f32::consts::TAU;
const PI: f32 = std::f32::consts::PI;

pub fn bilinear_sample(grid: &[f32], n: usize, x: f32, y: f32) -> f32 {
    if n == 0 || grid.len() < n * n {
        return 0.0;
    }
    let n_f = n as f32;
    let fx = (x * n_f - 0.5).clamp(0.0, n_f - 1.0001);
    let fy = (y * n_f - 0.5).clamp(0.0, n_f - 1.0001);
    let x0 = fx.floor() as usize;
    let y0 = fy.floor() as usize;
    let x1 = (x0 + 1).min(n - 1);
    let y1 = (y0 + 1).min(n - 1);
    let tx = fx - x0 as f32;
    let ty = fy - y0 as f32;
    let i00 = grid[y0 * n + x0];
    let i10 = grid[y0 * n + x1];
    let i01 = grid[y1 * n + x0];
    let i11 = grid[y1 * n + x1];
    let a = i00 * (1.0 - tx) + i10 * tx;
    let b = i01 * (1.0 - tx) + i11 * tx;
    a * (1.0 - ty) + b * ty
}

pub fn fill_field(
    field: &mut [f32],
    aux: &mut [f32],
    p: &Params,
    time: f32,
    rotation: f32,
    bias_x: f32,
    bias_y: f32,
) {
    if field.len() < FIELD_AREA || aux.len() < FIELD_AREA {
        return;
    }
    if p.turb_blur > 0.0 {
        // pullReshape, contrast, and quantize run on each sample before the
        // average when that slider is off zero. Rasterize once, then gather.
        for row in 0..FIELD_N {
            for col in 0..FIELD_N {
                let u = (col as f32 + 0.5) / FIELD_N as f32;
                let v = (row as f32 + 0.5) / FIELD_N as f32;
                field[row * FIELD_N + col] =
                    reshape_sample(p, u, v, time, rotation, bias_x, bias_y);
            }
        }
        gather_blur(field, aux, p, time, rotation, bias_x, bias_y);
        return;
    }
    for row in 0..FIELD_N {
        for col in 0..FIELD_N {
            let u = (col as f32 + 0.5) / FIELD_N as f32;
            let v = (row as f32 + 0.5) / FIELD_N as f32;
            let (px, py, cx, cy) = process_xy(u, v, p, time, rotation, bias_x, bias_y);
            let raw = pattern_value(p.turb_pattern, px, py, cx, cy, p, time);
            field[row * FIELD_N + col] = apply_phase(raw, p, time);
        }
    }
}

fn ring_count(p: &Params) -> usize {
    if p.turb_pattern == pattern::CLASSIC_DROP {
        4
    } else {
        16
    }
}

/// JavaScript `applyBlur`, read back from the contrasted grid. The center is
/// the cell itself. Ring taps inside the square are bilinear; taps that leave
/// the square are evaluated, because the grid has no samples there. Classic
/// Drop uses 4 ring samples; every other pattern uses 16.
fn gather_blur(
    field: &mut [f32],
    aux: &mut [f32],
    p: &Params,
    time: f32,
    rotation: f32,
    bias_x: f32,
    bias_y: f32,
) {
    let count = ring_count(p);
    let radius = 0.05 * p.turb_blur;
    let n = count as f32;
    let mut ox = [0.0_f32; 16];
    let mut oy = [0.0_f32; 16];
    for i in 0..count {
        let angle = (i as f32 / n) * TAU;
        ox[i] = angle.cos() * radius;
        oy[i] = angle.sin() * radius;
    }
    let inv = 1.0 / (n + 1.0);
    let nf = FIELD_N as f32;
    for row in 0..FIELD_N {
        let v = (row as f32 + 0.5) / nf;
        for col in 0..FIELD_N {
            let u = (col as f32 + 0.5) / nf;
            let mut sum = field[row * FIELD_N + col];
            for i in 0..count {
                let sx = u + ox[i];
                let sy = v + oy[i];
                sum += if (0.0..=1.0).contains(&sx) && (0.0..=1.0).contains(&sy) {
                    bilinear_sample(field, FIELD_N, sx, sy)
                } else {
                    reshape_sample(p, sx, sy, time, rotation, bias_x, bias_y)
                };
            }
            aux[row * FIELD_N + col] = sum * inv * 2.0 - 1.0;
        }
    }
    field[..FIELD_AREA].copy_from_slice(&aux[..FIELD_AREA]);
}

/// Analytic `applyBlur`, kept to measure the gathered grid against JavaScript.
#[cfg(test)]
fn sample_blurred(
    p: &Params,
    x: f32,
    y: f32,
    time: f32,
    rotation: f32,
    bias_x: f32,
    bias_y: f32,
) -> f32 {
    let count = ring_count(p);
    let radius = 0.05 * p.turb_blur;
    let mut sum = reshape_sample(p, x, y, time, rotation, bias_x, bias_y);
    let n = count as f32;
    for i in 0..count {
        let angle = (i as f32 / n) * TAU;
        sum += reshape_sample(
            p,
            x + angle.cos() * radius,
            y + angle.sin() * radius,
            time,
            rotation,
            bias_x,
            bias_y,
        );
    }
    sum / (n + 1.0) * 2.0 - 1.0
}

/// T-Pull steers Classic Drop. Reshape stays off so the slider does not
/// repaint the rings while it moves.
fn pull_reshape(p: &Params) -> f32 {
    if p.turb_pattern == pattern::CLASSIC_DROP {
        0.0
    } else {
        p.turb_pull
    }
}

fn needs_reshape(p: &Params) -> bool {
    pull_reshape(p) != 0.0 || p.turb_contrast > 0.0 || p.turb_separation > 0.0
}

/// Phase sample in [0, 1], with pullReshape / contrast / quantize only when each is off zero.
fn reshape_sample(
    p: &Params,
    x: f32,
    y: f32,
    time: f32,
    rotation: f32,
    bias_x: f32,
    bias_y: f32,
) -> f32 {
    let n = sample_analytic(p, x, y, time, rotation, bias_x, bias_y);
    let value01 = (n + 1.0) * 0.5;
    if needs_reshape(p) {
        apply_contrast(value01, p)
    } else {
        value01.clamp(0.0, 1.0)
    }
}

/// Rotate, scale, domain-warp, and symmetry are coordinate passes over the grid.
pub fn process_xy(
    x: f32,
    y: f32,
    p: &Params,
    time: f32,
    rotation: f32,
    bias_x: f32,
    bias_y: f32,
) -> (f32, f32, f32, f32) {
    let (x, y) = aspect_correct(x, y, p);
    let cx = p.turb_center_x;
    let cy = p.turb_center_y;
    let (x, y) = rotate(x, y, cx, cy, rotation);
    let (x, y) = scale_about(x, y, p.turb_scale, cx, cy);
    let (x, y) = domain_warp(x, y, p, time, cx, cy);
    let (x, y) = symmetry(x, y, p.turb_symmetry, cx, cy);
    let px = x - p.turb_offset_x + bias_x;
    let py = y + p.turb_offset_y + bias_y;
    (px, py, cx, cy)
}

fn aspect_correct(x: f32, y: f32, p: &Params) -> (f32, f32) {
    if p.boundary_shape != crate::params::boundary_shape::RECTANGULAR {
        return (x, y);
    }
    let w = p.rect_max_x - p.rect_min_x;
    let h = p.rect_max_y - p.rect_min_y;
    if w.abs() < 1e-6 || h.abs() < 1e-6 {
        return (x, y);
    }
    let aspect = w / h;
    let rel_x = (x - p.rect_min_x) / w;
    let rel_y = (y - p.rect_min_y) / h;
    if aspect >= 1.0 {
        ((rel_x - 0.5) / aspect + 0.5, rel_y)
    } else {
        (rel_x, (rel_y - 0.5) * aspect + 0.5)
    }
}

fn rotate(x: f32, y: f32, cx: f32, cy: f32, rotation: f32) -> (f32, f32) {
    if rotation.abs() <= 0.0001 {
        return (x, y);
    }
    let tx = x - cx;
    let ty = y - cy;
    let cos = (-rotation).cos();
    let sin = (-rotation).sin();
    (tx * cos - ty * sin + cx, tx * sin + ty * cos + cy)
}

fn scale_about(x: f32, y: f32, scale: f32, cx: f32, cy: f32) -> (f32, f32) {
    ((x - cx) * scale + cx, (y - cy) * scale + cy)
}

pub fn domain_warp(x: f32, y: f32, p: &Params, time: f32, cx: f32, cy: f32) -> (f32, f32) {
    let domain_warp = p.turb_warp;
    if domain_warp <= 0.0 {
        return (x, y);
    }
    let tx = x - cx;
    let ty = y - cy;
    let warp_freq = 2.0;
    let (wx, wy) = if p.turb_speed > 0.0 && p.turb_warp_speed > 0.0 {
        let t = time * p.turb_speed * p.turb_warp_speed;
        (
            tx + domain_warp * (ty * warp_freq + t).sin(),
            ty + domain_warp * (tx * warp_freq + t).cos(),
        )
    } else {
        (
            tx + domain_warp * (ty * warp_freq).sin(),
            ty + domain_warp * (tx * warp_freq).cos(),
        )
    };
    (wx + cx, wy + cy)
}

pub fn symmetry(x: f32, y: f32, amount: f32, cx: f32, cy: f32) -> (f32, f32) {
    if amount <= 0.0 {
        return (x, y);
    }
    let dx = x - cx;
    let dy = y - cy;
    let dist = (dx * dx + dy * dy).sqrt();
    let angle = dy.atan2(dx);
    let symmetric = angle * (1.0 + amount);
    (cx + dist * symmetric.cos(), cy + dist * symmetric.sin())
}

pub fn pattern_value(kind: u8, x: f32, y: f32, cx: f32, cy: f32, p: &Params, time: f32) -> f32 {
    let freq = p.turb_freq;
    match kind {
        pattern::WAVES => (x * freq + y * freq * 0.5).sin(),
        pattern::SPIRAL => {
            let angle = (y - cy).atan2(x - cx);
            let radius = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
            (angle * freq + radius * freq * 0.1).sin()
        }
        pattern::GRID => (x * freq).sin() + (y * freq).sin(),
        pattern::CIRCLES => {
            let dist = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
            (dist * freq * PI * 0.3).sin()
        }
        pattern::DIAMONDS => (x * freq + y * freq).sin() * (x * freq - y * freq).cos() * 0.8,
        pattern::RIPPLES => {
            let dist = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
            (dist * freq * PI * 0.4 - time * p.turb_speed).sin()
        }
        pattern::DOTS => {
            let dot_x = (x * freq * 0.17 * PI).sin();
            let dot_y = (y * freq * 0.17 * PI).sin();
            let dot = (dot_x * dot_x + dot_y * dot_y).sqrt();
            (dot * PI).cos()
        }
        pattern::WATER => {
            let base = (y * freq * 0.5 + x * freq * 0.2 + time * p.turb_speed * 0.5).sin();
            let ripples = (x * freq * 1.5 + y * freq * 1.2 + time * p.turb_speed * 0.3).sin() * 0.3;
            base * 0.5 + ripples
        }
        pattern::CLASSIC_DROP => classic_drop(x, y, cx, cy, p, time),
        pattern::CELLS => cells(x, y, freq),
        pattern::VORONOI => voronoi_pattern(x, y, cx, cy, freq),
        pattern::FRACTAL => {
            let mut value = 1.0;
            let mut amplitude = 1.0;
            let frequency = freq;
            for _ in 0..3 {
                value += amplitude * (x * frequency).sin() * (y * frequency).sin();
                amplitude *= 0.5;
            }
            value
        }
        pattern::VORTEX => {
            let vx = x - cx;
            let vy = y - cy;
            let angle = vy.atan2(vx);
            let dist = (vx * vx + vy * vy).sqrt();
            (angle * freq + dist * 2.0).sin()
        }
        pattern::BUBBLES => {
            let bx = (x - cx) * freq;
            let by = (y - cy) * freq;
            let dist = (bx * bx + by * by).sqrt();
            dist.sin() * bx.cos() * by.sin()
        }
        _ => (x * freq).sin() * (y * freq).sin(),
    }
}

fn cells(x: f32, y: f32, freq: f32) -> f32 {
    let cell = 2.4 / freq.max(0.0001);
    let grid_x = (x / cell).floor();
    let grid_y = (y / cell).floor();
    let mut min_dist = f32::MAX;
    for off_y in 0..=1 {
        for off_x in 0..=1 {
            let center_x = (grid_x + off_x as f32 + 0.5) * cell;
            let center_y = (grid_y + off_y as f32 + 0.5) * cell;
            let dx = x - center_x;
            let dy = y - center_y;
            min_dist = min_dist.min((dx * dx + dy * dy).sqrt());
        }
    }
    (min_dist * PI * 1.5).sin()
}

fn voronoi_pattern(x: f32, y: f32, cx: f32, cy: f32, freq: f32) -> f32 {
    let num = 4;
    let mut min_dist = f32::MAX;
    for i in 0..num {
        let angle = (i as f32 / num as f32) * TAU;
        let seed_x = cx + angle.cos() * 1.5;
        let seed_y = cy + angle.sin() * 1.5;
        let dx = x - seed_x;
        let dy = y - seed_y;
        min_dist = min_dist.min((dx * dx + dy * dy).sqrt());
    }
    (min_dist * freq * PI * 0.5).sin()
}

fn classic_drop(x: f32, y: f32, cx: f32, cy: f32, p: &Params, time: f32) -> f32 {
    let freq = p.turb_freq.max(0.0001);
    let phase_time = time * p.turb_phase_speed.abs().max(1.0) * p.turb_speed;
    let max_drops = (freq * 3.0).floor().max(3.0) as i32;
    let mut value = 0.0;
    for i in 0..max_drops {
        let fi = (i + 1) as f32;
        let drop_seed = 12.9898 * fi + 4.1414;
        let time_seed = 78.233 * fi + 7.7575;
        let size_seed = 43758.5453 * fi + 1.8989;
        let time_variation = phase_time * 0.05;
        let position_noise = (drop_seed * 13.33 + time_variation).sin() * 0.3;
        let position_radius = 1.0 + position_noise;
        let angle_variation = (time_seed * 0.75 + time_variation * 0.3).sin() * 0.2;
        let drop_x = cx + position_radius * (drop_seed + i as f32 * 2.2 + angle_variation).cos();
        let drop_y = cy + position_radius * (time_seed + i as f32 * 4.3 + angle_variation).sin();
        let drop_cycle_offset = i as f32 * TAU / max_drops as f32;
        let drop_cycle_length = 8.0 / freq;
        let cycle_variation = (size_seed * 3.333 + i as f32 * 7.1).sin() * 0.1;
        let adjusted = drop_cycle_offset * (1.0 + cycle_variation);
        let drop_time_norm = (phase_time + adjusted) % drop_cycle_length;
        let drop_active = drop_cycle_length * 0.75;
        if drop_time_norm < drop_active {
            let age = drop_time_norm / drop_active;
            let dx = x - drop_x;
            let dy = y - drop_y;
            let drop_dist = (dx * dx + dy * dy).sqrt();
            let ripple_speed = 1.0 + size_seed.sin() * 0.4;
            let ripple_radius = age * ripple_speed;
            let ripple_width = 0.12 + 0.18 * (1.0 - age);
            let intensity = 1.0 - age * 0.8;
            let ripple_dist = (drop_dist - ripple_radius).abs();
            let ripple = (-ripple_dist * ripple_dist / (ripple_width * ripple_width)).exp() * intensity;
            value += ripple;
        }
    }
    let calm = (x * freq * 0.2 + y * freq * 0.3 + phase_time * 0.2).sin() * 0.1;
    ((value + calm) * 0.7).min(1.0)
}

fn apply_phase(noise: f32, p: &Params, time: f32) -> f32 {
    let amplitude = if p.turb_speed > 0.0 && p.turb_amplitude_enabled {
        let dynamic = 0.5 + 0.5 * (time * p.turb_speed * p.turb_amplitude_speed).sin();
        p.turb_amplitude * dynamic
    } else {
        p.turb_amplitude
    };
    let phase_offset = if p.turb_speed > 0.0 && p.turb_phase_speed.abs() > 0.0 {
        time * p.turb_speed * p.turb_phase_speed.abs() * p.turb_phase_speed.signum()
            + p.turb_phase * TAU
    } else {
        p.turb_phase * TAU
    };
    (noise * TAU + phase_offset).sin() * amplitude
}

/// pullReshape, bandpass contrast, then quantize (T-Quantize / turb_separation).
/// Content elements match JS `applyContrast` / C++ `reshape01`.
pub fn apply_contrast(mut value: f32, p: &Params) -> f32 {
    let pull_reshape = pull_reshape(p);
    let contrast_value = p.turb_contrast;
    let quantize = p.turb_separation;
    if pull_reshape == 0.0 && contrast_value <= 0.0 && quantize <= 0.0 {
        return value.clamp(0.0, 1.0);
    }
    if pull_reshape != 0.0 {
        if pull_reshape < 0.0 {
            value = value * (1.0 + pull_reshape) + (1.0 - value) * (-pull_reshape);
        } else if value > 0.5 {
            value = 0.5 + (value - 0.5) * (1.0 + pull_reshape * 3.0);
        } else {
            value *= 1.0 - pull_reshape * 0.5;
        }
        value = value.clamp(0.0, 1.0);
    }
    if contrast_value > 0.0 {
        let contrast_mid_point = p.turb_contrast_mid;
        let contrast_shadow_point = p.turb_contrast_shadow;
        let contrast_highlight_point = p.turb_contrast_high;
        let contrast_dark_boost = p.turb_contrast_dark;
        if value < contrast_mid_point {
            let span = contrast_mid_point - contrast_shadow_point;
            if span.abs() > 1e-6 {
                let shadow_range = (value - contrast_shadow_point) / span;
                if shadow_range > 0.0 {
                    let boosted_value = contrast_shadow_point
                        + shadow_range
                            * span
                            * shadow_range.powf(1.0 / (1.0 + contrast_dark_boost * contrast_value));
                    value = value * (1.0 - contrast_value) + boosted_value * contrast_value;
                }
            }
        } else if value < contrast_highlight_point {
            let span = contrast_highlight_point - contrast_mid_point;
            if span.abs() > 1e-6 {
                let transition_range = (value - contrast_mid_point) / span;
                let contrast_reduction = transition_range.powf(0.5);
                let adjusted_contrast = contrast_value * (1.0 - contrast_reduction);
                let mid_curve = contrast_mid_point
                    + (value - contrast_mid_point)
                        * transition_range.powf(1.0 - adjusted_contrast * 0.5);
                value = value * (1.0 - adjusted_contrast) + mid_curve * adjusted_contrast;
            }
        }
    }
    if quantize > 0.0 {
        let centered = value - 0.5;
        let sep_factor = 1.0 + quantize * 12.0;
        value = 1.0 / (1.0 + (-centered * sep_factor).exp());
    }
    value.clamp(0.0, 1.0)
}

pub fn sample_analytic(
    p: &Params,
    x: f32,
    y: f32,
    time: f32,
    rotation: f32,
    bias_x: f32,
    bias_y: f32,
) -> f32 {
    let (px, py, cx, cy) = process_xy(x, y, p, time, rotation, bias_x, bias_y);
    let raw = pattern_value(p.turb_pattern, px, py, cx, cy, p, time);
    apply_phase(raw, p, time)
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analytic_checkerboard_matches_javascript_phase() {
        let mut p = Params::default();
        p.turb_pattern = pattern::CHECKERBOARD;
        p.turb_freq = 2.0;
        p.turb_speed = 0.0;
        p.turb_scale = 1.0;
        p.turb_contrast = 0.0;
        p.turb_separation = 0.0;
        p.turb_blur = 0.0;
        p.turb_pull = 0.5;
        p.turb_offset_x = 0.0;
        p.turb_offset_y = 0.0;
        p.turb_phase = 0.0;
        p.turb_amplitude = 1.0;
        p.boundary_shape = crate::params::boundary_shape::CIRCULAR;
        let x = 0.35_f32;
        let y = 0.40_f32;
        let raw = (x * 2.0).sin() * (y * 2.0).sin();
        let expected = (raw * std::f32::consts::TAU).sin();
        let got = sample_analytic(&p, x, y, 0.0, 0.0, 0.0, 0.0);
        assert!(
            (got - expected).abs() < 1e-5,
            "analytic checkerboard {got} expected {expected}"
        );
    }

    #[test]
    fn bilinear_sample_reads_cell_center() {
        let mut grid = vec![0.0; 4];
        grid[0] = 1.0;
        grid[1] = 2.0;
        grid[2] = 3.0;
        grid[3] = 4.0;
        let v = bilinear_sample(&grid, 2, 0.25, 0.25);
        assert!((v - 1.0).abs() < 1e-5, "cell center should return that cell, got {v}");
    }

    #[test]
    fn checkerboard_matches_sines_and_differs_from_waves() {
        let mut p = Params::default();
        p.turb_freq = 2.0;
        let x = 0.3;
        let y = 0.2;
        let checker = pattern_value(pattern::CHECKERBOARD, x, y, 0.5, 0.5, &p, 0.0);
        let expected = (x * 2.0).sin() * (y * 2.0).sin();
        assert!((checker - expected).abs() < 1e-6);
        let waves = pattern_value(pattern::WAVES, x, y, 0.5, 0.5, &p, 0.0);
        assert!((checker - waves).abs() > 1e-4);
        let spiral = pattern_value(pattern::SPIRAL, x, y, 0.5, 0.5, &p, 0.0);
        let bubbles = pattern_value(pattern::BUBBLES, x, y, 0.5, 0.5, &p, 1.0);
        assert!(spiral.is_finite() && bubbles.is_finite());
    }

    #[test]
    fn contrast_stays_in_range_and_symmetry_and_warp_move_coordinates() {
        let mut p = Params::default();
        p.turb_contrast = 0.5;
        p.turb_pull = 0.0;
        p.turb_separation = 0.0;
        let c = apply_contrast(0.2, &p);
        assert!((0.0..=1.0).contains(&c));
        assert!((c - 0.2).abs() > 1e-4);

        p.turb_symmetry = 1.0;
        let (sx, sy) = symmetry(0.8, 0.7, p.turb_symmetry, 0.5, 0.5);
        assert!((sx - 0.8).abs() > 1e-4 || (sy - 0.7).abs() > 1e-4);

        p.turb_warp = 0.25;
        p.turb_speed = 0.0;
        let (wx, wy) = domain_warp(0.3, 0.4, &p, 0.0, 0.5, 0.5);
        assert!((wx - 0.3).abs() > 1e-4 || (wy - 0.4).abs() > 1e-4);
    }

    /// Default browser preset: Checkerboard, scale 3, freq 2, blur 0.8, Size on.
    /// Size mapping needs a field that still reaches near ±1 after blur.
    #[test]
    fn default_checkerboard_field_keeps_size_contrast() {
        let mut p = Params::default();
        p.turb_strength = 4.0;
        p.turb_scale = 3.0;
        p.turb_speed = 1.0;
        p.turb_pull = 1.0;
        p.turb_freq = 2.0;
        p.turb_pattern = pattern::CHECKERBOARD;
        p.turb_contrast = 0.5;
        p.turb_blur = 0.8;
        p.turb_phase_speed = -1.0;
        p.turb_offset_x = 0.5;
        p.turb_offset_y = -0.5;
        p.turb_affect_scale = true;
        p.turb_min_scale = 0.008;
        p.turb_max_scale = 0.03;

        let mut field = vec![0.0; FIELD_AREA];
        let mut aux = vec![0.0; FIELD_AREA];
        fill_field(&mut field, &mut aux, &p, 0.25, 0.0, 0.0, 0.0);

        let mut min_v = f32::INFINITY;
        let mut max_v = f32::NEG_INFINITY;
        for &v in field.iter().take(FIELD_AREA) {
            min_v = min_v.min(v);
            max_v = max_v.max(v);
        }
        let span = max_v - min_v;
        assert!(
            span > 1.0,
            "checkerboard field washed out: min={min_v} max={max_v} span={span}"
        );

        assert!((radius_from_noise(-1.0, 0.008, 0.03) - 0.008).abs() < 1e-5);
        assert!((radius_from_noise(0.0, 0.008, 0.03) - 0.008).abs() < 1e-5);
        assert!((radius_from_noise(0.5, 0.008, 0.03) - 0.019).abs() < 1e-5);
        assert!((radius_from_noise(1.0, 0.008, 0.03) - 0.03).abs() < 1e-5);

        let mut min_r = f32::INFINITY;
        let mut max_r = f32::NEG_INFINITY;
        for y in [0.2_f32, 0.35, 0.5, 0.65, 0.8] {
            for x in [0.2_f32, 0.35, 0.5, 0.65, 0.8] {
                let n = bilinear_sample(&field, FIELD_N, x, y);
                let r = radius_from_noise(n, p.turb_min_scale, p.turb_max_scale);
                min_r = min_r.min(r);
                max_r = max_r.max(r);
            }
        }
        let size_span = max_r - min_r;
        assert!(
            size_span > 0.015,
            "size should use T-Min..T-Max (~0.008..0.03), got min={min_r} max={max_r} span={size_span}"
        );
    }

    /// `TurbulenceField.noise2D(x, y, 0, true)` on checkerboard, scale 3, freq 2,
    /// speed 1, phase speed -1, offset (0.5, -0.5). The old tent blur missed
    /// these by up to 0.42.
    #[test]
    fn blur_ring_matches_javascript_noise2d() {
        let plain = [
            (0.1_f32, 0.1_f32, 0.270638_f32),
            (0.4, 0.4, 0.733312),
            (0.2, 0.3, -0.611283),
            (0.5, 0.5, 0.0),
            (0.8, 0.2, 0.441957),
        ];
        let shaped = [
            (0.1_f32, 0.1_f32, 0.364667_f32),
            (0.3, 0.3, -0.874745),
            (0.7, 0.3, 0.999542),
            (0.5, 0.5, -0.171720),
            (0.4, 0.6, -0.876336),
        ];
        check_blur_samples(0.0, 0.0, &plain, 5e-3);
        // Pull and contrast pinch the edge to about one cell, so gathering it
        // back off the raster cannot match the analytic ring sample for sample.
        check_blur_samples(0.5, 1.0, &shaped, 0.1);
    }

    #[test]
    fn blur_zero_keeps_the_phase_sample() {
        let mut p = Params::default();
        p.turb_pattern = pattern::CHECKERBOARD;
        p.turb_freq = 2.0;
        p.turb_scale = 3.0;
        p.turb_speed = 1.0;
        p.turb_phase_speed = -1.0;
        p.turb_offset_x = 0.5;
        p.turb_offset_y = -0.5;
        p.turb_blur = 0.0;
        p.turb_contrast = 0.5;
        p.turb_pull = 1.0;
        p.turb_separation = 0.8;
        let mut field = vec![0.0; FIELD_AREA];
        let mut aux = vec![0.0; FIELD_AREA];
        fill_field(&mut field, &mut aux, &p, 0.0, 0.0, 0.0, 0.0);
        let raw = sample_analytic(&p, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0);
        assert!(
            (raw - 0.271437).abs() < 1e-4,
            "phase sample {raw} drifted from JavaScript noise2D"
        );
        let col = 20usize;
        let row = 30usize;
        let x = (col as f32 + 0.5) / FIELD_N as f32;
        let y = (row as f32 + 0.5) / FIELD_N as f32;
        let at_cell = sample_analytic(&p, x, y, 0.0, 0.0, 0.0, 0.0);
        let stored = field[row * FIELD_N + col];
        assert!(
            (stored - at_cell).abs() < 1e-5,
            "blur 0 must not run contrast/quantize, stored={stored} phase={at_cell}"
        );
    }

    fn check_blur_samples(contrast: f32, pull: f32, samples: &[(f32, f32, f32)], grid_tol: f32) {
        let mut p = Params::default();
        p.turb_pattern = pattern::CHECKERBOARD;
        p.turb_freq = 2.0;
        p.turb_scale = 3.0;
        p.turb_speed = 1.0;
        p.turb_phase_speed = -1.0;
        p.turb_offset_x = 0.5;
        p.turb_offset_y = -0.5;
        p.turb_blur = 0.8;
        p.turb_contrast = contrast;
        p.turb_pull = pull;
        let mut field = vec![0.0; FIELD_AREA];
        let mut aux = vec![0.0; FIELD_AREA];
        fill_field(&mut field, &mut aux, &p, 0.0, 0.0, 0.0, 0.0);
        let mut worst = 0.0_f32;
        let mut worst_at = (0.0_f32, 0.0_f32);
        for &(x, y, expected) in samples {
            let direct = sample_blurred(&p, x, y, 0.0, 0.0, 0.0, 0.0);
            assert!(
                (direct - expected).abs() < 1e-4,
                "ring ({x},{y}) {direct} expected {expected}"
            );
            let got = bilinear_sample(&field, FIELD_N, x, y);
            let err = (got - expected).abs();
            if err > worst {
                worst = err;
                worst_at = (x, y);
            }
        }
        for row in (4..FIELD_N).step_by(8) {
            for col in (4..FIELD_N).step_by(8) {
                let x = (col as f32 + 0.5) / FIELD_N as f32;
                let y = (row as f32 + 0.5) / FIELD_N as f32;
                let direct = sample_blurred(&p, x, y, 0.0, 0.0, 0.0, 0.0);
                let err = (field[row * FIELD_N + col] - direct).abs();
                if err > worst {
                    worst = err;
                    worst_at = (x, y);
                }
            }
        }
        assert!(
            worst < grid_tol,
            "gathered blur at ({}, {}) misses the ring by {worst} (limit {grid_tol})",
            worst_at.0, worst_at.1
        );
    }

    /// Rings stay the phase fold of the drop. T-Pull steers on a ripple and
    /// leaves still water alone, and the slider does not repaint the noise.
    #[test]
    fn classic_drop_pull_follows_rings_without_repainting() {
        let mut p = Params::default();
        p.turb_pattern = pattern::CLASSIC_DROP;
        p.turb_freq = 2.0;
        p.turb_speed = 0.0;
        p.turb_scale = 3.0;
        p.turb_blur = 0.8;
        p.turb_phase = 0.0;
        p.turb_phase_speed = -1.0;
        p.turb_amplitude = 1.0;
        p.turb_offset_x = 0.0;
        p.turb_offset_y = 0.0;
        p.turb_pull = 1.0;
        p.turb_contrast = 0.0;
        p.turb_separation = 0.0;
        p.turb_affect_position = true;
        p.turb_strength = 4.0;
        p.boundary_shape = crate::params::boundary_shape::CIRCULAR;

        let mut neg = vec![0.0_f32; FIELD_AREA];
        let mut pos = vec![0.0_f32; FIELD_AREA];
        let mut aux = vec![0.0_f32; FIELD_AREA];
        p.turb_pull = -1.0;
        fill_field(&mut neg, &mut aux, &p, 0.0, 0.0, 0.0, 0.0);
        p.turb_pull = 1.0;
        fill_field(&mut pos, &mut aux, &p, 0.0, 0.0, 0.0, 0.0);
        let mut worst = 0.0_f32;
        for i in 0..FIELD_AREA {
            worst = worst.max((neg[i] - pos[i]).abs());
        }
        assert!(
            worst < 1e-4,
            "T-Pull rewrites classic drop noise by {worst}"
        );

        p.turb_pattern = pattern::CHECKERBOARD;
        p.turb_pull = -1.0;
        fill_field(&mut neg, &mut aux, &p, 0.0, 0.0, 0.0, 0.0);
        p.turb_pull = 1.0;
        fill_field(&mut pos, &mut aux, &p, 0.0, 0.0, 0.0, 0.0);
        let mut board = 0.0_f32;
        for i in 0..FIELD_AREA {
            board = board.max((neg[i] - pos[i]).abs());
        }
        assert!(
            board > 0.05,
            "pull reshape left checkerboard unchanged, diff {board}"
        );

        p.turb_pattern = pattern::CLASSIC_DROP;
        p.turb_blur = 0.0;
        p.turb_pull = 1.0;
        let n = 24;
        let dt = 1.0;
        let mut site = (0.5_f32, 0.5_f32);
        let mut best = 0.0_f32;
        let mut quiet = 0.0_f32;
        let mut saw_ripple = false;
        let mut saw_still = false;
        for iy in 1..n - 1 {
            for ix in 1..n - 1 {
                let x = (ix as f32 + 0.5) / n as f32;
                let y = (iy as f32 + 0.5) / n as f32;
                let (px, py, cx, cy) = process_xy(x, y, &p, 0.0, 0.0, 0.0, 0.0);
                let raw = pattern_value(pattern::CLASSIC_DROP, px, py, cx, cy, &p, 0.0);
                let (vx, vy, _) = sample_force(&[], x, y, 0.0, 0.0, dt, &p, 0.0, 0.0, 0.0, 0.0);
                let speed = (vx * vx + vy * vy).sqrt();
                if raw > 0.08 {
                    saw_ripple = true;
                    if speed > best {
                        best = speed;
                        site = (x, y);
                    }
                } else if raw < 0.05 {
                    saw_still = true;
                    quiet = quiet.max(speed);
                }
            }
        }
        assert!(saw_ripple && saw_still, "need a ripple and still water in the sample");
        assert!(best > 1.0, "T-Pull does not steer the ring, max speed {best}");
        assert!(quiet < 1e-4, "T-Pull still shoves still water at {quiet}");
        let (ax, ay, _) = sample_force(&[], site.0, site.1, 0.0, 0.0, dt, &p, 0.0, 0.0, 0.0, 0.0);
        p.turb_pull = -0.25;
        let (bx, by, _) = sample_force(&[], site.0, site.1, 0.0, 0.0, dt, &p, 0.0, 0.0, 0.0, 0.0);
        let same_way = ax * bx + ay * by;
        assert!(
            same_way < 0.0,
            "negative T-Pull should reverse the shove, dot {same_way}"
        );
    }
}
