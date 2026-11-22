//! Dispatch circle or rectangle. Public name stays `enforce`.

use crate::config::params::{boundary_shape, Params};
use super::circular_boundary::enforce_circle;
use super::rectangular_boundary::enforce_rect;

pub fn enforce(p: &Params, x: &mut f32, y: &mut f32, vx: &mut f32, vy: &mut f32, radius: f32) {
    if p.boundary_shape == boundary_shape::RECTANGULAR {
        enforce_rect(p, x, y, vx, vy, radius);
    } else {
        enforce_circle(p, x, y, vx, vy, radius);
    }
}
