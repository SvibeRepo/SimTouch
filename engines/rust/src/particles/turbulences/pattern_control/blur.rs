use crate::config::params::{pattern, Params};
use crate::particles::turbulences::turbulence_manager::{
    bilinear_sample, reshape_sample, FIELD_AREA, FIELD_N,
};

const TAU: f32 = std::f32::consts::TAU;

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
pub(crate) fn gather_blur(
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
pub(crate) fn sample_blurred(
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
