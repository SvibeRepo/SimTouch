//! Voronoi edge force. Centers move in fixed slots. The edge distance and
//! gradient are rasterized onto the turbulence grid and bilinear-sampled.

use crate::particles::turbulences::turbulence_manager::{bilinear_sample, FIELD_AREA, FIELD_N};
use crate::config::params::Params;

pub const MAX_CELLS: usize = 48;

#[derive(Clone, Copy)]
pub struct Edge {
    pub distance: f32,
    pub gx: f32,
    pub gy: f32,
    pub on_edge: bool,
}

pub fn edge_at(x: f32, y: f32, centers: &[(f32, f32)]) -> Edge {
    if centers.len() < 2 {
        return Edge { distance: 1.0, gx: 0.0, gy: 0.0, on_edge: false };
    }
    let mut nearest = f32::MAX;
    let mut second = f32::MAX;
    let mut nearest_i = 0usize;
    let mut second_i = 1usize;
    for (i, (cx, cy)) in centers.iter().enumerate() {
        let dx = x - cx;
        let dy = y - cy;
        let dist_sq = dx * dx + dy * dy;
        if dist_sq < nearest {
            second = nearest;
            second_i = nearest_i;
            nearest = dist_sq;
            nearest_i = i;
        } else if dist_sq < second {
            second = dist_sq;
            second_i = i;
        }
    }
    if nearest_i == second_i {
        second_i = if nearest_i == 0 { 1 } else { 0 };
    }
    let (cx1, cy1) = centers[nearest_i];
    let (cx2, cy2) = centers[second_i];
    let mid_x = (cx1 + cx2) * 0.5;
    let mid_y = (cy1 + cy2) * 0.5;
    let vx = cx2 - cx1;
    let vy = cy2 - cy1;
    let v_len = (vx * vx + vy * vy).sqrt();
    if v_len < 0.00001 {
        return Edge { distance: 0.01, gx: 0.0, gy: 0.0, on_edge: false };
    }
    let nvx = vx / v_len;
    let nvy = vy / v_len;
    let px = x - cx1;
    let py = y - cy1;
    let projection = px * nvx + py * nvy;
    let proj_x = cx1 + nvx * projection;
    let proj_y = cy1 + nvy * projection;
    let dx = x - proj_x;
    let dy = y - proj_y;
    let perp = (dx * dx + dy * dy).sqrt();
    let on_edge = projection >= 0.0 && projection <= v_len;
    let distance = if on_edge {
        (perp - v_len * 0.5).abs()
    } else {
        let mid_dist = ((x - mid_x).powi(2) + (y - mid_y).powi(2)).sqrt();
        (mid_dist - v_len * 0.5).abs()
    };
    let (gx, gy) = if on_edge {
        let mut gx = -nvy;
        let mut gy = nvx;
        if gx * dx + gy * dy < 0.0 {
            gx = -gx;
            gy = -gy;
        }
        (gx, gy)
    } else {
        let mut gx = mid_x - x;
        let mut gy = mid_y - y;
        let len = (gx * gx + gy * gy).sqrt();
        if len > 0.00001 {
            gx /= len;
            gy /= len;
        } else {
            gx = 0.0;
            gy = 0.0;
        }
        (gx, gy)
    };
    Edge { distance, gx, gy, on_edge }
}

pub fn rasterize(dist: &mut [f32], gx: &mut [f32], gy: &mut [f32], edge: &mut [f32], centers: &[(f32, f32)]) {
    if dist.len() < FIELD_AREA {
        return;
    }
    for row in 0..FIELD_N {
        for col in 0..FIELD_N {
            let u = (col as f32 + 0.5) / FIELD_N as f32;
            let v = (row as f32 + 0.5) / FIELD_N as f32;
            let e = edge_at(u, v, centers);
            let i = row * FIELD_N + col;
            dist[i] = e.distance;
            gx[i] = e.gx;
            gy[i] = e.gy;
            edge[i] = if e.on_edge { 1.0 } else { 0.0 };
        }
    }
}

pub fn place_cells(x: &mut [f32], y: &mut [f32], vx: &mut [f32], vy: &mut [f32], count: usize, p: &Params) {
    let n = count.min(MAX_CELLS).max(2);
    let radius = p.boundary_radius * 0.9;
    for i in 0..n {
        let angle = i as f32 * 2.3999631;
        let dist = radius * ((i as f32 + 0.5) / n as f32).sqrt();
        x[i] = p.boundary_cx + angle.cos() * dist;
        y[i] = p.boundary_cy + angle.sin() * dist;
        let v_angle = angle * 1.7;
        let mag = p.voronoi_speed * (0.3 + 0.7 * ((i % 5) as f32) / 5.0);
        vx[i] = v_angle.cos() * mag;
        vy[i] = v_angle.sin() * mag;
    }
}

