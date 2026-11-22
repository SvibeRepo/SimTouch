use super::grid_render_manager::{
    circle_rect_overlap, pixel, shaped_coverage, uniform_pixel_radius, zero_slice, Grid,
};

impl Grid {
    pub(super) fn eval_pressure(
        &mut self,
        x: &[f32],
        y: &[f32],
        count: usize,
        width: f32,
        height: f32,
        particle_radius: f32,
    ) {
        const TUNE: f32 = 0.5;
        let n = self.count;
        zero_slice(&mut self.acc0, n);
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
                    self.acc0[c] += shaped_coverage(overlap, cell_area, 0.25);
                }
            }
        }
        for i in 0..n {
            if self.acc0[i] > 0.0 {
                self.values[i] = (self.acc0[i] / 100.0).powf(2.0) * TUNE * 200.0;
            }
        }
    }
}
