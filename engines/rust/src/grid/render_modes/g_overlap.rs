use super::grid_render_manager::{
    circle_rect_overlap, pixel, shaped_coverage, uniform_pixel_radius, Grid,
};

impl Grid {
    pub(super) fn eval_overlap(
        &mut self,
        x: &[f32],
        y: &[f32],
        count: usize,
        width: f32,
        height: f32,
        particle_radius: f32,
    ) {
        let pr = uniform_pixel_radius(particle_radius, width, height);
        for i in 0..count {
            let (px, py) = pixel(x[i], y[i], width, height);
            for c in 0..self.count {
                let cell = self.cells[c];
                let cell_area = cell.w * cell.h;
                if cell_area <= 0.0 {
                    continue;
                }
                let overlap = circle_rect_overlap(px, py, pr, cell.x, cell.y, cell.w, cell.h);
                if overlap > 0.0 {
                    self.values[c] += shaped_coverage(overlap, cell_area, 0.1);
                }
            }
        }
    }
}
