use super::grid_render_manager::{circle_rect_overlap, pixel, shaped_coverage, Grid};

impl Grid {
    pub(super) fn eval_density(
        &mut self,
        x: &[f32],
        y: &[f32],
        radii: &[f32],
        count: usize,
        width: f32,
        height: f32,
        particle_radius: f32,
        render_scale: f32,
        affect_scale: bool,
    ) {
        for i in 0..count {
            let raw = if affect_scale { radii[i] } else { particle_radius };
            // renderedSize = rawRadius * renderScale; densityRadius = renderedSize / 8.
            let density_radius = raw * render_scale / 8.0;
            let (px, py) = pixel(x[i], y[i], width, height);
            for c in 0..self.count {
                let cell = self.cells[c];
                let cell_area = cell.w * cell.h;
                if cell_area <= 0.0 {
                    continue;
                }
                let overlap_area =
                    circle_rect_overlap(px, py, density_radius, cell.x, cell.y, cell.w, cell.h);
                if overlap_area > 0.0 {
                    const DENSITY_GAIN: f32 = 0.1;
                    self.values[c] += shaped_coverage(overlap_area, cell_area, DENSITY_GAIN);
                }
            }
        }
    }
}
