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

use crate::config::params::{boundary_shape, Params};

pub const FLIP_MAX: usize = 32;
pub const FLIP_AREA: usize = FLIP_MAX * FLIP_MAX;

pub struct VelocityGrid {
    pub u: Vec<f32>,
    pub v: Vec<f32>,
    /// Grid velocity after the splat and before the pressure solve. FLIP adds
    /// only the difference from this snapshot.
    pub(crate) prev_u: Vec<f32>,
    pub(crate) prev_v: Vec<f32>,
    pub weight: Vec<f32>,
    pub pressure: Vec<f32>,
    pub divergence: Vec<f32>,
    pub solid: Vec<u8>,
}

impl VelocityGrid {
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

pub(crate) fn mark_solid(grid: &mut VelocityGrid, n: usize, p: &Params) {
    for row in 0..n {
        for col in 0..n {
            grid.solid[row * n + col] = if cell_outside(col, row, n, p) { 1 } else { 0 };
        }
    }
}

pub(crate) fn splat(grid: &mut VelocityGrid, x: &[f32], y: &[f32], vx: &[f32], vy: &[f32], count: usize, n: usize) {
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

pub(crate) fn solve(grid: &mut VelocityGrid, n: usize, p: &Params, dt: f32) {
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

pub(crate) fn sample_uv(u: &[f32], v: &[f32], x: f32, y: f32, n: usize) -> (f32, f32) {
    let n_f = n as f32;
    let gx = (x * n_f).floor().clamp(0.0, n_f - 1.0) as usize;
    let gy = (y * n_f).floor().clamp(0.0, n_f - 1.0) as usize;
    let idx = gy * n + gx;
    (u[idx], v[idx])
}

