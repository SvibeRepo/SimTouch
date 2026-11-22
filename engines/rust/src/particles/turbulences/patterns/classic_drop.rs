use crate::config::params::Params;

const TAU: f32 = std::f32::consts::TAU;

/// Pattern 9. JavaScript case string stays "classicdrop".
pub(crate) fn value(x: f32, y: f32, cx: f32, cy: f32, _freq: f32, p: &Params, time: f32) -> f32 {
    let freq = p.turb_freq.max(0.0001);
    let phase_time = time * p.turb_phase_speed.abs().max(1.0) * p.turb_speed;
    let max_drops = (freq * 3.0).floor().max(3.0) as i32;
    let mut value = 0.0;
    for i in 0..max_drops {
        let fi = (i + 1) as f32;
        let drop_seed = 12.9898 * fi + 4.1414;
        let time_seed = 78.233 * fi + 7.7575;
        let size_seed = 43758.5453 * fi + 1.8989;
        let time_variation = phase_time * 0.05;
        let position_noise = (drop_seed * 13.33 + time_variation).sin() * 0.3;
        let position_radius = 1.0 + position_noise;
        let angle_variation = (time_seed * 0.75 + time_variation * 0.3).sin() * 0.2;
        let drop_x = cx + position_radius * (drop_seed + i as f32 * 2.2 + angle_variation).cos();
        let drop_y = cy + position_radius * (time_seed + i as f32 * 4.3 + angle_variation).sin();
        let drop_cycle_offset = i as f32 * TAU / max_drops as f32;
        let drop_cycle_length = 8.0 / freq;
        let cycle_variation = (size_seed * 3.333 + i as f32 * 7.1).sin() * 0.1;
        let adjusted = drop_cycle_offset * (1.0 + cycle_variation);
        let drop_time_norm = (phase_time + adjusted) % drop_cycle_length;
        let drop_active = drop_cycle_length * 0.75;
        if drop_time_norm < drop_active {
            let age = drop_time_norm / drop_active;
            let dx = x - drop_x;
            let dy = y - drop_y;
            let drop_dist = (dx * dx + dy * dy).sqrt();
            let ripple_speed = 1.0 + size_seed.sin() * 0.4;
            let ripple_radius = age * ripple_speed;
            let ripple_width = 0.12 + 0.18 * (1.0 - age);
            let intensity = 1.0 - age * 0.8;
            let ripple_dist = (drop_dist - ripple_radius).abs();
            let ripple = (-ripple_dist * ripple_dist / (ripple_width * ripple_width)).exp() * intensity;
            value += ripple;
        }
    }
    let calm = (x * freq * 0.2 + y * freq * 0.3 + phase_time * 0.2).sin() * 0.1;
    ((value + calm) * 0.7).min(1.0)
}
