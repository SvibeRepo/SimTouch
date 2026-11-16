//! PIC/FLIP on a fixed collocated grid. Width defaults to 32.
//!
//! The slider is the FLIP fraction. 0 is pure PIC (the cell average). 1 is pure
//! FLIP (the particle keeps its velocity plus the change in the grid). Values
//! in between are `(1 - ratio) * PIC + ratio * FLIP`. About 0.95 is the usual
//! mix: 5% PIC, 95% FLIP. A negative ratio leaves velocities alone.
//!
//! Transfer matches the browser `FluidFLIP`: nearest-cell splat and sample.
//! The pressure gradient stays at scale 0, so an isolated particle's PIC read
//! is its own splatted velocity.

use crate::params::{boundary_shape, Params};

pub const FLIP_MAX: usize = 32;
pub const FLIP_AREA: usize = FLIP_MAX * FLIP_MAX;

pub struct FlipGrid {
    pub u: Vec<f32>,
    pub v: Vec<f32>,
    /// Grid velocity after the splat and before the pressure solve. FLIP adds
    /// only the difference from this snapshot.
    prev_u: Vec<f32>,
    prev_v: Vec<f32>,
    pub weight: Vec<f32>,
    pub pressure: Vec<f32>,
    pub divergence: Vec<f32>,
    pub solid: Vec<u8>,
}

impl FlipGrid {
    pub fn new() -> Self {
        Self {
            u: vec![0.0; FLIP_AREA],
            v: vec![0.0; FLIP_AREA],
            prev_u: vec![0.0; FLIP_AREA],
            prev_v: vec![0.0; FLIP_AREA],
            weight: vec![0.0; FLIP_AREA],
            pressure: vec![0.0; FLIP_AREA],
            divergence: vec![0.0; FLIP_AREA],
            solid: vec![0; FLIP_AREA],
        }
    }
}

/// A cell is solid only when the whole cell sits outside the boundary.
/// Classifying by the cell center marks rim cells solid while a particle
/// center is still inside the circle. PIC then samples a zeroed cell and the
/// particle stops taking gravity, repulsion, and turbulence until something
/// else moves it into a fluid cell.
fn cell_outside(col: usize, row: usize, n: usize, p: &Params) -> bool {
    let n_f = n as f32;
    let min_x = col as f32 / n_f;
    let max_x = (col as f32 + 1.0) / n_f;
    let min_y = row as f32 / n_f;
    let max_y = (row as f32 + 1.0) / n_f;
    if p.boundary_shape == boundary_shape::RECTANGULAR {
        return max_x <= p.rect_min_x
            || min_x >= p.rect_max_x
            || max_y <= p.rect_min_y
            || min_y >= p.rect_max_y;
    }
    let nearest_x = p.boundary_cx.clamp(min_x, max_x);
    let nearest_y = p.boundary_cy.clamp(min_y, max_y);
    let dx = nearest_x - p.boundary_cx;
    let dy = nearest_y - p.boundary_cy;
    dx * dx + dy * dy > p.boundary_radius * p.boundary_radius
}

fn mark_solid(grid: &mut FlipGrid, n: usize, p: &Params) {
    for row in 0..n {
        for col in 0..n {
            grid.solid[row * n + col] = if cell_outside(col, row, n, p) { 1 } else { 0 };
        }
    }
}

fn splat(grid: &mut FlipGrid, x: &[f32], y: &[f32], vx: &[f32], vy: &[f32], count: usize, n: usize) {
    let cells = n * n;
    for i in 0..cells {
        grid.u[i] = 0.0;
        grid.v[i] = 0.0;
        grid.weight[i] = 0.0;
    }
    let n_f = n as f32;
    for i in 0..count {
        let px = x[i];
        let py = y[i];
        if !(0.0..1.0).contains(&px) || !(0.0..1.0).contains(&py) {
            continue;
        }
        let gx = (px * n_f).floor() as usize;
        let gy = (py * n_f).floor() as usize;
        if gx >= n || gy >= n {
            continue;
        }
        let idx = gy * n + gx;
        if grid.solid[idx] != 0 {
            continue;
        }
        grid.u[idx] += vx[i];
        grid.v[idx] += vy[i];
        grid.weight[idx] += 1.0;
    }
    for i in 0..cells {
        if grid.weight[i] > 0.0 {
            grid.u[i] /= grid.weight[i];
            grid.v[i] /= grid.weight[i];
        }
    }
}

