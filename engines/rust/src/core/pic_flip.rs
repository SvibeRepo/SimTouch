use crate::config::params::Params;
use crate::core::velocity_grid::{
    self, sample_uv, VelocityGrid, FLIP_MAX,
};

/// PIC/FLIP blend on top of [`VelocityGrid`] splat/solve.
pub fn apply(
    grid: &mut VelocityGrid,
    x: &[f32],
    y: &[f32],
    vx: &mut [f32],
    vy: &mut [f32],
    count: usize,
    p: &Params,
    dt: f32,
) {
    if p.flip_ratio < 0.0 || count == 0 {
        return;
    }
    let n = p.flip_grid.clamp(4, FLIP_MAX);
    velocity_grid::mark_solid(grid, n, p);
    velocity_grid::splat(grid, x, y, vx, vy, count, n);
    let cells = n * n;
    grid.prev_u[..cells].copy_from_slice(&grid.u[..cells]);
    grid.prev_v[..cells].copy_from_slice(&grid.v[..cells]);
    velocity_grid::solve(grid, n, p, dt);
    let alpha = p.flip_ratio.clamp(0.0, 1.0);
    let max_v = p.max_velocity;
    for i in 0..count {
        if !(0.0..1.0).contains(&x[i]) || !(0.0..1.0).contains(&y[i]) {
            continue;
        }
        let (grid_vx, grid_vy) = sample_uv(&grid.u, &grid.v, x[i], y[i], n);
        let (prev_vx, prev_vy) = sample_uv(&grid.prev_u, &grid.prev_v, x[i], y[i], n);
        let pic_vx = grid_vx;
        let pic_vy = grid_vy;
        let flip_vx = vx[i] + (grid_vx - prev_vx);
        let flip_vy = vy[i] + (grid_vy - prev_vy);
        let nx = (1.0 - alpha) * pic_vx + alpha * flip_vx;
        let ny = (1.0 - alpha) * pic_vy + alpha * flip_vy;
        vx[i] = nx.clamp(-max_v, max_v);
        vy[i] = ny.clamp(-max_v, max_v);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::params::Params;
    use crate::core::velocity_grid::VelocityGrid;

    fn opposing(ratio: f32) -> (f32, f32) {
        let mut grid = VelocityGrid::new();
        let mut p = Params::default();
        p.flip_ratio = ratio;
        p.flip_grid = 32;
        p.boundary_radius = 0.5;
        p.max_velocity = 1.0;
        let x = [0.5_f32, 0.5];
        let y = [0.5_f32, 0.5];
        let mut vx = [0.4_f32, -0.4];
        let mut vy = [0.0_f32, 0.0];
        apply(&mut grid, &x, &y, &mut vx, &mut vy, 2, &p, 1.0 / 60.0);
        (vx[0], vx[1])
    }

    #[test]
    fn slider_blends_pic_at_zero_into_flip_at_one() {
        let (pic_a, pic_b) = opposing(0.0);
        assert!(
            pic_a.abs() < 1e-4 && pic_b.abs() < 1e-4,
            "ratio 0 is PIC, the cell average, got {pic_a} {pic_b}"
        );
        let (mid_a, mid_b) = opposing(0.5);
        assert!(
            (mid_a - 0.2).abs() < 1e-4 && (mid_b + 0.2).abs() < 1e-4,
            "ratio 0.5 is halfway, got {mid_a} {mid_b}"
        );
        let (sweet_a, sweet_b) = opposing(0.95);
        assert!(
            (sweet_a - 0.38).abs() < 1e-4 && (sweet_b + 0.38).abs() < 1e-4,
            "ratio 0.95 is 5% PIC and 95% FLIP, got {sweet_a} {sweet_b}"
        );
        let (flip_a, flip_b) = opposing(1.0);
        assert!(
            (flip_a - 0.4).abs() < 1e-4 && (flip_b + 0.4).abs() < 1e-4,
            "ratio 1 is FLIP and keeps each particle, got {flip_a} {flip_b}"
        );
        let (off_a, off_b) = opposing(-1.0);
        assert!(
            (off_a - 0.4).abs() < 1e-4 && (off_b + 0.4).abs() < 1e-4,
            "a negative ratio leaves velocities alone, got {off_a} {off_b}"
        );
    }
}
