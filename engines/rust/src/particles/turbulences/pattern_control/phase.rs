use crate::config::params::Params;

const TAU: f32 = std::f32::consts::TAU;

pub fn apply_phase(noise: f32, p: &Params, time: f32) -> f32 {
    let amplitude = if p.turb_speed > 0.0 && p.turb_amplitude_enabled {
        let dynamic = 0.5 + 0.5 * (time * p.turb_speed * p.turb_amplitude_speed).sin();
        p.turb_amplitude * dynamic
    } else {
        p.turb_amplitude
    };
    let phase_offset = if p.turb_speed > 0.0 && p.turb_phase_speed.abs() > 0.0 {
        time * p.turb_speed * p.turb_phase_speed.abs() * p.turb_phase_speed.signum()
            + p.turb_phase * TAU
    } else {
        p.turb_phase * TAU
    };
    (noise * TAU + phase_offset).sin() * amplitude
}