fn solve(grid: &mut FlipGrid, n: usize, p: &Params, dt: f32) {
    let h = 1.0 / n as f32;
    for row in 0..n {
        for col in 0..n {
            let center = row * n + col;
            if grid.solid[center] != 0 {
                grid.divergence[center] = 0.0;
                continue;
            }
            let mut div = 0.0;
            if col + 1 < n {
                div += grid.u[center + 1];
            }
            if col > 0 {
                div -= grid.u[center - 1];
            }
            if row + 1 < n {
                div += grid.v[center + n];
            }
            if row > 0 {
                div -= grid.v[center - n];
            }
            grid.divergence[center] = div / h;
        }
    }

    let cells = n * n;
    for i in 0..cells {
        grid.pressure[i] = 0.0;
    }

    let base = dt / (h * h);
    let density = p.flip_gas.powf(1.5) / p.rest_density.max(0.1);
    let pressure_coefficient = base * (density * 0.5).clamp(0.1, 10.0);
    // Match undefined JS `pressureScale`: solve pressure but do not push it onto velocity.
    // Also skip the JS `gasConstant/50` clamp (always 0.8 at the default gas=2), which
    // acted like velocityDamping=0.8 on every PIC readback once velocities were preserved.
    let pressure_scale = 0.0;
    let over = p.flip_overrelax;

    for _ in 0..p.flip_iterations {
        for row in 0..n {
            for col in 0..n {
                let center = row * n + col;
                if grid.solid[center] != 0 {
                    continue;
                }
                let mut sum = 0.0;
                let mut weight = 0.0;
                if col + 1 < n && grid.solid[center + 1] == 0 {
                    sum += grid.pressure[center + 1];
                    weight += 1.0;
                }
                if col > 0 && grid.solid[center - 1] == 0 {
                    sum += grid.pressure[center - 1];
                    weight += 1.0;
                }
                if row + 1 < n && grid.solid[center + n] == 0 {
                    sum += grid.pressure[center + n];
                    weight += 1.0;
                }
                if row > 0 && grid.solid[center - n] == 0 {
                    sum += grid.pressure[center - n];
                    weight += 1.0;
                }
                if weight > 0.0 {
                    let new_p = sum / weight + pressure_coefficient * (-grid.divergence[center]);
                    grid.pressure[center] = grid.pressure[center] * (1.0 - over) + new_p * over;
                }
            }
        }
    }

    if pressure_scale != 0.0 {
        for row in 0..n {
            for col in 0..n {
                let center = row * n + col;
                if col + 1 < n && grid.solid[center] == 0 && grid.solid[center + 1] == 0 {
                    let grad = (grid.pressure[center + 1] - grid.pressure[center]) / h;
                    grid.u[center] -= grad * dt * pressure_scale;
                }
                if row + 1 < n && grid.solid[center] == 0 && grid.solid[center + n] == 0 {
                    let grad = (grid.pressure[center + n] - grid.pressure[center]) / h;
                    grid.v[center + n] -= grad * dt * pressure_scale;
                }
            }
        }
        let gas = (p.flip_gas / 50.0).clamp(0.8, 1.5);
        for i in 0..cells {
            if grid.solid[i] != 0 {
                grid.u[i] = 0.0;
                grid.v[i] = 0.0;
                continue;
            }
            grid.u[i] *= gas;
            grid.v[i] *= gas;
        }
    } else {
        for i in 0..cells {
            if grid.solid[i] != 0 {
                grid.u[i] = 0.0;
                grid.v[i] = 0.0;
            }
        }
    }
}

