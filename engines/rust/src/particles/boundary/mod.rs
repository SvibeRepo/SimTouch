//! Circular and rectangular boundaries. Both write position and velocity in place.

mod base_boundary;
mod circular_boundary;
mod rectangular_boundary;

pub use base_boundary::enforce;

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
        let (sx, sy) = crate::particles::core::collision_scales::collision_scales(boundary_shape::CIRCULAR, 480.0, 960.0);
        assert_eq!((sx, sy), (1.0, 1.0));
    }
}
