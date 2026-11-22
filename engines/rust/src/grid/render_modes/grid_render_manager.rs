//! Lab grid values. Cell rectangles stay out of the particle step.
//! Mode ids live in `g_shared`. Each cell formula lives in its `g_` file.
//! Circle-rect overlap stays here because the cell modes call it.
//! Positions use the same render Y flip: `py = (1 - y) * height`.

use std::f32::consts::PI;

pub use super::g_shared::{
    MODE_COLLISION, MODE_DENSITY, MODE_NOISE, MODE_OVERLAP, MODE_PRESSURE, MODE_PROXIMITY,
    MODE_PROXIMITY_B, MODE_VELOCITY, MODE_VELOCITY_C, MODE_VORTICITY,
};

pub const MAX_CELLS: usize = 2048;

const VIZ_GRID_MAX: usize = 128;
const VIZ_BINS: usize = VIZ_GRID_MAX * VIZ_GRID_MAX;

#[derive(Clone, Copy)]
pub(super) struct CellRect {
    pub(super) x: f32,
    pub(super) y: f32,
    pub(super) w: f32,
    pub(super) h: f32,
}

impl CellRect {
    pub(super) fn contains_point(self, px: f32, py: f32) -> bool {
        px >= self.x && px < self.x + self.w && py >= self.y && py < self.y + self.h
    }
}

pub(crate) struct Grid {
    pub(super) count: usize,
    pub(super) cells: Vec<CellRect>,
    pub(super) values: Vec<f32>,
    pub(super) members: Vec<Vec<u32>>,
    pub(super) acc0: Vec<f32>,
    pub(super) acc1: Vec<f32>,
    pub(super) acc2: Vec<f32>,
    pub(super) acc3: Vec<f32>,
    pub(super) acc4: Vec<f32>,
    pub(super) bin_counts: Vec<u32>,
    pub(super) bin_starts: Vec<u32>,
    bin_cursor: Vec<u32>,
    pub(super) bin_indices: Vec<u32>,
}

