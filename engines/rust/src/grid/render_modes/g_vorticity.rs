use super::grid_render_manager::{
    circle_rect_overlap, js_sign, pixel, shaped_coverage, uniform_pixel_radius, zero_slice, Grid,
};

impl Grid {
    pub(super) fn eval_vorticity(
        &mut self,
        x: &[f32],
        y: &[f32],
        vx: &[f32],
        vy: &[f32],
        count: usize,
        width: f32,
        height: f32,
        particle_radius: f32,
    ) {
        const TUNE: f32 = 5.0;
        let n = self.count;
        zero_slice(&mut self.acc0, n);
        zero_slice(&mut self.acc1, n);
        zero_slice(&mut self.acc2, n);
        zero_slice(&mut self.acc3, n);
        zero_slice(&mut self.acc4, n);
        let pr = uniform_pixel_radius(particle_radius, width, height);
        for i in 0..count {
            let (px, py) = pixel(x[i], y[i], width, height);
            for c in 0..n {
                let cell = self.cells[c];
                let cell_area = cell.w * cell.h;
                if cell_area <= 0.0 {
                    continue;
                }
                let overlap = circle_rect_overlap(px, py, pr, cell.x, cell.y, cell.w, cell.h);
                if overlap > 0.0 {
                    let weight = shaped_coverage(overlap, cell_area, 0.25);
                    self.acc0[c] += vx[i] * weight;
                    self.acc1[c] += vy[i] * weight;
                    self.acc2[c] += weight;
                }
            }
        }
        for i in 0..n {
            if self.acc2[i] > 0.0 {
                self.acc3[i] = self.acc0[i] / self.acc2[i];
                self.acc4[i] = self.acc1[i] / self.acc2[i];
            }
        }
        for i in 0..n {
            if self.acc2[i] == 0.0 {
                continue;
            }
            let cell = self.cells[i];
            let mut dvx_dy = 0.0;
            let mut dvy_dx = 0.0;
            let mut valid = 0.0;
            for j in 0..n {
                if j == i {
                    continue;
                }
                let other = self.cells[j];
                let dx = other.x - cell.x;
                let dy = other.y - cell.y;
                if dx.abs() > cell.w * 1.5 || dy.abs() > cell.h * 1.5 {
                    continue;
                }
                if self.acc2[j] > 0.0 {
                    if dy.abs() > 0.001 {
                        dvx_dy += (self.acc3[j] - self.acc3[i]) / dy;
                    }
                    if dx.abs() > 0.001 {
                        dvy_dx += (self.acc4[j] - self.acc4[i]) / dx;
                    }
                    valid += 1.0;
                }
            }
            if valid > 0.0 {
                dvx_dy /= valid;
                dvy_dx /= valid;
                let vorticity = dvy_dx - dvx_dy;
                let scaled = js_sign(vorticity) * vorticity.abs().powf(0.75);
                self.values[i] = scaled * TUNE;
            }
        }
    }
}
