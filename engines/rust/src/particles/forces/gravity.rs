//! Gravity. Nonzero components = on (ledger §2).

/// Apply gravity_x / gravity_y to velocity. Gate: return when |gx| + |gy| <= 1e-6.
pub fn apply(vx: &mut [f32], vy: &mut [f32], count: usize, gravity_x: f32, gravity_y: f32, dt: f32) {
    if (gravity_x.abs() + gravity_y.abs()) <= 1e-6 {
        return;
    }
    for i in 0..count {
        vx[i] += gravity_x * dt;
        vy[i] += gravity_y * dt;
    }
}