impl Grid {
    pub(crate) fn new(particle_cap: usize) -> Self {
        let particle_cap = particle_cap.max(1);
        let mut members = Vec::with_capacity(MAX_CELLS);
        for _ in 0..MAX_CELLS {
            members.push(Vec::new());
        }
        Self {
            count: 0,
            cells: vec![CellRect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }; MAX_CELLS],
            values: vec![0.0; MAX_CELLS],
            members,
            acc0: vec![0.0; MAX_CELLS],
            acc1: vec![0.0; MAX_CELLS],
            acc2: vec![0.0; MAX_CELLS],
            acc3: vec![0.0; MAX_CELLS],
            acc4: vec![0.0; MAX_CELLS],
            bin_counts: vec![0; VIZ_BINS],
            bin_starts: vec![0; VIZ_BINS],
            bin_cursor: vec![0; VIZ_BINS],
            bin_indices: vec![0; particle_cap],
        }
    }

    pub(crate) fn set_cells(&mut self, rects: &[f32]) {
        let n = (rects.len() / 4).min(MAX_CELLS);
        self.count = n;
        for i in 0..n {
            let o = i * 4;
            self.cells[i] = CellRect {
                x: rects[o],
                y: rects[o + 1],
                w: rects[o + 2],
                h: rects[o + 3],
            };
        }
    }

    pub(crate) fn active_values(&self) -> &[f32] {
        &self.values[..self.count]
    }

    /// Full output buffer. The allocation does not move after [`Grid::new`].
    pub(crate) fn value_buf(&self) -> &[f32] {
        &self.values
    }

    pub(crate) fn eval(
        &mut self,
        mode: u32,
        width: f32,
        height: f32,
        particle_radius: f32,
        render_scale: f32,
        affect_scale: bool,
        collision_grid: u32,
        x: &[f32],
        y: &[f32],
        vx: &[f32],
        vy: &[f32],
        radii: &[f32],
        count: usize,
        field: &[f32],
    ) {
        let count = count
            .min(x.len())
            .min(y.len())
            .min(vx.len())
            .min(vy.len())
            .min(radii.len());
        let n = self.count;
        for v in &mut self.values[..n] {
            *v = 0.0;
        }
        if n == 0 {
            return;
        }
        match mode {
            MODE_NOISE => self.compute_noise(width, height, field),
            MODE_PROXIMITY => {
                if count > 0 {
                    self.eval_proximity(x, y, count, width, height);
                }
            }
            MODE_PROXIMITY_B => {
                if count > 0 {
                    self.eval_proximity_b(x, y, count, width, height, particle_radius);
                }
            }
            MODE_DENSITY => {
                if count > 0 {
                    self.eval_density(
                        x,
                        y,
                        radii,
                        count,
                        width,
                        height,
                        particle_radius,
                        render_scale,
                        affect_scale,
                    );
                }
            }
            MODE_VELOCITY => {
                if count > 0 {
                    self.eval_velocity(x, y, vx, vy, count, width, height, particle_radius);
                }
            }
            MODE_PRESSURE => {
                if count > 0 {
                    self.eval_pressure(x, y, count, width, height, particle_radius);
                }
            }
            MODE_VORTICITY => {
                if count > 0 {
                    self.eval_vorticity(x, y, vx, vy, count, width, height, particle_radius);
                }
            }
            MODE_COLLISION => {
                if count > 0 {
                    self.eval_collision(
                        x,
                        y,
                        vx,
                        vy,
                        count,
                        width,
                        height,
                        particle_radius,
                        collision_grid,
                    );
                }
            }
            MODE_OVERLAP => {
                if count > 0 {
                    self.eval_overlap(x, y, count, width, height, particle_radius);
                }
            }
            _ => {}
        }
    }

    pub(super) fn clear_members(&mut self) {
        for cell in &mut self.members[..self.count] {
            cell.clear();
        }
    }

    pub(super) fn rebuild_viz_bins(&mut self, x: &[f32], y: &[f32], count: usize, grid: usize) {
        let cells = grid * grid;
        for c in &mut self.bin_counts[..cells] {
            *c = 0;
        }
        let n = count.min(self.bin_indices.len());
        for i in 0..n {
            if let Some(cell) = viz_bin(x[i], y[i], grid) {
                self.bin_counts[cell] += 1;
            }
        }
        let mut sum = 0u32;
        for cell in 0..cells {
            self.bin_starts[cell] = sum;
            self.bin_cursor[cell] = sum;
            sum += self.bin_counts[cell];
        }
        for i in 0..n {
            if let Some(cell) = viz_bin(x[i], y[i], grid) {
                let slot = self.bin_cursor[cell] as usize;
                self.bin_indices[slot] = i as u32;
                self.bin_cursor[cell] += 1;
            }
        }
    }
}

pub(super) fn pixel(x: f32, y: f32, width: f32, height: f32) -> (f32, f32) {
    (x * width, (1.0 - y) * height)
}

pub(super) fn proximity_radius(width: f32, height: f32) -> f32 {
    let avg = (width + height) * 0.5;
    20.0 * (avg / 240.0)
}

pub(super) fn uniform_pixel_radius(particle_radius: f32, width: f32, height: f32) -> f32 {
    particle_radius * width.max(height)
}

pub(super) fn cells_near(a: CellRect, b: CellRect, radius: f32) -> bool {
    (a.x - b.x).abs() <= radius && (a.y - b.y).abs() <= radius
}

/// `collisionGridSize || 10`, rounded already by the caller, clamped to 1..=128.
pub(super) fn viz_grid_size(collision_grid: u32) -> usize {
    let raw = if collision_grid == 0 { 10 } else { collision_grid };
    (raw as usize).clamp(1, VIZ_GRID_MAX)
}

