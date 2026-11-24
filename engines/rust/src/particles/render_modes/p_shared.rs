//! Shared helpers for particle theme modes.

use std::collections::HashMap;

/// Beyond 4 sigma a neighbour adds < 0.1 LSB (same cutoff as C++).
pub const CUTOFF: f32 = 16.0;
/// Field scale shared with cell Noise. Separate from `tune::NOISE`.
pub const NOISE_TUNE: f32 = 2.2;

/// Particle-class numerator for the 0–1 Sensitivity slider.
/// Level is raw × tune / divisor. Proximity and Pressure are calibrated.
/// Pressure applies its tune before the square. Vorticity applies its tune before the 0.75 power.
pub mod tune {
    pub const NOISE: f32 = 1.0;
    pub const PROXIMITY: f32 = 50.0;
    pub const VELOCITY: f32 = 10.0;
    pub const PRESSURE: f32 = 5.0;
    pub const COLLISION: f32 = 1.0;
    pub const PROXIMITY_B: f32 = 1.0;
    pub const DENSITY: f32 = 0.1;
    pub const VORTICITY: f32 = 100.0;
    pub const OVERLAP: f32 = 1.0;
    pub const VELOCITY_C: f32 = 1.0;
}
/// Below this count, neighbour modes use O(N²); above, a spatial hash.
pub const BRUTE_FORCE_LIMIT: usize = 64;

pub fn clamp01(v: f32) -> f32 {
    if v.is_finite() {
        v.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

pub fn speed_norm(speed: f32, max_velocity: f32, max_density: f32) -> f32 {
    if !speed.is_finite() {
        return 0.0;
    }
    let denom = max_velocity.max(1e-6) * max_density.max(1e-6);
    clamp01(speed / denom)
}

pub fn fallback_radius(fallback_radius: f32) -> f32 {
    if fallback_radius > 1e-4 {
        fallback_radius
    } else {
        1e-4
    }
}

pub fn max_radius(radii: &[f32], n: usize, fallback: f32) -> f32 {
    let mut max_r = fallback;
    for i in 0..n.min(radii.len()) {
        if radii[i] > max_r {
            max_r = radii[i];
        }
    }
    max_r
}

pub struct SpatialHash {
    bins: HashMap<(i32, i32), Vec<usize>>,
    inv: f32,
}

pub fn build_hash(x: &[f32], y: &[f32], n: usize, cell_size: f32) -> SpatialHash {
    let inv = 1.0 / cell_size.max(1e-6);
    let mut bins: HashMap<(i32, i32), Vec<usize>> = HashMap::new();
    for i in 0..n {
        let cx = (x[i] * inv).floor() as i32;
        let cy = (y[i] * inv).floor() as i32;
        bins.entry((cx, cy)).or_default().push(i);
    }
    SpatialHash { bins, inv }
}

/// Gaussian search radius = 4 × max sigma (matches CUTOFF).
pub fn gaussian_hash(x: &[f32], y: &[f32], radii: &[f32], n: usize, fallback: f32) -> Option<SpatialHash> {
    if n < BRUTE_FORCE_LIMIT {
        return None;
    }
    let max_r = max_radius(radii, n, fallback);
    Some(build_hash(x, y, n, (4.0 * max_r).max(1e-4)))
}

/// Contact/overlap search radius = 2 × max radius.
pub fn overlap_hash(x: &[f32], y: &[f32], radii: &[f32], n: usize, fallback: f32) -> Option<SpatialHash> {
    if n < BRUTE_FORCE_LIMIT {
        return None;
    }
    let max_r = max_radius(radii, n, fallback);
    Some(build_hash(x, y, n, (2.0 * max_r).max(1e-4)))
}

pub fn for_each_candidate<F: FnMut(usize)>(
    hash: Option<&SpatialHash>,
    x: &[f32],
    y: &[f32],
    n: usize,
    i: usize,
    mut visit: F,
) {
    match hash {
        None => {
            for j in 0..n {
                if j != i {
                    visit(j);
                }
            }
        }
        Some(h) => {
            let cx = (x[i] * h.inv).floor() as i32;
            let cy = (y[i] * h.inv).floor() as i32;
            for ox in -1..=1 {
                for oy in -1..=1 {
                    if let Some(arr) = h.bins.get(&(cx + ox, cy + oy)) {
                        for &j in arr {
                            if j != i {
                                visit(j);
                            }
                        }
                    }
                }
            }
        }
    }
}
