use super::grid_render_manager::Grid;

use crate::config::params::Params;
use crate::particles::turbulences::turbulence_manager::{
    bilinear_sample, sample_analytic, FIELD_N,
};

const NOISE_TUNE: f32 = 2.2;

impl Grid {
    pub(super) fn compute_noise(&mut self, width: f32, height: f32, field: &[f32]) {
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

    /// Blur 0: one phase sample at the cell, same as JavaScript `noise2D`.
    pub(crate) fn eval_noise_analytic(
        &mut self,
        width: f32,
        height: f32,
        p: &Params,
        time: f32,
        rotation: f32,
        bias_x: f32,
        bias_y: f32,
    ) {
        let n = self.count;
        for v in &mut self.values[..n] {
            *v = 0.0;
        }
        if n == 0 || width.abs() < 1e-8 || height.abs() < 1e-8 {
            return;
        }
        for i in 0..n {
            let cell = self.cells[i];
            let cx = cell.x + cell.w * 0.5;
            let cy = cell.y + cell.h * 0.5;
            let nx = cx / width;
            let ny = 1.0 - cy / height;
            let noise_value = sample_analytic(p, nx, ny, time, rotation, bias_x, bias_y);
            self.values[i] = noise_value * NOISE_TUNE;
        }
    }
}
