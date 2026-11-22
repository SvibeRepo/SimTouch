use wasm_bindgen::prelude::*;

use crate::particles::core::ParticleSystem;
use crate::config::params::PARAM_COUNT;

#[wasm_bindgen]
pub struct SimCore {
    inner: ParticleSystem,
}

#[wasm_bindgen(js_name = wasmMemory)]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}

#[wasm_bindgen(js_name = paramCount)]
pub fn param_count() -> u32 {
    PARAM_COUNT as u32
}

#[wasm_bindgen]
impl SimCore {
    #[wasm_bindgen(constructor)]
    pub fn new(capacity: u32) -> SimCore {
        SimCore {
            inner: ParticleSystem::new(capacity as usize),
        }
    }

    pub fn set_count(&mut self, count: u32) {
        self.inner.set_count(count as usize);
    }

    pub fn count(&self) -> u32 {
        self.inner.count as u32
    }

    pub fn capacity(&self) -> u32 {
        self.inner.capacity as u32
    }

    pub fn set_params(&mut self, data: &[f32]) {
        self.inner.apply_params(data);
    }

    /// Caller framebuffer size. Not in the float bag.
    pub fn set_render_size(&mut self, width: f32, height: f32) {
        self.inner.params.render_width = width.max(1e-8);
        self.inner.params.render_height = height.max(1e-8);
    }

    /// Playback rate for the whole tick (`physics_dt = time_step * time_scale`).
    pub fn set_time_scale(&mut self, scale: f32) {
        self.inner.set_time_scale(scale);
    }

    pub fn set_touch(&mut self, x: f32, y: f32, active: bool) {
        self.inner.set_touch(x, y, active);
    }

    /// `dt` is the raw frame time step; engine applies `time_scale`.
    pub fn step(&mut self, dt: f32) {
        self.inner.step(dt);
    }

    pub fn x_ptr(&self) -> u32 {
        self.inner.x.as_ptr() as u32
    }

    pub fn y_ptr(&self) -> u32 {
        self.inner.y.as_ptr() as u32
    }

    pub fn vx_ptr(&self) -> u32 {
        self.inner.vx.as_ptr() as u32
    }

    pub fn vy_ptr(&self) -> u32 {
        self.inner.vy.as_ptr() as u32
    }

    pub fn radius_ptr(&self) -> u32 {
        self.inner.radius.as_ptr() as u32
    }

    pub fn time(&self) -> f32 {
        self.inner.time
    }

    pub fn rotation(&self) -> f32 {
        self.inner.rotation
    }

    pub fn bias_offset_x(&self) -> f32 {
        self.inner.bias_x
    }

    pub fn bias_offset_y(&self) -> f32 {
        self.inner.bias_y
    }

    pub fn bias_velocity_x(&self) -> f32 {
        self.inner.bias_vx
    }

    pub fn bias_velocity_y(&self) -> f32 {
        self.inner.bias_vy
    }

    pub fn set_cells(&mut self, rects: &[f32]) {
        self.inner.set_cells(rects);
    }

    pub fn set_grid_mode(&mut self, mode: u32) {
        self.inner.set_grid_mode(mode);
    }

    pub fn set_cell_mode(&mut self, mode: u32) {
        self.inner.set_cell_mode(mode);
    }

    pub fn particle_eval(&mut self, mode: u32, max_density: f32, max_velocity: f32) {
        self.inner.particle_eval(mode, max_density, max_velocity);
    }

    pub fn particle_values_ptr(&self) -> u32 {
        self.inner.particle_value_buf().as_ptr() as u32
    }

    pub fn grid_eval(
        &mut self,
        mode: u32,
        width: f32,
        height: f32,
        particle_radius: f32,
        render_scale: f32,
        affect_scale: bool,
        collision_grid: u32,
    ) {
        self.inner.grid_eval(
            mode,
            width,
            height,
            particle_radius,
            render_scale,
            affect_scale,
            collision_grid,
        );
    }

    pub fn grid_values_ptr(&self) -> u32 {
        self.inner.grid_value_buf().as_ptr() as u32
    }

    pub fn field_ptr(&self) -> u32 {
        self.inner.field().as_ptr() as u32
    }

    pub fn field_size(&self) -> u32 {
        self.inner.field().len() as u32
    }
}
