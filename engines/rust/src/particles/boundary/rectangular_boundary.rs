//! Rectangular wall. Writes position and velocity in place.

use crate::particles::core::collision_scales::collision_scales;
use crate::config::params::{boundary_mode, Params};

pub(super) fn enforce_rect(p: &Params, x: &mut f32, y: &mut f32, vx: &mut f32, vy: &mut f32, radius: f32) {
    let (sx, sy) = collision_scales(p.boundary_shape, p.render_width, p.render_height);
    let inset_x = radius / sx.max(1e-8);
    let inset_y = radius / sy.max(1e-8);
    let min_x = p.rect_min_x + inset_x;
    let max_x = p.rect_max_x - inset_x;
    let min_y = p.rect_min_y + inset_y;
    let max_y = p.rect_max_y - inset_y;
    let damp = p.external_damping;

    if p.boundary_mode == boundary_mode::WARP {
        if *x < min_x {
            *x = max_x - 0.001;
        } else if *x > max_x {
            *x = min_x + 0.001;
        }
        if *y < min_y {
            *y = max_y - 0.001;
        } else if *y > max_y {
            *y = min_y + 0.001;
        }
        return;
    }

    let mut collision = false;
    if *x < min_x {
        if *vx < 0.0 {
            *vx = -*vx * p.boundary_restitution;
        }
        *x = min_x + 0.001;
        collision = true;
    } else if *x > max_x {
        if *vx > 0.0 {
            *vx = -*vx * p.boundary_restitution;
        }
        *x = max_x - 0.001;
        collision = true;
    }
    if *y < min_y {
        if *vy < 0.0 {
            *vy = -*vy * p.boundary_restitution;
        }
        *y = min_y + 0.001;
        collision = true;
    } else if *y > max_y {
        if *vy > 0.0 {
            *vy = -*vy * p.boundary_restitution;
        }
        *y = max_y - 0.001;
        collision = true;
    }
    if collision {
        *vx *= damp;
        *vy *= damp;
        return;
    }

    if p.boundary_repulsion > 0.0 {
        let zone_x = p.boundary_width * 0.1;
        let zone_y = p.boundary_height * 0.1;
        if zone_x > 1e-8 && *x - min_x < zone_x {
            let strength = (1.0 - ((*x - min_x) / zone_x)) * p.boundary_repulsion;
            *vx += strength;
        }
        if zone_x > 1e-8 && max_x - *x < zone_x {
            let strength = (1.0 - ((max_x - *x) / zone_x)) * p.boundary_repulsion;
            *vx -= strength;
        }
        if zone_y > 1e-8 && *y - min_y < zone_y {
            let strength = (1.0 - ((*y - min_y) / zone_y)) * p.boundary_repulsion;
            *vy += strength;
        }
        if zone_y > 1e-8 && max_y - *y < zone_y {
            let strength = (1.0 - ((max_y - *y) / zone_y)) * p.boundary_repulsion;
            *vy -= strength;
        }
    }
}
