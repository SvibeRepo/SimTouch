use super::grid_render_manager::{
    circle_rect_overlap, pixel, shaped_coverage, uniform_pixel_radius, zero_slice, Grid,
};

impl Grid {
    pub(super) fn eval_velocity(
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
        let pr = uniform_pixel_radius(particle_radius, width, height);
        for i in 0..count {
            let (px, py) = pixel(x[i], y[i], width, height);
            let speed = (vx[i] * vx[i] + vy[i] * vy[i]).sqrt();
            for c in 0..n {
                let cell = self.cells[c];
                let cell_area = cell.w * cell.h;
                if cell_area <= 0.0 {
                    continue;
                }
                let overlap = circle_rect_overlap(px, py, pr, cell.x, cell.y, cell.w, cell.h);
                if overlap > 0.0 {
                    let weight = shaped_coverage(overlap, cell_area, 0.1);
                    self.acc0[c] += speed * weight * TUNE;
                    self.acc1[c] += weight;
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
