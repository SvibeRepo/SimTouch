use crate::config::params::Params;

/// Pattern 12. Same formula as the Rust body that was inlined in `pattern_value`.
pub(crate) fn value(x: f32, y: f32, _cx: f32, _cy: f32, freq: f32, _p: &Params, _time: f32) -> f32 {
    let mut value = 1.0;
    let mut amplitude = 1.0;
    let frequency = freq;
    for _ in 0..3 {
        value += amplitude * (x * frequency).sin() * (y * frequency).sin();
        amplitude *= 0.5;
    }
    value
}
