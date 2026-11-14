use wasm_bindgen::prelude::*;

use crate::step::Engine;
use crate::params::PARAM_COUNT;

#[wasm_bindgen]
pub struct SimCore {
    inner: Engine,
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
            inner: Engine::new(capacity as usize),
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
}
