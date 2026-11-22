use super::grid_render_manager::{
    circle_rect_overlap, pixel, shaped_coverage, uniform_pixel_radius, viz_grid_size, zero_slice, Grid,
};

impl Grid {
    pub(super) fn eval_collision(
        &mut self,
        x: &[f32],
        y: &[f32],
        vx: &[f32],
        vy: &[f32],
        count: usize,
        width: f32,
        height: f32,
        particle_radius: f32,
        collision_grid: u32,
    ) {
        const TUNE: f32 = 50.0;
        let grid = viz_grid_size(collision_grid);
        self.rebuild_viz_bins(x, y, count, grid);
        let n = self.count;
        zero_slice(&mut self.acc0, n);
        zero_slice(&mut self.acc1, n);
        let pr = uniform_pixel_radius(particle_radius, width, height);
        let min_dist = pr + pr;
        let span = min_dist * 2.0;
        let bins = grid * grid;
        for bin in 0..bins {
            let start = self.bin_starts[bin] as usize;
            let len = self.bin_counts[bin] as usize;
            if len < 2 {
                continue;
            }
            for j in 0..len {
                let i1 = self.bin_indices[start + j] as usize;
                for k in (j + 1)..len {
                    let i2 = self.bin_indices[start + k] as usize;
                    let dvx = vx[i2] - vx[i1];
                    let dvy = vy[i2] - vy[i1];
                    let relative_speed = (dvx * dvx + dvy * dvy).sqrt();
                    let (p1x, p1y) = pixel(x[i1], y[i1], width, height);
                    let (p2x, p2y) = pixel(x[i2], y[i2], width, height);
                    let dx = p2x - p1x;
                    let dy = p2y - p1y;
                    let dist = (dx * dx + dy * dy).sqrt();
                    if dist < span {
                        let overlap_pair = (span - dist).max(0.0);
                        let intensity = (overlap_pair / span) * relative_speed;
                        for c in 0..n {
                            let cell = self.cells[c];
                            let cell_area = cell.w * cell.h;
                            if cell_area <= 0.0 {
                                continue;
                            }
                            let o1 = circle_rect_overlap(p1x, p1y, pr, cell.x, cell.y, cell.w, cell.h);
                            let o2 = circle_rect_overlap(p2x, p2y, pr, cell.x, cell.y, cell.w, cell.h);
                            if o1 > 0.0 || o2 > 0.0 {
                                let weight = shaped_coverage(o1 + o2, cell_area, 0.25);
                                self.acc0[c] += intensity * weight * TUNE;
                                self.acc1[c] += weight;
                            }
                        }
                    }
                }
            }
        }
        for i in 0..n {
            if self.acc1[i] > 0.0 {
                self.values[i] = self.acc0[i] / self.acc1[i];
            }
        }
    }
}
