use crate::particles::render_modes::p_shared::{speed_norm, tune};

pub fn compute(
    vx: &[f32],
    vy: &[f32],
    n: usize,
    max_density: f32,
    max_velocity: f32,
    out: &mut [f32],
) {
    for i in 0..n {
        let speed = (vx[i] * vx[i] + vy[i] * vy[i]).sqrt();
        out[i] = speed_norm(speed * tune::VELOCITY, max_velocity, max_density);
    }
}