fn viz_bin(x: f32, y: f32, grid: usize) -> Option<usize> {
    if !x.is_finite() || !y.is_finite() || x < 0.0 || x >= 1.0 || y < 0.0 || y >= 1.0 {
        return None;
    }
    let g = grid as f32;
    let cx = ((x * g).floor() as usize).min(grid - 1);
    let cy = ((y * g).floor() as usize).min(grid - 1);
    Some(cy * grid + cx)
}

pub(super) fn zero_slice(buf: &mut [f32], n: usize) {
    for v in &mut buf[..n] {
        *v = 0.0;
    }
}

/// Density content elements match JS `calculateDensity`:
/// coveragePercent → shapedCoverage → densityValue = min(shapedCoverage * densityGain, 100).
pub(super) fn shaped_coverage(overlap_area: f32, cell_area: f32, density_gain: f32) -> f32 {
    let coverage_percent = (overlap_area / cell_area) * 100.0;
    let shaped_coverage = (coverage_percent / 100.0).powf(1.5) * 100.0;
    (shaped_coverage * density_gain).min(100.0)
}

pub(super) fn js_sign(v: f32) -> f32 {
    if v > 0.0 {
        1.0
    } else if v < 0.0 {
        -1.0
    } else {
        0.0
    }
}

/// Circle-rectangle overlap copied from `GridRenderModes.calculateCircleRectOverlap`.
pub(super) fn circle_rect_overlap(
    circle_x: f32,
    circle_y: f32,
    radius: f32,
    rect_x: f32,
    rect_y: f32,
    rect_w: f32,
    rect_h: f32,
) -> f32 {
    let closest_x = rect_x.max(circle_x.min(rect_x + rect_w));
    let closest_y = rect_y.max(circle_y.min(rect_y + rect_h));
    let dx = circle_x - closest_x;
    let dy = circle_y - closest_y;
    let distance_sq = dx * dx + dy * dy;
    if distance_sq > radius * radius {
        return 0.0;
    }

    let circle_area = PI * radius * radius;
    let rect_area = rect_w * rect_h;

    if circle_x - radius <= rect_x
        && circle_x + radius >= rect_x + rect_w
        && circle_y - radius <= rect_y
        && circle_y + radius >= rect_y + rect_h
    {
        return rect_area;
    }

    if circle_x - radius >= rect_x
        && circle_x + radius <= rect_x + rect_w
        && circle_y - radius >= rect_y
        && circle_y + radius <= rect_y + rect_h
    {
        return circle_area;
    }

    let overlap_left = (circle_x - radius).max(rect_x);
    let overlap_right = (circle_x + radius).min(rect_x + rect_w);
    let overlap_top = (circle_y - radius).max(rect_y);
    let overlap_bottom = (circle_y + radius).min(rect_y + rect_h);
    if overlap_left >= overlap_right || overlap_top >= overlap_bottom {
        return 0.0;
    }

    let overlap_area = (overlap_right - overlap_left) * (overlap_bottom - overlap_top);

    if circle_x >= rect_x
        && circle_x <= rect_x + rect_w
        && circle_y >= rect_y
        && circle_y <= rect_y + rect_h
    {
        let left = circle_segment_area(radius, circle_x - rect_x);
        let right = circle_segment_area(radius, rect_x + rect_w - circle_x);
        let top = circle_segment_area(radius, circle_y - rect_y);
        let bottom = circle_segment_area(radius, rect_y + rect_h - circle_y);
        return circle_area - (left + right + top + bottom);
    }

    let center_distance = distance_sq.sqrt();
    let weight = 1.0 - (center_distance / radius);
    overlap_area * (0.785 + 0.215 * weight)
}

