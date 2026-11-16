//! Fixed-capacity collision bins: a count per cell plus one particle-index list.

use crate::metric::collision_scales;
use crate::params::Params;

pub const MAX_GRID: usize = 32;
pub const MAX_CELLS: usize = MAX_GRID * MAX_GRID;

pub struct CollisionBins {
    pub counts: Vec<u32>,
    pub starts: Vec<u32>,
    pub cursor: Vec<u32>,
    pub indices: Vec<u32>,
}

impl CollisionBins {
    pub fn new(particle_cap: usize) -> Self {
        Self {
            counts: vec![0; MAX_CELLS],
            starts: vec![0; MAX_CELLS],
            cursor: vec![0; MAX_CELLS],
            indices: vec![0; particle_cap],
        }
    }

    /// Clear by resetting counts, then pack particle indices. No allocation.
    /// Positions are binned in the framebuffer metric (`x * sx`, `y * sy`).
    pub fn rebuild(
        &mut self,
        x: &[f32],
        y: &[f32],
        count: usize,
        grid: usize,
        sx: f32,
        sy: f32,
    ) {
        let grid = grid.clamp(1, MAX_GRID);
        let cells = grid * grid;
        for c in self.counts.iter_mut().take(cells) {
            *c = 0;
        }
        let n = count.min(x.len()).min(y.len()).min(self.indices.len());
        for i in 0..n {
            if let Some(cell) = cell_of(x[i] * sx, y[i] * sy, grid) {
                self.counts[cell] += 1;
            }
        }
        let mut sum = 0u32;
        for cell in 0..cells {
            self.starts[cell] = sum;
            self.cursor[cell] = sum;
            sum += self.counts[cell];
        }
        for i in 0..n {
            if let Some(cell) = cell_of(x[i] * sx, y[i] * sy, grid) {
                let slot = self.cursor[cell] as usize;
                if slot < self.indices.len() {
                    self.indices[slot] = i as u32;
                    self.cursor[cell] += 1;
                }
            }
        }
    }
}

fn cell_of(x: f32, y: f32, grid: usize) -> Option<usize> {
    if !(0.0..1.0).contains(&x) || !(0.0..1.0).contains(&y) {
        return None;
    }
    let cx = (x * grid as f32).floor() as usize;
    let cy = (y * grid as f32).floor() as usize;
    if cx >= grid || cy >= grid {
        return None;
    }
    Some(cy * grid + cx)
}

pub fn resolve(
    bins: &CollisionBins,
    x: &mut [f32],
    y: &mut [f32],
    vx: &mut [f32],
    vy: &mut [f32],
    radii: &[f32],
    count: usize,
    grid: usize,
    p: &Params,
    affect_scale: bool,
) {
    if !p.collision_enabled {
        return;
    }
    let grid = grid.clamp(1, MAX_GRID);
    let n = count.min(x.len()).min(y.len());
    let spacing = if p.rest_density > 0.0 {
        1.0 + p.rest_density * 0.05
    } else {
        1.0
    };
    let (sx, sy) = collision_scales(p.boundary_shape, p.render_width, p.render_height);
    for cy in 0..grid {
        for cx in 0..grid {
            let cell = cy * grid + cx;
            let start = bins.starts[cell] as usize;
            let len = bins.counts[cell] as usize;
            for a in 0..len {
                let i = bins.indices[start + a] as usize;
                if i >= n {
                    continue;
                }
                for b in (a + 1)..len {
                    let j = bins.indices[start + b] as usize;
                    pair(i, j, x, y, vx, vy, radii, p, affect_scale, spacing, sx, sy);
                }
                stamp_neighbor(
                    bins, cx + 1, cy, grid, i, x, y, vx, vy, radii, p, affect_scale, spacing, n, sx, sy,
                );
                stamp_neighbor(
                    bins, cx, cy + 1, grid, i, x, y, vx, vy, radii, p, affect_scale, spacing, n, sx, sy,
                );
                stamp_neighbor(
                    bins, cx + 1, cy + 1, grid, i, x, y, vx, vy, radii, p, affect_scale, spacing, n, sx, sy,
                );
            }
        }
    }
}

fn stamp_neighbor(
    bins: &CollisionBins,
    cx: usize,
    cy: usize,
    grid: usize,
    i: usize,
    x: &mut [f32],
    y: &mut [f32],
    vx: &mut [f32],
    vy: &mut [f32],
    radii: &[f32],
    p: &Params,
    affect_scale: bool,
    spacing: f32,
    n: usize,
    sx: f32,
    sy: f32,
) {
    if cx >= grid || cy >= grid {
        return;
    }
    let cell = cy * grid + cx;
    let start = bins.starts[cell] as usize;
    let len = bins.counts[cell] as usize;
    for k in 0..len {
        let j = bins.indices[start + k] as usize;
        if j < n {
            pair(i, j, x, y, vx, vy, radii, p, affect_scale, spacing, sx, sy);
        }
    }
}

