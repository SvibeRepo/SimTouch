use super::grid_render_manager::Grid;

use crate::particles::turbulences::turbulence_manager::{bilinear_sample, FIELD_N};

impl Grid {
    pub(super) fn compute_noise(&mut self, width: f32, height: f32, field: &[f32]) {
        const NOISE_TUNE: f32 = 2.2;
        for i in 0..self.count {
            let cell = self.cells[i];
            let cx = cell.x + cell.w * 0.5;
            let cy = cell.y + cell.h * 0.5;
            let nx = cx / width;
            let ny = 1.0 - cy / height;
            let noise_value = bilinear_sample(field, FIELD_N, nx, ny);
            self.values[i] = noise_value * NOISE_TUNE;
        }
    }
}
