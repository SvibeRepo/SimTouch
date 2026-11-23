//! Turbulence dispatch, coordinate chain, and the 128² field.
//! Pattern formulas live in `patterns/`. Blur, contrast, warp, phase, symmetry,
//! and force live in `pattern_control/`. Offset, scale, and rotation stay here.
//! Blur 0 stores the phase sample and skips contrast. Above 0, contrast runs on
//! that sample and the JavaScript ring is gathered from the raster.

use super::pattern_control::blur::gather_blur;
use super::pattern_control::contrast::pull_reshape;
use super::pattern_control::phase::apply_phase;
use super::patterns;
use crate::config::params::{pattern, Params};

pub use super::pattern_control::contrast::apply_contrast;
pub use super::pattern_control::domain_warp::domain_warp;
pub use super::pattern_control::force::{radius_from_noise, sample_force};
pub use super::pattern_control::symmetry::symmetry;

#[cfg(test)]
pub(crate) use super::pattern_control::blur::sample_blurred;

pub const FIELD_N: usize = 128;
pub const FIELD_AREA: usize = FIELD_N * FIELD_N;

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

fn needs_reshape(p: &Params) -> bool {
    pull_reshape(p) != 0.0 || p.turb_contrast > 0.0 || p.turb_separation > 0.0
}