fn pair(
    i: usize,
    j: usize,
    x: &mut [f32],
    y: &mut [f32],
    vx: &mut [f32],
    vy: &mut [f32],
    radii: &[f32],
    p: &Params,
    affect_scale: bool,
    spacing: f32,
    sx: f32,
    sy: f32,
) {
    if i == j {
        return;
    }
    let dx = x[j] - x[i];
    let dy = y[j] - y[i];
    let sdx = dx * sx;
    let sdy = dy * sy;
    let dist_sq = sdx * sdx + sdy * sdy;
    let ri = if affect_scale {
        radii[i]
    } else {
        p.particle_radius
    };
    let rj = if affect_scale {
        radii[j]
    } else {
        p.particle_radius
    };
    let min_dist = (ri + rj) * spacing;
    let min_sq = min_dist * min_dist;
    if dist_sq >= min_sq || dist_sq < 1e-12 || min_dist <= 0.0 {
        return;
    }
    let dist = dist_sq.sqrt();
    let nx = sdx / dist;
    let ny = sdy / dist;
    let overlap = min_dist - dist;
    let repulsion = (overlap / min_dist).powf(1.5) * p.collision_repulsion;
    // Push back into sim units: scaled impulse / scale.
    let rx = nx * repulsion / sx;
    let ry = ny * repulsion / sy;
    vx[i] -= rx;
    vy[i] -= ry;
    vx[j] += rx;
    vy[j] += ry;
    let rel_x = (vx[j] - vx[i]) * sx;
    let rel_y = (vy[j] - vy[i]) * sy;
    let vn = rel_x * nx + rel_y * ny;
    if vn < 0.0 {
        let restitution = p.collision_restitution * (1.0 - overlap / min_dist);
        let impulse = -(1.0 + restitution) * vn * 0.5;
        vx[i] -= nx * impulse / sx;
        vy[i] -= ny * impulse / sy;
        vx[j] += nx * impulse / sx;
        vy[j] += ny * impulse / sy;
    }
    let correction = (overlap - min_dist * 0.1).max(0.0) * 0.5;
    x[i] -= nx * correction / sx;
    y[i] -= ny * correction / sy;
    x[j] += nx * correction / sx;
    y[j] += ny * correction / sy;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::params::{boundary_shape, Params};

    #[test]
    fn bin_insert_records_particle_index() {
        let mut bins = CollisionBins::new(8);
        let x = [0.15f32];
        let y = [0.25f32];
        let grid = 10usize;
        bins.rebuild(&x, &y, 1, grid, 1.0, 1.0);
        let cell_x = (0.15f32 * 10.0).floor() as usize;
        let cell_y = (0.25f32 * 10.0).floor() as usize;
        let cell = cell_y * grid + cell_x;
        assert_eq!(cell_x, 1);
        assert_eq!(cell_y, 2);
        assert_eq!(bins.counts[cell], 1);
        let slot = bins.starts[cell] as usize;
        assert_eq!(bins.indices[slot], 0);
    }

    #[test]
    fn bin_insert_skips_out_of_range() {
        let mut bins = CollisionBins::new(4);
        let x = [1.2f32, 0.5];
        let y = [0.5f32, 0.5];
        bins.rebuild(&x, &y, 2, 10, 1.0, 1.0);
        let mut total = 0u32;
        for c in bins.counts.iter().take(100) {
            total += *c;
        }
        assert_eq!(total, 1);
    }

    fn contact_dx(p: &Params, affect_scale: bool) -> f32 {
        let mut x = [0.40f32, 0.42];
        let mut y = [0.50f32, 0.50];
        let mut vx = [0.0f32; 2];
        let mut vy = [0.0f32; 2];
        let radii = [p.particle_radius; 2];
        let mut bins = CollisionBins::new(4);
        let (sx, sy) = collision_scales(p.boundary_shape, p.render_width, p.render_height);
        for _ in 0..40 {
            bins.rebuild(&x, &y, 2, p.collision_grid, sx, sy);
            resolve(
                &bins,
                &mut x,
                &mut y,
                &mut vx,
                &mut vy,
                &radii,
                2,
                p.collision_grid,
                p,
                affect_scale,
            );
        }
        (x[1] - x[0]).abs()
    }

    #[test]
    fn square_render_separates_to_soft_contact() {
        let mut p = Params::default();
        p.collision_enabled = true;
        p.collision_grid = 10;
        p.particle_radius = 0.01;
        p.rest_density = 2.0;
        p.collision_repulsion = 2.0;
        p.boundary_shape = boundary_shape::RECTANGULAR;
        p.render_width = 960.0;
        p.render_height = 960.0;
        let spacing = 1.0 + p.rest_density * 0.05;
        let min_dist = (p.particle_radius + p.particle_radius) * spacing;
        // Soft correction stops around overlap = 0.1 * min_dist.
        let rest = min_dist * 0.9;
        let dx = contact_dx(&p, false);
        assert!(
            (dx - rest).abs() < 0.002,
            "square contact dx {dx} should be near soft rest {rest}"
        );
    }

    #[test]
    fn tall_render_doubles_horizontal_gap() {
        let mut square = Params::default();
        square.collision_enabled = true;
        square.collision_grid = 10;
        square.particle_radius = 0.01;
        square.rest_density = 2.0;
        square.collision_repulsion = 2.0;
        square.boundary_shape = boundary_shape::RECTANGULAR;
        square.render_width = 960.0;
        square.render_height = 960.0;
        let mut tall = square.clone();
        tall.render_width = 480.0;
        tall.render_height = 960.0;
        let dx_square = contact_dx(&square, false);
        let dx_tall = contact_dx(&tall, false);
        assert!(
            (dx_tall / dx_square - 2.0).abs() < 0.05,
            "tall/square gap ratio {} should be near 2",
            dx_tall / dx_square
        );
    }
}
