//! PIC/FLIP on a fixed collocated grid. Width defaults to 32.
//!
//! Transfer matches the browser `FluidFLIP`: nearest-cell splat and sample.
//! The JS solver computed pressure but multiplied the gradient by an undefined
//! `pressureScale`, which NaN'd grid velocities and then read back as 0 via
//! `value || 0`. That made PicFlipRatio=1 freeze particles. We keep the
//! Poisson solve for future tuning but default the velocity pressure scale to
//! 0 so isolated particles keep gravity and mouse impulses (identity PIC).

use crate::params::{boundary_shape, Params};

pub const FLIP_MAX: usize = 32;
pub const FLIP_AREA: usize = FLIP_MAX * FLIP_MAX;

pub struct FlipGrid {
    pub u: Vec<f32>,
    pub v: Vec<f32>,
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
            weight: vec![0.0; FLIP_AREA],
            pressure: vec![0.0; FLIP_AREA],
            divergence: vec![0.0; FLIP_AREA],
            solid: vec![0; FLIP_AREA],
        }
    }
}

fn mark_solid(grid: &mut FlipGrid, n: usize, p: &Params) {
    let h = 1.0 / n as f32;
    for row in 0..n {
        for col in 0..n {
            let x = (col as f32 + 0.5) * h;
            let y = (row as f32 + 0.5) * h;
            let solid = if p.boundary_shape == boundary_shape::RECTANGULAR {
                x < p.rect_min_x || x > p.rect_max_x || y < p.rect_min_y || y > p.rect_max_y
            } else {
                let dx = x - p.boundary_cx;
                let dy = y - p.boundary_cy;
                dx * dx + dy * dy > p.boundary_radius * p.boundary_radius
            };
            grid.solid[row * n + col] = if solid { 1 } else { 0 };
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

fn sample_cell(grid: &FlipGrid, x: f32, y: f32, n: usize) -> (f32, f32) {
    let n_f = n as f32;
    let gx = (x * n_f).floor().clamp(0.0, n_f - 1.0) as usize;
    let gy = (y * n_f).floor().clamp(0.0, n_f - 1.0) as usize;
    let idx = gy * n + gx;
    (grid.u[idx], grid.v[idx])
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
    if p.flip_ratio <= 0.0 || count == 0 {
        return;
    }
    let n = p.flip_grid.clamp(4, FLIP_MAX);
    mark_solid(grid, n, p);
    splat(grid, x, y, vx, vy, count, n);
    solve(grid, n, p, dt);
    let max_v = p.max_velocity;
    for i in 0..count {
        if !(0.0..1.0).contains(&x[i]) || !(0.0..1.0).contains(&y[i]) {
            continue;
        }
        let (grid_vx, grid_vy) = sample_cell(grid, x[i], y[i], n);
        let old_vx = vx[i];
        let old_vy = vy[i];
        let (nx, ny) = if p.flip_ratio >= 1.0 {
            (grid_vx, grid_vy)
        } else if p.flip_ratio <= 0.0 {
            (old_vx + grid_vx, old_vy + grid_vy)
        } else {
            let flip_vx = old_vx + grid_vx;
            let flip_vy = old_vy + grid_vy;
            (
                p.flip_ratio * grid_vx + (1.0 - p.flip_ratio) * flip_vx,
                p.flip_ratio * grid_vy + (1.0 - p.flip_ratio) * flip_vy,
            )
        };
        vx[i] = nx.clamp(-max_v, max_v);
        vy[i] = ny.clamp(-max_v, max_v);
    }
}