/// Phase sample in [0, 1], with pullReshape / contrast / quantize only when each is off zero.
pub(crate) fn reshape_sample(
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
    if p.boundary_shape != crate::config::params::boundary_shape::RECTANGULAR {
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

pub fn pattern_value(kind: u8, x: f32, y: f32, cx: f32, cy: f32, p: &Params, time: f32) -> f32 {
    let freq = p.turb_freq;
    match kind {
        pattern::WAVES => patterns::waves::value(x, y, cx, cy, freq, p, time),
        pattern::SPIRAL => patterns::spiral::value(x, y, cx, cy, freq, p, time),
        pattern::GRID => patterns::grid::value(x, y, cx, cy, freq, p, time),
        pattern::CIRCLES => patterns::circles::value(x, y, cx, cy, freq, p, time),
        pattern::DIAMONDS => patterns::diamonds::value(x, y, cx, cy, freq, p, time),
        pattern::RIPPLES => patterns::ripples::value(x, y, cx, cy, freq, p, time),
        pattern::DOTS => patterns::dots::value(x, y, cx, cy, freq, p, time),
        pattern::WATER => patterns::water::value(x, y, cx, cy, freq, p, time),
        pattern::CLASSIC_DROP => patterns::classic_drop::value(x, y, cx, cy, freq, p, time),
        pattern::CELLS => patterns::cells::value(x, y, cx, cy, freq, p, time),
        pattern::VORONOI => patterns::voronoi::value(x, y, cx, cy, freq, p, time),
        pattern::FRACTAL => patterns::fractal::value(x, y, cx, cy, freq, p, time),
        pattern::VORTEX => patterns::vortex::value(x, y, cx, cy, freq, p, time),
        pattern::BUBBLES => patterns::bubbles::value(x, y, cx, cy, freq, p, time),
        pattern::SPLINE => patterns::spline::value(x, y, cx, cy, freq),
        _ => patterns::checkerboard::value(x, y, cx, cy, freq, p, time),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spline_index_is_15_and_empty_store_returns_0_without_changing_checkerboard() {
        use crate::particles::turbulences::patterns::spline;
        let mut p = Params::default();
        p.turb_freq = 2.0;
        spline::set_buffer(&[]);
        p.turb_pattern = pattern::SPLINE;
        let got = pattern_value(pattern::SPLINE, 0.5, 0.5, 0.5, 0.5, &p, 0.0);
        assert!(got.abs() < 1e-6, "empty spline {got}");
        let checker = pattern_value(pattern::CHECKERBOARD, 0.3, 0.2, 0.5, 0.5, &p, 0.0);
        let expected = (0.3_f32 * 2.0).sin() * (0.2_f32 * 2.0).sin();
        assert!((checker - expected).abs() < 1e-6);
        assert_eq!(pattern::SPLINE, 15);
    }

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
        p.boundary_shape = crate::config::params::boundary_shape::CIRCULAR;
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
        p.boundary_shape = crate::config::params::boundary_shape::CIRCULAR;

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

    /// Time one 128² fill and 500 direct samples for every pattern.
    /// Lab defaults: frequency 2, blur 0. Prints only; it does not assert a budget.
    ///
    /// `cargo test --release bench_pattern_fills -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench_pattern_fills() {
        use std::time::Instant;
        let names = [
            (pattern::CHECKERBOARD, "checkerboard"),
            (pattern::WAVES, "waves"),
            (pattern::SPIRAL, "spiral"),
            (pattern::GRID, "grid"),
            (pattern::CIRCLES, "circles"),
            (pattern::DIAMONDS, "diamonds"),
            (pattern::RIPPLES, "ripples"),
            (pattern::DOTS, "dots"),
            (pattern::WATER, "water"),
            (pattern::CLASSIC_DROP, "classic drop"),
            (pattern::CELLS, "cells"),
            (pattern::VORONOI, "voronoi"),
            (pattern::FRACTAL, "fractal"),
            (pattern::VORTEX, "vortex"),
            (pattern::BUBBLES, "bubbles"),
        ];
        let frames = 20u32;
        for (kind, name) in names {
            let mut p = Params::default();
            p.turb_pattern = kind;
            p.turb_freq = 2.0;
            p.turb_speed = 1.0;
            p.turb_scale = 3.0;
            p.turb_blur = 0.0;
            p.turb_phase_speed = -1.0;
            let mut field = vec![0.0; FIELD_AREA];
            let mut aux = vec![0.0; FIELD_AREA];
            let start = Instant::now();
            for i in 0..frames {
                fill_field(&mut field, &mut aux, &p, i as f32 * 0.016, 0.0, 0.0, 0.0);
            }
            let fill = start.elapsed().as_secs_f64() * 1000.0 / frames as f64;
            let start = Instant::now();
            let mut sink = 0.0f32;
            for frame in 0..frames {
                let time = frame as f32 * 0.016;
                for i in 0..500 {
                    sink += sample_analytic(
                        &p,
                        (i % 25) as f32 / 25.0,
                        (i / 25) as f32 / 20.0,
                        time,
                        0.0,
                        0.0,
                        0.0,
                    );
                }
            }
            std::hint::black_box(sink);
            let samples = start.elapsed().as_secs_f64() * 1000.0 / frames as f64;
            eprintln!("[pattern-bench] {name:14} grid {fill:5.2} ms | 500 samples {samples:5.2} ms");
        }
    }

    /// 3000 particles, particle-class Noise. Lab defaults otherwise.
    /// Prints a step with pieces switched off, plus the theme pass.
    ///
    /// `cargo test --release bench_particle_noise_frame -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench_particle_noise_frame() {
        use crate::grid::{MODE_NOISE, MODE_PROXIMITY};
        use crate::particles::core::ParticleSystem;
        use std::f32::consts::TAU;
        use std::time::Instant;

        fn spread(ps: &mut ParticleSystem, n: usize) {
            let rings = (n as f32).sqrt().ceil() as usize;
            let per = ((n as f32) / rings as f32).ceil() as usize;
            let spawn = 0.5 * 0.95;
            let mut i = 0usize;
            for ring in 0..rings {
                if i >= n {
                    break;
                }
                let radius = spawn * (ring + 1) as f32 / rings as f32;
                let count = ((per * (ring + 1)) / 2).min(n - i).max(1);
                for k in 0..count {
                    let ang = k as f32 / count as f32 * TAU;
                    ps.x[i] = 0.5 + ang.cos() * radius;
                    ps.y[i] = 0.5 + ang.sin() * radius;
                    i += 1;
                }
            }
        }

        fn lab(kind: u8, blur: f32) -> Params {
            let mut p = Params::default();
            p.collision_enabled = true;
            p.collision_grid = 10;
            p.collision_repulsion = 0.5;
            p.collision_restitution = 0.8;
            p.boundary_damping = 0.8;
            p.boundary_restitution = 1.0;
            p.turb_strength = 4.0;
            p.turb_scale = 3.0;
            p.turb_speed = 1.0;
            p.turb_pull = 1.0;
            p.turb_freq = 2.0;
            p.turb_pattern = kind;
            p.turb_contrast = 0.5;
            p.turb_blur = blur;
            p.turb_phase_speed = -1.0;
            p.turb_affect_scale = true;
            p.turb_min_scale = 0.008;
            p.turb_max_scale = 0.03;
            p.flip_ratio = 0.0;
            p.flip_iterations = 20;
            p.flip_grid = 32;
            p.render_width = 960.0;
            p.render_height = 960.0;
            p
        }

        fn frames(label: &str, kind: u8, blur: f32, mode: u32, collision: bool, flip: f32) -> f64 {
            let n = 3000usize;
            let mut ps = ParticleSystem::new(n);
            ps.set_count(n);
            ps.set_grid_mode(mode);
            ps.params = lab(kind, blur);
            ps.params.collision_enabled = collision;
            ps.params.flip_ratio = flip;
            spread(&mut ps, n);
            for _ in 0..5 {
                ps.step(1.0 / 60.0);
            }
            let start = Instant::now();
            let frames = 30u32;
            for _ in 0..frames {
                ps.step(1.0 / 60.0);
            }
            let step_ms = start.elapsed().as_secs_f64() * 1000.0 / frames as f64;
            let start = Instant::now();
            for _ in 0..frames {
                ps.particle_eval(MODE_NOISE, 1.0, 1.0);
            }
            let theme_ms = start.elapsed().as_secs_f64() * 1000.0 / frames as f64;
            eprintln!("[particle-bench] {label:28} step {step_ms:5.2} ms | noise theme {theme_ms:5.2} ms");
            step_ms
        }

        frames("checker blur0 noise", pattern::CHECKERBOARD, 0.0, MODE_NOISE, true, 0.0);
        frames("checker blur0 proximity", pattern::CHECKERBOARD, 0.0, MODE_PROXIMITY, true, 0.0);
        frames("checker no collision", pattern::CHECKERBOARD, 0.0, MODE_NOISE, false, 0.0);
        frames("checker flip off", pattern::CHECKERBOARD, 0.0, MODE_NOISE, true, -1.0);
        frames("checker blur0.8 noise", pattern::CHECKERBOARD, 0.8, MODE_NOISE, true, 0.0);
        frames("classic blur0 noise", pattern::CLASSIC_DROP, 0.0, MODE_NOISE, true, 0.0);
        frames("classic blur0.8 noise", pattern::CLASSIC_DROP, 0.8, MODE_NOISE, true, 0.0);
    }
}