pub fn move_cells(x: &mut [f32], y: &mut [f32], vx: &mut [f32], vy: &mut [f32], count: usize, p: &Params, dt: f32, time: f32) {
    let radius = p.boundary_radius * 0.9;
    let max_r2 = radius * radius;
    for i in 0..count {
        let mut nx = x[i] + vx[i] * dt;
        let mut ny = y[i] + vy[i] * dt;
        let dx = nx - p.boundary_cx;
        let dy = ny - p.boundary_cy;
        let dist_sq = dx * dx + dy * dy;
        if dist_sq > max_r2 && dist_sq > 1e-12 {
            let dist = dist_sq.sqrt();
            let nxn = dx / dist;
            let nyn = dy / dist;
            let dot = vx[i] * nxn + vy[i] * nyn;
            vx[i] -= 2.0 * dot * nxn;
            vy[i] -= 2.0 * dot * nyn;
            let overlap = dist - radius;
            nx -= nxn * overlap;
            ny -= nyn * overlap;
        }
        if (time * 3.0 + i as f32 * 1.7).sin() > 0.98 {
            let v_angle = time * 2.0 + i as f32;
            let mag = p.voronoi_speed * 0.5;
            vx[i] = v_angle.cos() * mag;
            vy[i] = v_angle.sin() * mag;
        }
        x[i] = nx;
        y[i] = ny;
    }
}

/// Velocity delta from a sampled edge. Positive gradient follows `Edge.gx/gy`.
pub fn accelerate(vx: f32, vy: f32, edge: Edge, dt: f32, p: &Params) -> (f32, f32) {
    let width = p.voronoi_edge.max(0.0001);
    let edge_factor = (1.0 - (edge.distance / width).powf(1.5)).max(0.0);
    let edge_decay = if edge.on_edge || edge_factor > 0.7 {
        p.voronoi_decay * 0.7
    } else {
        p.voronoi_decay
    };
    let blend = p.voronoi_blend;
    let mut nvx = vx * edge_decay * blend + vx * (1.0 - blend);
    let mut nvy = vy * edge_decay * blend + vy * (1.0 - blend);
    if p.voronoi_strength <= 0.0 {
        return (nvx, nvy);
    }
    let magnitude = edge_factor * p.voronoi_strength * p.voronoi_attraction;
    let mut gx = edge.gx;
    let mut gy = edge.gy;
    if p.voronoi_pull {
        gx = -gx;
        gy = -gy;
    }
    let moving_toward = vx * gx + vy * gy < 0.0;
    if moving_toward || !edge.on_edge {
        nvx += gx * magnitude * p.voronoi_smooth * dt;
        nvy += gy * magnitude * p.voronoi_smooth * dt;
    } else {
        nvx += gx * magnitude * 0.1 * dt;
        nvy += gy * magnitude * 0.1 * dt;
        let edge_alignment = 0.05 * magnitude;
        nvx += -gy * edge_alignment * dt;
        nvy += gx * edge_alignment * dt;
    }
    if edge.on_edge || edge_factor > 0.7 {
        let initial = (vx * vx + vy * vy).sqrt();
        let max_edge = (0.1 * p.voronoi_strength).max(initial * 0.6);
        let speed = (nvx * nvx + nvy * nvy).sqrt();
        if speed > max_edge && speed > 1e-8 {
            nvx = nvx / speed * max_edge;
            nvy = nvy / speed * max_edge;
        }
    }
    (nvx, nvy)
}

pub fn sample_edge(dist: &[f32], gx: &[f32], gy: &[f32], on_edge: &[f32], x: f32, y: f32) -> Edge {
    Edge {
        distance: bilinear_sample(dist, FIELD_N, x, y),
        gx: bilinear_sample(gx, FIELD_N, x, y),
        gy: bilinear_sample(gy, FIELD_N, x, y),
        on_edge: bilinear_sample(on_edge, FIELD_N, x, y) > 0.5,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voronoi_force_follows_gradient_and_pull_flips_it() {
        let centers = [(0.2f32, 0.5f32), (0.8f32, 0.5f32)];
        let edge = edge_at(0.35, 0.7, &centers);
        assert!(edge.gy.abs() > 0.5, "expected a vertical gradient, got {}", edge.gy);
        let mut p = Params::default();
        p.voronoi_strength = 4.0;
        p.voronoi_edge = 0.3;
        p.voronoi_attraction = 1.0;
        p.voronoi_decay = 1.0;
        p.voronoi_blend = 0.0;
        p.voronoi_pull = false;
        p.voronoi_smooth = 0.3;
        let (_vx, vy) = accelerate(0.0, 0.0, edge, 0.1, &p);
        assert!(vy * edge.gy > 0.0, "force should follow the gradient, vy={vy} gy={}", edge.gy);
        p.voronoi_pull = true;
        let (_vx2, vy2) = accelerate(0.0, 0.0, edge, 0.1, &p);
        assert!(vy2 * edge.gy < 0.0, "pull mode should reverse the gradient, vy={vy2}");
    }
}
