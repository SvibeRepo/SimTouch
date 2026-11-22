//! Per-particle theme levels for the lab particle output class.
//! Visual only: no cell data array.

mod collision;
mod density;
mod noise;
mod overlap;
mod pressure;
mod proximity;
mod proximity_b;
mod shared;
mod velocity;
mod velocity_c;
mod vorticity;

use crate::grid::{
    MODE_COLLISION, MODE_DENSITY, MODE_NOISE, MODE_OVERLAP, MODE_PRESSURE, MODE_PROXIMITY,
    MODE_PROXIMITY_B, MODE_VELOCITY, MODE_VELOCITY_C, MODE_VORTICITY,
};

/// Write one float level per particle into `out` (length >= count).
/// Unsupported mode names leave `out[..count]` at 0.
pub fn eval(
    mode: u32,
    x: &[f32],
    y: &[f32],
    vx: &[f32],
    vy: &[f32],
    radii: &[f32],
    count: usize,
    fallback_radius: f32,
    max_density: f32,
    max_velocity: f32,
    field: &[f32],
    out: &mut [f32],
) {
    let n = count
        .min(out.len())
        .min(x.len())
        .min(y.len())
        .min(vx.len())
        .min(vy.len());
    for v in out.iter_mut().take(n) {
        *v = 0.0;
    }
    if n == 0 {
        return;
    }
    let max_density = if max_density > 1e-6 { max_density } else { 1e-6 };
    let max_velocity = if max_velocity > 1e-6 {
        max_velocity
    } else {
        1e-6
    };

    match mode {
        MODE_NOISE => noise::compute(x, y, n, max_density, field, out),
        MODE_PROXIMITY => proximity::compute(x, y, radii, n, fallback_radius, max_density, out),
        MODE_PROXIMITY_B => {
            proximity_b::compute(x, y, radii, n, fallback_radius, max_density, out)
        }
        MODE_DENSITY => density::compute(x, y, radii, n, fallback_radius, max_density, out),
        MODE_VELOCITY => velocity::compute(vx, vy, n, max_density, max_velocity, out),
        MODE_VELOCITY_C => velocity_c::compute(
            x,
            y,
            vx,
            vy,
            radii,
            n,
            fallback_radius,
            max_density,
            max_velocity,
            out,
        ),
        MODE_PRESSURE => pressure::compute(x, y, radii, n, fallback_radius, max_density, out),
        MODE_OVERLAP => overlap::compute(x, y, radii, n, fallback_radius, max_density, out),
        MODE_COLLISION => collision::compute(
            x,
            y,
            vx,
            vy,
            radii,
            n,
            fallback_radius,
            max_density,
            max_velocity,
            out,
        ),
        MODE_VORTICITY => vorticity::compute(
            x,
            y,
            vx,
            vy,
            radii,
            n,
            fallback_radius,
            max_density,
            max_velocity,
            out,
        ),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::forces::turbulence::FIELD_N;

    #[test]
    fn proximity_self_excluded_and_neighbour_adds() {
        let x = [0.5, 0.51];
        let y = [0.5, 0.5];
        let vx = [0.0, 0.0];
        let vy = [0.0, 0.0];
        let r = [0.05, 0.05];
        let mut out = [0.0; 2];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_PROXIMITY,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            2,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        assert!(out[0] > 0.0);
        assert!(out[1] > 0.0);
    }

    #[test]
    fn proximity_b_overlap_when_touching() {
        let x = [0.5, 0.55];
        let y = [0.5, 0.5];
        let vx = [0.0, 0.0];
        let vy = [0.0, 0.0];
        let r = [0.05, 0.05];
        let mut out = [0.0; 2];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_PROXIMITY_B,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            2,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        // dist 0.05, minDist 0.10 → overlap fraction 0.5
        assert!((out[0] - 0.5).abs() < 1e-4, "got {}", out[0]);
    }

    #[test]
    fn density_counts_neighbour() {
        let x = [0.5, 0.51];
        let y = [0.5, 0.5];
        let vx = [0.0, 0.0];
        let vy = [0.0, 0.0];
        let r = [0.05, 0.05];
        let mut out = [0.0; 2];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_DENSITY,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            2,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        assert!((out[0] - 1.0).abs() < 1e-5, "got {}", out[0]);
    }

    #[test]
    fn velocity_own_speed() {
        let x = [0.5];
        let y = [0.5];
        let vx = [0.5];
        let vy = [0.0];
        let r = [0.05];
        let mut out = [0.0];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_VELOCITY,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            1,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        assert!((out[0] - 0.5).abs() < 1e-5);
    }

    #[test]
    fn collision_closing_speed() {
        let x = [0.5, 0.55];
        let y = [0.5, 0.5];
        let vx = [0.2, -0.2];
        let vy = [0.0, 0.0];
        let r = [0.05, 0.05];
        let mut out = [0.0; 2];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_COLLISION,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            2,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        assert!(out[0] > 0.0, "particles approaching should light collision");
    }

    #[test]
    fn spatial_hash_matches_brute_proximity() {
        // Force the hash path (n >= BRUTE_FORCE_LIMIT) and compare against a
        // known close pair that must survive culling.
        let n = 80;
        let mut x = vec![0.9f32; n];
        let mut y = vec![0.9f32; n];
        let vx = vec![0.0f32; n];
        let vy = vec![0.0f32; n];
        let r = vec![0.05f32; n];
        // Two nearby particles far from the sparse cloud.
        x[0] = 0.1;
        y[0] = 0.1;
        x[1] = 0.11;
        y[1] = 0.1;
        let mut out = vec![0.0f32; n];
        let field = [0.0f32; FIELD_N * FIELD_N];
        eval(
            MODE_PROXIMITY,
            &x,
            &y,
            &vx,
            &vy,
            &r,
            n,
            0.05,
            1.0,
            1.0,
            &field,
            &mut out,
        );
        assert!(out[0] > 0.0, "hash path must still see neighbour");
        assert!(out[1] > 0.0, "hash path must still see neighbour");
        // Isolated particle in the cloud with no close neighbour → ~0
        assert!(out[40] < 1e-3, "distant particles should not contribute");
    }
}
