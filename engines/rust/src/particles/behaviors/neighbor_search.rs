//! Neighbor gather over the fixed collision bins.

use crate::particles::core::collision::CollisionBins;

pub(crate) const PIXEL: f32 = 240.0;
pub(crate) const ORG_GRID: usize = 16;
pub(crate) const NEAR_CAP: usize = 32;

#[derive(Clone, Copy)]
pub(crate) struct Near {
    pub(crate) idx: u32,
    pub(crate) dist: f32,
}

pub(crate) fn reach_cells(radius_px: f32) -> i32 {
    let cells = ((radius_px / PIXEL) * ORG_GRID as f32).ceil() as i32;
    cells.clamp(1, ORG_GRID as i32)
}

pub(crate) fn gather(
    bins: &CollisionBins,
    x: &[f32],
    y: &[f32],
    i: usize,
    count: usize,
    radius_px: f32,
    reach: i32,
    near: &mut [Near; NEAR_CAP],
) -> usize {
    let grid = ORG_GRID;
    let cx = (x[i] * grid as f32).floor() as i32;
    let cy = (y[i] * grid as f32).floor() as i32;
    let radius_sq = radius_px * radius_px;
    let mut n = 0usize;
    for dy in -reach..=reach {
        for dx in -reach..=reach {
            let col = cx + dx;
            let row = cy + dy;
            if col < 0 || row < 0 || col >= grid as i32 || row >= grid as i32 {
                continue;
            }
            let cell = row as usize * grid + col as usize;
            let start = bins.starts[cell] as usize;
            let len = bins.counts[cell] as usize;
            for k in 0..len {
                let j = bins.indices[start + k] as usize;
                if j == i || j >= count {
                    continue;
                }
                let ddx = (x[j] - x[i]) * PIXEL;
                let ddy = (y[j] - y[i]) * PIXEL;
                let dist_sq = ddx * ddx + ddy * ddy;
                if dist_sq > radius_sq || dist_sq < 1e-8 {
                    continue;
                }
                let dist = dist_sq.sqrt();
                if n < NEAR_CAP {
                    near[n] = Near { idx: j as u32, dist };
                    n += 1;
                } else {
                    let mut worst = 0usize;
                    for t in 1..NEAR_CAP {
                        if near[t].dist > near[worst].dist {
                            worst = t;
                        }
                    }
                    if dist < near[worst].dist {
                        near[worst] = Near { idx: j as u32, dist };
                    }
                }
            }
        }
    }
    n
}
