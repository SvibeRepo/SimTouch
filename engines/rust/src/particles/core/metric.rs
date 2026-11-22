//! Framebuffer metric for pair tests and rectangular wall insets.
//! Circular boundaries stay (1, 1). Rectangular callers supply render size.

use crate::config::params::boundary_shape;

/// Pixel-proportional scales for one sim unit on each axis.
/// Circular shape always returns (1, 1). Rectangular uses render size over its long side.
pub fn collision_scales(shape: u8, render_width: f32, render_height: f32) -> (f32, f32) {
    if shape != boundary_shape::RECTANGULAR {
        return (1.0, 1.0);
    }
    let w = render_width.max(1e-8);
    let h = render_height.max(1e-8);
    let m = w.max(h);
    (w / m, h / m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn circular_forces_unit_even_on_tall_canvas() {
        assert_eq!(collision_scales(boundary_shape::CIRCULAR, 480.0, 960.0), (1.0, 1.0));
    }

    #[test]
    fn rectangular_square_is_unit() {
        assert_eq!(collision_scales(boundary_shape::RECTANGULAR, 960.0, 960.0), (1.0, 1.0));
    }

    #[test]
    fn rectangular_tall_halves_x() {
        let (sx, sy) = collision_scales(boundary_shape::RECTANGULAR, 480.0, 960.0);
        assert!((sx - 0.5).abs() < 1e-6);
        assert!((sy - 1.0).abs() < 1e-6);
    }

    #[test]
    fn rectangular_wide_halves_y() {
        let (sx, sy) = collision_scales(boundary_shape::RECTANGULAR, 960.0, 480.0);
        assert!((sx - 1.0).abs() < 1e-6);
        assert!((sy - 0.5).abs() < 1e-6);
    }
}