fn sample_uv(u: &[f32], v: &[f32], x: f32, y: f32, n: usize) -> (f32, f32) {
    let n_f = n as f32;
    let gx = (x * n_f).floor().clamp(0.0, n_f - 1.0) as usize;
    let gy = (y * n_f).floor().clamp(0.0, n_f - 1.0) as usize;
    let idx = gy * n + gx;
    (u[idx], v[idx])
}

pub fn apply(
    grid: &mut FlipGrid,
    x: &[f32],
    y: &[f32],
    vx: &mut [f32],
    vy: &mut [f32],
    count: usize,
    p: &Params,
    dt: f32,
) {
    if p.flip_ratio < 0.0 || count == 0 {
        return;
    }
    let n = p.flip_grid.clamp(4, FLIP_MAX);
    mark_solid(grid, n, p);
    splat(grid, x, y, vx, vy, count, n);
    let cells = n * n;
    grid.prev_u[..cells].copy_from_slice(&grid.u[..cells]);
    grid.prev_v[..cells].copy_from_slice(&grid.v[..cells]);
    solve(grid, n, p, dt);
    let alpha = p.flip_ratio.clamp(0.0, 1.0);
    let max_v = p.max_velocity;
    for i in 0..count {
        if !(0.0..1.0).contains(&x[i]) || !(0.0..1.0).contains(&y[i]) {
            continue;
        }
        let (grid_vx, grid_vy) = sample_uv(&grid.u, &grid.v, x[i], y[i], n);
        let (prev_vx, prev_vy) = sample_uv(&grid.prev_u, &grid.prev_v, x[i], y[i], n);
        let pic_vx = grid_vx;
        let pic_vy = grid_vy;
        let flip_vx = vx[i] + (grid_vx - prev_vx);
        let flip_vy = vy[i] + (grid_vy - prev_vy);
        let nx = (1.0 - alpha) * pic_vx + alpha * flip_vx;
        let ny = (1.0 - alpha) * pic_vy + alpha * flip_vy;
        vx[i] = nx.clamp(-max_v, max_v);
        vy[i] = ny.clamp(-max_v, max_v);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::params::Params;

    fn opposing(ratio: f32) -> (f32, f32) {
        let mut grid = FlipGrid::new();
        let mut p = Params::default();
        p.flip_ratio = ratio;
        p.flip_grid = 32;
        p.boundary_radius = 0.5;
        p.max_velocity = 1.0;
        let x = [0.5_f32, 0.5];
        let y = [0.5_f32, 0.5];
        let mut vx = [0.4_f32, -0.4];
        let mut vy = [0.0_f32, 0.0];
        apply(&mut grid, &x, &y, &mut vx, &mut vy, 2, &p, 1.0 / 60.0);
        (vx[0], vx[1])
    }

    #[test]
    fn slider_blends_pic_at_zero_into_flip_at_one() {
        let (pic_a, pic_b) = opposing(0.0);
        assert!(
            pic_a.abs() < 1e-4 && pic_b.abs() < 1e-4,
            "ratio 0 is PIC, the cell average, got {pic_a} {pic_b}"
        );
        let (mid_a, mid_b) = opposing(0.5);
        assert!(
            (mid_a - 0.2).abs() < 1e-4 && (mid_b + 0.2).abs() < 1e-4,
            "ratio 0.5 is halfway, got {mid_a} {mid_b}"
        );
        let (sweet_a, sweet_b) = opposing(0.95);
        assert!(
            (sweet_a - 0.38).abs() < 1e-4 && (sweet_b + 0.38).abs() < 1e-4,
            "ratio 0.95 is 5% PIC and 95% FLIP, got {sweet_a} {sweet_b}"
        );
        let (flip_a, flip_b) = opposing(1.0);
        assert!(
            (flip_a - 0.4).abs() < 1e-4 && (flip_b + 0.4).abs() < 1e-4,
            "ratio 1 is FLIP and keeps each particle, got {flip_a} {flip_b}"
        );
        let (off_a, off_b) = opposing(-1.0);
        assert!(
            (off_a - 0.4).abs() < 1e-4 && (off_b + 0.4).abs() < 1e-4,
            "a negative ratio leaves velocities alone, got {off_a} {off_b}"
        );
    }
}