fn circle_segment_area(radius: f32, distance: f32) -> f32 {
    if distance >= radius {
        return 0.0;
    }
    let theta = 2.0 * (distance / radius).acos();
    (radius * radius * (theta - theta.sin())) / 2.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ParticleSystem;

    #[test]
    fn density_and_proximity_match_js_formulas() {
        // 240×240 render, two 120×240 cells side by side.
        // Proximity radius = 20 * ((240+240)/2) / 240 = 20, so radiusSq = 400.
        // P0 (0.25, 0.5) -> pixel (60, 120). P1 (0.25, 1 - 110/240) -> (60, 110).
        // distSq = 100, one ordered pair weighs 1 - 100/400 = 0.75.
        // Both directions sum to 1.5, divided by 2 particles, times tune 0.15 = 0.1125.
        // P2 (0.75, 0.5) -> (180, 120) is alone in cell 1. Cell origins are 120 apart,
        // which is outside the proximity radius, so cell 1 stays 0.
        //
        // Density radius is size/8, and size is raw radius * renderScale.
        // affect_scale false uses particle_radius 0.01, not the per-particle 0.05:
        //   pixel radius = 0.01 * 4000 / 8 = 5.
        // The circle sits fully inside its cell, so overlap = π * 25 and cell area = 28800.
        // JS: ((overlap/area)*100), pow(/100, 1.5)*100, min(*0.1, 100)
        //   = 0.0014241183761684766 per particle. Cell 0 has two, cell 1 has one.
        // affect_scale true uses radius[i] = 0.02 -> pixel radius 10
        //   = 0.011392947009347813 per particle.
        let mut engine = ParticleSystem::new(8);
        engine.set_count(3);
        engine.set_cells(&[
            0.0, 0.0, 120.0, 240.0, 120.0, 0.0, 120.0, 240.0,
        ]);
        engine.x[0] = 0.25;
        engine.y[0] = 0.5;
        engine.x[1] = 0.25;
        engine.y[1] = 1.0 - 110.0 / 240.0;
        engine.x[2] = 0.75;
        engine.y[2] = 0.5;
        engine.radius[0] = 0.05;
        engine.radius[1] = 0.05;
        engine.radius[2] = 0.05;

        engine.grid_eval(MODE_PROXIMITY, 240.0, 240.0, 0.01, 4000.0, false, 10);
        let prox0 = engine.grid_values()[0];
        let prox1 = engine.grid_values()[1];
        assert!(
            (prox0 as f64 - 0.1125).abs() < 1e-4,
            "proximity cell 0: got {prox0}, expected 0.1125"
        );
        assert!(
            (prox1 as f64).abs() < 1e-6,
            "proximity cell 1: got {prox1}, expected 0"
        );

        engine.grid_eval(MODE_DENSITY, 240.0, 240.0, 0.01, 4000.0, false, 10);
        let d0 = engine.grid_values()[0];
        let d1 = engine.grid_values()[1];
        const ONE_R5: f64 = 0.0014241183761684766;
        assert!(
            (d0 as f64 - ONE_R5 * 2.0).abs() < 1e-5,
            "density cell 0: got {d0}, expected {}",
            ONE_R5 * 2.0
        );
        assert!(
            (d1 as f64 - ONE_R5).abs() < 1e-5,
            "density cell 1: got {d1}, expected {ONE_R5}"
        );

        engine.radius[0] = 0.02;
        engine.radius[1] = 0.02;
        engine.radius[2] = 0.02;
        engine.grid_eval(MODE_DENSITY, 240.0, 240.0, 0.01, 4000.0, true, 10);
        let s0 = engine.grid_values()[0];
        let s1 = engine.grid_values()[1];
        const ONE_R10: f64 = 0.011392947009347813;
        assert!(
            (s0 as f64 - ONE_R10 * 2.0).abs() < 1e-5,
            "affect-scale density cell 0: got {s0}, expected {}",
            ONE_R10 * 2.0
        );
        assert!(
            (s1 as f64 - ONE_R10).abs() < 1e-5,
            "affect-scale density cell 1: got {s1}, expected {ONE_R10}"
        );
    }
}
