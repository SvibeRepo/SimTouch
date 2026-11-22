//! Circular wall. Writes position and velocity in place.

use crate::config::params::{boundary_mode, Params};

pub(super) fn enforce_circle(p: &Params, x: &mut f32, y: &mut f32, vx: &mut f32, vy: &mut f32, radius: f32) {
    let dx = *x - p.boundary_cx;
    let dy = *y - p.boundary_cy;
    let dist = (dx * dx + dy * dy).sqrt();
    if dist < 1e-8 {
        return;
    }
    let nx = dx / dist;
    let ny = dy / dist;
    // The circular resolver uses its own damping and ignores the external value.
    let effective_damping = p.boundary_damping;

    if dist + radius > p.boundary_radius {
        if p.boundary_mode == boundary_mode::WARP {
            *x = p.boundary_cx - nx * (p.boundary_radius * 0.95);
            *y = p.boundary_cy - ny * (p.boundary_radius * 0.95);
            return;
        }
        let dot = *vx * nx + *vy * ny;
        if dot > 0.0 {
            let normal_vx = dot * nx;
            let normal_vy = dot * ny;
            let tangential_vx = *vx - normal_vx;
            let tangential_vy = *vy - normal_vy;
            let bounce_vx = -p.boundary_restitution * normal_vx;
            let bounce_vy = -p.boundary_restitution * normal_vy;
            *vx = bounce_vx + effective_damping * tangential_vx;
            *vy = bounce_vy + effective_damping * tangential_vy;
        }
        let safe = p.boundary_radius - radius - 0.001;
        *x = p.boundary_cx + nx * safe;
        *y = p.boundary_cy + ny * safe;
        return;
    }

    if p.boundary_repulsion > 0.0 {
        let distance_to_edge = p.boundary_radius - (dist + radius);
        let zone = p.boundary_radius * 0.15;
        if distance_to_edge < zone && zone > 1e-8 {
            let normalized = 1.0 - distance_to_edge / zone;
            let strength = p.boundary_repulsion * normalized * normalized;
            *vx -= nx * strength;
            *vy -= ny * strength;
        }
    }
}
