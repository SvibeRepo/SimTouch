//! Circular and rectangular boundaries. Both write position and velocity in place.

use crate::particles::core::metric::collision_scales;
use crate::config::params::{boundary_mode, boundary_shape, Params};

pub fn enforce(p: &Params, x: &mut f32, y: &mut f32, vx: &mut f32, vy: &mut f32, radius: f32) {
    if p.boundary_shape == boundary_shape::RECTANGULAR {
        enforce_rect(p, x, y, vx, vy, radius);
    } else {
        enforce_circle(p, x, y, vx, vy, radius);
    }
}

fn enforce_circle(p: &Params, x: &mut f32, y: &mut f32, vx: &mut f32, vy: &mut f32, radius: f32) {
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

fn enforce_rect(p: &Params, x: &mut f32, y: &mut f32, vx: &mut f32, vy: &mut f32, radius: f32) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::params::{boundary_mode, boundary_shape, Params};

    #[test]
    fn circular_bounce_reverses_outward_velocity() {
        let mut p = Params::default();
        p.boundary_shape = boundary_shape::CIRCULAR;
        p.boundary_mode = boundary_mode::BOUNCE;
        p.boundary_cx = 0.5;
        p.boundary_cy = 0.5;
        p.boundary_radius = 0.4;
        p.boundary_restitution = 1.0;
        p.boundary_damping = 1.0;
        p.boundary_repulsion = 0.0;
        let mut x = 0.95;
        let mut y = 0.5;
        let mut vx = 0.2;
        let mut vy = 0.0;
        enforce(&p, &mut x, &mut y, &mut vx, &mut vy, 0.01);
        assert!(vx < 0.0, "outward velocity should bounce inward, got {vx}");
        assert!(x < p.boundary_cx + p.boundary_radius, "particle should sit inside the circle");
        assert!((x - y).abs() > 0.0 || x < 0.95);
    }

    #[test]
    fn rectangular_bounce_writes_position_inside() {
        let mut p = Params::default();
        p.boundary_shape = boundary_shape::RECTANGULAR;
        p.boundary_mode = boundary_mode::BOUNCE;
        p.rect_min_x = 0.1;
        p.rect_max_x = 0.9;
        p.rect_min_y = 0.1;
        p.rect_max_y = 0.9;
        p.boundary_restitution = 1.0;
        p.external_damping = 1.0;
        p.boundary_repulsion = 0.0;
        let mut x = 0.05;
        let mut y = 0.5;
        let mut vx = -0.2;
        let mut vy = 0.0;
        enforce(&p, &mut x, &mut y, &mut vx, &mut vy, 0.01);
        assert!(vx > 0.0, "left-wall hit should reverse vx, got {vx}");
        assert!(x > 0.1, "position should be written back inside");
    }

    #[test]
    fn tall_render_doubles_x_wall_inset() {
        let mut p = Params::default();
        p.boundary_shape = boundary_shape::RECTANGULAR;
        p.boundary_mode = boundary_mode::BOUNCE;
        p.rect_min_x = 0.0;
        p.rect_max_x = 1.0;
        p.rect_min_y = 0.0;
        p.rect_max_y = 1.0;
        p.render_width = 480.0;
        p.render_height = 960.0;
        p.boundary_restitution = 1.0;
        p.external_damping = 1.0;
        p.boundary_repulsion = 0.0;
        let radius = 0.01f32;
        let mut x = 0.0;
        let mut y = 0.5;
        let mut vx = -0.1;
        let mut vy = 0.0;
        enforce(&p, &mut x, &mut y, &mut vx, &mut vy, radius);
        let expected = radius / 0.5 + 0.001;
        assert!(
            (x - expected).abs() < 1e-4,
            "tall rect inset x {x} should be near {expected}"
        );
    }

    #[test]
    fn circular_shape_ignores_tall_render_for_rect_inset_path() {
        let (sx, sy) = crate::particles::core::metric::collision_scales(boundary_shape::CIRCULAR, 480.0, 960.0);
        assert_eq!((sx, sy), (1.0, 1.0));
    }
}
