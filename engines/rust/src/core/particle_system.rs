//! One allocation-free tick: field, forces, integrate, collide, boundary.

use crate::core::collision::CollisionBins;
use crate::forces::turbulence::{self, FIELD_AREA};
use crate::forces::touch::Touch;
use crate::core::velocity_grid::VelocityGrid;
use crate::grid::{Grid, MODE_NOISE};
use crate::behaviors::organic;
use crate::config::params::{id, Params, PARAM_COUNT};
use crate::forces::voronoi;

pub const MAX_PARTICLES: usize = 2048;

pub struct ParticleSystem {
    pub capacity: usize,
    pub count: usize,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub radius: Vec<f32>,
    pub params: Params,
    pub time: f32,
    pub rotation: f32,
    pub bias_x: f32,
    pub bias_y: f32,
    pub bias_vx: f32,
    pub bias_vy: f32,
    field: Vec<f32>,
    field_aux: Vec<f32>,
    bins: CollisionBins,
    vor_x: Vec<f32>,
    vor_y: Vec<f32>,
    vor_vx: Vec<f32>,
    vor_vy: Vec<f32>,
    vor_count: usize,
    vor_dist: Vec<f32>,
    vor_gx: Vec<f32>,
    vor_gy: Vec<f32>,
    vor_edge: Vec<f32>,
    flip: VelocityGrid,
    touch: Touch,
    org_state: Vec<f32>,
    org_state_next: Vec<f32>,
    org_read_vx: Vec<f32>,
    org_read_vy: Vec<f32>,
    org_state_init: Vec<u8>,
    org_link_count: Vec<u16>,
    org_links: Vec<u16>,
    grid: Grid,
    /// Active lab grid mode. Used to skip the 128² fill when turbulence is idle
    /// and the mode is not NOISE. Set from the host before step.
    grid_mode: u32,
}

impl ParticleSystem {
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.clamp(1, MAX_PARTICLES);
        Self {
            capacity,
            count: 0,
            x: vec![0.0; capacity],
            y: vec![0.0; capacity],
            vx: vec![0.0; capacity],
            vy: vec![0.0; capacity],
            radius: vec![0.01; capacity],
            params: Params::default(),
            time: 0.0,
            rotation: 0.0,
            bias_x: 0.0,
            bias_y: 0.0,
            bias_vx: 0.0,
            bias_vy: 0.0,
            field: vec![0.0; FIELD_AREA],
            field_aux: vec![0.0; FIELD_AREA],
            bins: CollisionBins::new(capacity),
            vor_x: vec![0.0; voronoi::MAX_CELLS],
            vor_y: vec![0.0; voronoi::MAX_CELLS],
            vor_vx: vec![0.0; voronoi::MAX_CELLS],
            vor_vy: vec![0.0; voronoi::MAX_CELLS],
            vor_count: 0,
            vor_dist: vec![0.0; FIELD_AREA],
            vor_gx: vec![0.0; FIELD_AREA],
            vor_gy: vec![0.0; FIELD_AREA],
            vor_edge: vec![0.0; FIELD_AREA],
            flip: VelocityGrid::new(),
            touch: Touch::default(),
            org_state: vec![0.5; capacity],
            org_state_next: vec![0.5; capacity],
            org_read_vx: vec![0.0; capacity],
            org_read_vy: vec![0.0; capacity],
            org_state_init: vec![0; capacity],
            org_link_count: vec![0; capacity],
            org_links: vec![0; capacity * organic::MAX_LINKS],
            grid: Grid::new(capacity),
            grid_mode: MODE_NOISE,
        }
    }

    pub fn set_grid_mode(&mut self, mode: u32) {
        self.grid_mode = mode;
    }

    pub fn set_count(&mut self, count: usize) {
        self.count = count.min(self.capacity);
    }

    pub fn apply_params(&mut self, data: &[f32]) {
        if data.len() < PARAM_COUNT {
            return;
        }
        self.params.apply_slice(data);
        self.time = data[id::TIME];
        self.rotation = data[id::ROTATION];
        self.bias_x = data[id::BIAS_X];
        self.bias_y = data[id::BIAS_Y];
        self.bias_vx = data[id::BIAS_VX];
        self.bias_vy = data[id::BIAS_VY];
    }

    pub fn set_touch(&mut self, x: f32, y: f32, active: bool) {
        self.touch.set_touch(x, y, active);
    }

    pub fn set_time_scale(&mut self, scale: f32) {
        self.params.time_scale = if scale.is_finite() && scale > 0.0 {
            scale
        } else {
            1.0
        };
    }

    /// `time_step` is the raw frame dt. Playback: `physics_dt = time_step * time_scale`.
    pub fn step(&mut self, time_step: f32) {
        if !time_step.is_finite() {
            return;
        }
        let dt = time_step * self.params.time_scale;
        if !dt.is_finite() {
            return;
        }
        // Flat spine (ledger §1). Call list only — workers own the math.
        self.advance_fields(dt);
        if self.count == 0 {
            return;
        }
        self.apply_gravity(dt);
        self.apply_turbulence(dt);
        self.apply_voronoi(dt);
        self.apply_organic(dt);
        self.apply_touch();
        self.apply_pic_flip(dt);
        self.damp();
        self.rest_and_advect(dt);
        self.clamp_velocity();
        self.resolve_collision();
        self.enforce_boundary();
    }

    fn advance_fields(&mut self, dt: f32) {
        let speed = self.params.turb_speed;
        let strength = self.params.turb_strength;
        let rot_speed = self.params.turb_rot_speed;
        let bias_strength = self.params.turb_bias_strength;
        let bias_friction = self.params.turb_bias_friction;
        let bias_accel_x = self.params.turb_bias_accel_x;
        let bias_accel_y = self.params.turb_bias_accel_y;
        let bias_sensitivity = self.params.turb_bias_sensitivity;
        self.time += dt * speed;
        if strength > 0.0 {
            self.rotation = wrap_tau(self.rotation + dt * rot_speed);
            if bias_strength > 0.0 {
                let friction = (1.0 - bias_friction).powf(dt * 60.0);
                self.bias_vx += bias_accel_x * 4.0 * dt * dt * 60.0;
                self.bias_vy += bias_accel_y * 4.0 * dt * dt * 60.0;
                self.bias_vx *= friction * bias_sensitivity;
                self.bias_vy *= friction * bias_sensitivity;
                self.bias_x += self.bias_vx * dt * 60.0;
                self.bias_y += self.bias_vy * dt * 60.0;
            }
        }
        let turb_on = self.params.turb_affect_position
            || self.params.turb_affect_scale
            || self.params.turb_scale_field;
        if turb_on || self.grid_mode == MODE_NOISE {
            turbulence::fill_field(
                &mut self.field,
                &mut self.field_aux,
                &self.params,
                self.time,
                self.rotation,
                self.bias_x,
                self.bias_y,
            );
        }
        if self.params.voronoi_strength > 0.0 {
            let cells = self.params.voronoi_cells.clamp(2, voronoi::MAX_CELLS);
            if cells != self.vor_count {
                voronoi::place_cells(
                    &mut self.vor_x,
                    &mut self.vor_y,
                    &mut self.vor_vx,
                    &mut self.vor_vy,
                    cells,
                    &self.params,
                );
                self.vor_count = cells;
            }
            voronoi::move_cells(
                &mut self.vor_x,
                &mut self.vor_y,
                &mut self.vor_vx,
                &mut self.vor_vy,
                self.vor_count,
                &self.params,
                dt,
                self.time,
            );
            let mut centers = [(0.0f32, 0.0f32); voronoi::MAX_CELLS];
            for i in 0..self.vor_count {
                centers[i] = (self.vor_x[i], self.vor_y[i]);
            }
            voronoi::rasterize(
                &mut self.vor_dist,
                &mut self.vor_gx,
                &mut self.vor_gy,
                &mut self.vor_edge,
                &centers[..self.vor_count],
            );
        }
    }

    fn apply_gravity(&mut self, dt: f32) {
        let p = &self.params;
        if !(p.gravity_enabled && (p.gravity_x.abs() + p.gravity_y.abs()) > 1e-6) {
            return;
        }
        for i in 0..self.count {
            self.vx[i] += p.gravity_x * dt;
            self.vy[i] += p.gravity_y * dt;
        }
    }

    fn apply_turbulence(&mut self, dt: f32) {
        let p = self.params.clone();
        let turb_on = p.turb_affect_position || p.turb_affect_scale || p.turb_scale_field;
        if !turb_on {
            return;
        }
        for i in 0..self.count {
            let (nvx, nvy, noise) = turbulence::sample_force(
                &self.field,
                self.x[i],
                self.y[i],
                self.vx[i],
                self.vy[i],
                dt,
                &p,
                self.time,
                self.rotation,
                self.bias_x,
                self.bias_y,
            );
            self.vx[i] = nvx;
            self.vy[i] = nvy;
            if p.turb_affect_scale {
                self.radius[i] =
                    turbulence::radius_from_noise(noise, p.turb_min_scale, p.turb_max_scale);
            }
        }
    }

    fn apply_voronoi(&mut self, dt: f32) {
        let p = self.params.clone();
        if !(p.voronoi_strength > 0.0 && self.vor_count >= 2) {
            return;
        }
        for i in 0..self.count {
            let edge = voronoi::sample_edge(
                &self.vor_dist,
                &self.vor_gx,
                &self.vor_gy,
                &self.vor_edge,
                self.x[i],
                self.y[i],
            );
            let (nvx, nvy) = voronoi::accelerate(self.vx[i], self.vy[i], edge, dt, &p);
            self.vx[i] = nvx;
            self.vy[i] = nvy;
        }
    }

    fn apply_organic(&mut self, dt: f32) {
        let count = self.count;
        let p = self.params.clone();
        // Swarm/fluid read neighbor velocity from a pre-update snapshot.
        self.org_read_vx[..count].copy_from_slice(&self.vx[..count]);
        self.org_read_vy[..count].copy_from_slice(&self.vy[..count]);
        organic::apply(
            &mut self.bins,
            &self.x,
            &self.y,
            &self.org_read_vx,
            &self.org_read_vy,
            &mut self.vx,
            &mut self.vy,
            &mut self.org_state,
            &mut self.org_state_next,
            &mut self.org_state_init,
            &mut self.org_link_count,
            &mut self.org_links,
            count,
            &p,
            dt,
        );
    }

    fn apply_touch(&mut self) {
        let count = self.count;
        self.touch
            .apply(&self.x, &self.y, &mut self.vx, &mut self.vy, count);
    }

    fn apply_pic_flip(&mut self, dt: f32) {
        let count = self.count;
        let p = self.params.clone();
        crate::core::pic_flip::apply(
            &mut self.flip,
            &self.x,
            &self.y,
            &mut self.vx,
            &mut self.vy,
            count,
            &p,
            dt,
        );
    }

    fn damp(&mut self) {
        let d = self.params.velocity_damping;
        for i in 0..self.count {
            self.vx[i] *= d;
            self.vy[i] *= d;
        }
    }

    fn rest_and_advect(&mut self, dt: f32) {
        let p = &self.params;
        for i in 0..self.count {
            let speed = (self.vx[i] * self.vx[i] + self.vy[i] * self.vy[i]).sqrt();
            let motion = speed * dt;
            if speed < p.velocity_threshold && motion < p.position_threshold {
                self.vx[i] = 0.0;
                self.vy[i] = 0.0;
                continue;
            }
            self.x[i] += self.vx[i] * dt;
            self.y[i] += self.vy[i] * dt;
        }
    }

    fn clamp_velocity(&mut self) {
        let max_v = self.params.max_velocity;
        for i in 0..self.count {
            self.vx[i] = self.vx[i].clamp(-max_v, max_v);
            self.vy[i] = self.vy[i].clamp(-max_v, max_v);
        }
    }

    fn resolve_collision(&mut self) {
        let count = self.count;
        let p = self.params.clone();
        if !p.collision_enabled {
            return;
        }
        let (sx, sy) =
            crate::core::metric::collision_scales(p.boundary_shape, p.render_width, p.render_height);
        self.bins
            .rebuild(&self.x, &self.y, count, p.collision_grid, sx, sy);
        crate::core::collision::resolve(
            &self.bins,
            &mut self.x,
            &mut self.y,
            &mut self.vx,
            &mut self.vy,
            &self.radius,
            count,
            p.collision_grid,
            &p,
            p.turb_affect_scale,
        );
    }

    fn enforce_boundary(&mut self) {
        let count = self.count;
        let p = self.params.clone();
        for i in 0..count {
            let radius = if p.turb_affect_scale {
                self.radius[i]
            } else {
                p.particle_radius
            };
            crate::core::boundary::resolve(
                &p,
                &mut self.x[i],
                &mut self.y[i],
                &mut self.vx[i],
                &mut self.vy[i],
                radius,
            );
        }
    }

    /// Overlay one shared-slice value onto the live pack. Slot numbers stay
    /// `params::id`. Returns false when the slot is not part of that slice.
    pub fn set_pack_slot(&mut self, slot: usize, value: f32) -> bool {
        let flag = value >= 0.5;
        let p = &mut self.params;
        match slot {
            id::GRAVITY_X => p.gravity_x = value,
            id::GRAVITY_Y => p.gravity_y = value,
            id::VELOCITY_DAMPING => p.velocity_damping = value,
            id::COLLISION_ENABLED => p.collision_enabled = flag,
            id::COLLISION_GRID => {
                p.collision_grid = (value.round() as usize).clamp(1, 32);
            }
            id::COLLISION_REPULSION => p.collision_repulsion = value,
            id::COLLISION_RESTITUTION => p.collision_restitution = value,
            id::BOUNDARY_SHAPE => p.boundary_shape = if value <= 0.0 { 0 } else { 1 },
            id::BOUNDARY_MODE => p.boundary_mode = if value <= 0.0 { 0 } else { 1 },
            id::BOUNDARY_RESTITUTION => p.boundary_restitution = value,
            id::BOUNDARY_DAMPING => p.boundary_damping = value,
            id::BOUNDARY_REPULSION => p.boundary_repulsion = value,
            id::ROTATION => self.rotation = value,
            id::TURB_STRENGTH => p.turb_strength = value,
            id::TURB_SCALE => p.turb_scale = value,
            id::TURB_SPEED => p.turb_speed = value,
            id::TURB_ROT_SPEED => p.turb_rot_speed = value,
            id::TURB_PULL => p.turb_pull = value,
            id::TURB_DECAY => p.turb_decay = value,
            id::TURB_FREQ => p.turb_freq = value,
            id::TURB_PATTERN => {
                p.turb_pattern = if value <= 0.0 {
                    0
                } else if value >= 14.0 {
                    14
                } else {
                    value as u8
                };
            }
            id::TURB_CONTRAST => p.turb_contrast = value,
            id::TURB_SEPARATION => p.turb_separation = value,
            id::TURB_WARP => p.turb_warp = value,
            id::TURB_WARP_SPEED => p.turb_warp_speed = value,
            id::TURB_SYMMETRY => p.turb_symmetry = value,
            id::TURB_MIN_SCALE => p.turb_min_scale = value,
            id::TURB_BIAS_STRENGTH => p.turb_bias_strength = value,
            id::TURB_DIR_X => p.turb_dir_x = value,
            id::TURB_DIR_Y => p.turb_dir_y = value,
            id::TURB_AFFECT_POSITION => p.turb_affect_position = flag,
            id::TURB_AFFECT_SCALE => p.turb_affect_scale = flag,
            id::TURB_SCALE_FIELD => p.turb_scale_field = flag,
            _ => return false,
        }
        true
    }

    /// Upload cell rectangles as `x, y, width, height` in render pixel space.
    /// At most [`crate::grid::MAX_CELLS`] rectangles are kept. The value buffer
    /// is not resized, so [`Self::grid_value_buf`] stays put.
    pub fn set_cells(&mut self, rects: &[f32]) {
        self.grid.set_cells(rects);
    }

    /// Write one float per uploaded cell. Does not step particles.
    pub fn grid_eval(
        &mut self,
        mode: u32,
        width: f32,
        height: f32,
        particle_radius: f32,
        render_scale: f32,
        affect_scale: bool,
        collision_grid: u32,
    ) {
        self.grid_mode = mode;
        let count = self.count;
        self.grid.eval(
            mode,
            width,
            height,
            particle_radius,
            render_scale,
            affect_scale,
            collision_grid,
            &self.x,
            &self.y,
            &self.vx,
            &self.vy,
            &self.radius,
            count,
            &self.field,
        );
    }

    pub fn grid_values(&self) -> &[f32] {
        self.grid.active_values()
    }

    pub fn grid_value_buf(&self) -> &[f32] {
        self.grid.value_buf()
    }

    /// Fixed 128×128 turbulence field. The allocation does not move after [`Self::new`].
    pub fn field(&self) -> &[f32] {
        &self.field
    }
}

fn wrap_tau(a: f32) -> f32 {
    let t = std::f32::consts::TAU;
    let mut r = a % t;
    if r < 0.0 {
        r += t;
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::params::{behavior, Params};

    fn quiet(count: usize) -> ParticleSystem {
        let mut ps = ParticleSystem::new(32);
        ps.set_count(count);
        ps.params = Params::default();
        ps.params.velocity_damping = 1.0;
        ps.params.velocity_threshold = 0.0;
        ps.params.position_threshold = 0.0;
        ps.params.collision_enabled = false;
        ps.params.boundary_repulsion = 0.0;
        ps.params.turb_strength = 0.0;
        ps.params.turb_affect_position = false;
        ps.params.turb_affect_scale = false;
        ps.params.turb_scale_field = false;
        ps.params.voronoi_strength = 0.0;
        ps.params.flip_ratio = -1.0;
        ps.params.organic_behavior = behavior::NONE;
        ps.params.gravity_x = 0.0;
        ps.params.gravity_y = 0.0;
        ps
    }

    #[test]
    fn integration_advances_position_by_velocity() {
        let mut ps = quiet(1);
        ps.x[0] = 0.5;
        ps.y[0] = 0.5;
        ps.vx[0] = 0.2;
        ps.vy[0] = 0.0;
        ps.step(0.1);
        assert!(
            (ps.x[0] - 0.52).abs() < 1e-4,
            "expected x=0.52, got {}",
            ps.x[0]
        );
        assert!((ps.vx[0] - 0.2).abs() < 1e-4);
    }

    #[test]
    fn flip_changes_velocity_when_ratio_positive() {
        let mut ps = quiet(2);
        ps.x[0] = 0.5;
        ps.y[0] = 0.5;
        ps.x[1] = 0.5;
        ps.y[1] = 0.5;
        ps.vx[0] = 0.5;
        ps.vx[1] = -0.5;
        ps.params.flip_ratio = 0.0;
        ps.params.flip_iterations = 8;
        ps.params.flip_grid = 32;
        let before = ps.vx[0];
        ps.step(1.0 / 60.0);
        assert!(
            (ps.vx[0] - before).abs() > 1e-3,
            "PIC at ratio 0 should replace opposing velocities, vx={}",
            ps.vx[0]
        );
    }

    #[test]
    fn zero_particle_count_still_advances_rotation() {
        let mut ps = quiet(0);
        ps.set_count(0);
        ps.params.turb_strength = 7.0;
        ps.params.turb_rot_speed = 0.173;
        ps.params.turb_speed = 1.0;
        ps.rotation = 0.0;
        ps.time = 0.0;
        for _ in 0..60 {
            ps.step(1.0 / 60.0);
        }
        assert!(
            ps.rotation.abs() > 0.1,
            "T-RotSpd must advance with P-Count=0, rotation={}",
            ps.rotation
        );
        assert!(
            ps.time > 0.5,
            "T-Speed must advance time with P-Count=0, time={}",
            ps.time
        );
    }

    #[test]
    fn size_only_turbulence_does_not_decay_velocity() {
        let mut ps = quiet(1);
        ps.params.turb_affect_scale = true;
        ps.params.turb_affect_position = false;
        ps.params.turb_scale_field = false;
        ps.params.turb_strength = 4.76;
        ps.params.turb_decay = 0.99;
        ps.params.turb_blur = 0.89;
        ps.params.turb_pattern = crate::config::params::pattern::CIRCLES;
        ps.params.turb_scale = 1.52;
        ps.params.turb_speed = 1.386;
        ps.params.turb_pull = 1.0;
        ps.x[0] = 0.5;
        ps.y[0] = 0.5;
        ps.vx[0] = 0.5;
        ps.vy[0] = 0.0;
        ps.step(1.0 / 60.0);
        assert!(
            (ps.vx[0] - 0.5).abs() < 1e-4,
            "Size-only must leave velocity alone, got vx={}",
            ps.vx[0]
        );
    }

    #[test]
    fn flip_pic_preserves_velocity_when_damping_is_one() {
        let mut ps = quiet(1);
        ps.params.flip_ratio = 1.0;
        ps.params.flip_iterations = 20;
        ps.params.flip_grid = 32;
        ps.params.flip_gas = 2.0;
        ps.params.velocity_damping = 1.0;
        ps.params.boundary_restitution = 1.0;
        ps.params.boundary_damping = 1.0;
        ps.x[0] = 0.5;
        ps.y[0] = 0.5;
        ps.vx[0] = 0.4;
        ps.vy[0] = 0.0;
        ps.step(1.0 / 60.0);
        assert!(
            (ps.vx[0] - 0.4).abs() < 1e-3,
            "PIC identity must not apply gas 0.8 damping; vx={}",
            ps.vx[0]
        );
    }

    #[test]
    fn bouncing_balls_fall_under_gravity_with_flip() {
        let mut ps = quiet(3);
        ps.params.gravity_y = -1.0;
        ps.params.gravity_enabled = true;
        ps.params.flip_ratio = 1.0;
        ps.params.flip_iterations = 20;
        ps.params.flip_grid = 32;
        ps.params.rest_density = 3.6;
        ps.params.particle_radius = 0.05;
        ps.params.collision_enabled = true;
        ps.params.collision_repulsion = 5.0;
        ps.params.collision_restitution = 1.0;
        ps.params.collision_grid = 16;
        ps.params.max_velocity = 1.0;
        ps.params.boundary_damping = 0.8;
        ps.params.boundary_restitution = 1.0;
        ps.params.velocity_threshold = 0.001;
        ps.params.position_threshold = 0.0001;
        ps.x[0] = 0.35;
        ps.y[0] = 0.65;
        ps.x[1] = 0.50;
        ps.y[1] = 0.70;
        ps.x[2] = 0.65;
        ps.y[2] = 0.65;
        for i in 0..3 {
            ps.radius[i] = 0.05;
            ps.vx[i] = 0.0;
            ps.vy[i] = 0.0;
        }
        let y0 = [ps.y[0], ps.y[1], ps.y[2]];
        for _ in 0..90 {
            ps.step(0.032);
        }
        let fell = (0..3).any(|i| ps.y[i] < y0[i] - 0.02);
        assert!(
            fell,
            "balls should fall under gravity with FLIP on; y0={y0:?} y={:?}",
            &ps.y[..3]
        );
    }

    #[test]
    fn attract_impulse_survives_flip_toward_target() {
        let mut ps = quiet(3);
        ps.params.flip_ratio = 1.0;
        ps.params.flip_iterations = 20;
        ps.params.flip_grid = 32;
        ps.params.rest_density = 3.6;
        ps.params.particle_radius = 0.05;
        ps.params.collision_enabled = true;
        ps.params.collision_repulsion = 5.0;
        ps.params.max_velocity = 1.0;
        ps.params.gravity_y = 0.0;
        ps.x[0] = 0.30;
        ps.y[0] = 0.50;
        ps.x[1] = 0.70;
        ps.y[1] = 0.50;
        ps.x[2] = 0.50;
        ps.y[2] = 0.70;
        for i in 0..3 {
            ps.radius[i] = 0.05;
        }
        let dist = |e: &ParticleSystem, i: usize| {
            let dx = e.x[i] - 0.5;
            let dy = e.y[i] - 0.5;
            (dx * dx + dy * dy).sqrt()
        };
        let before: Vec<f32> = (0..3).map(|i| dist(&ps, i)).collect();
        for _ in 0..45 {
            for i in 0..3 {
                let dx = ps.x[i] - 0.5;
                let dy = ps.y[i] - 0.5;
                let d = (dx * dx + dy * dy).sqrt().max(1e-6);
                ps.vx[i] = -dx / d * 0.25;
                ps.vy[i] = -dy / d * 0.25;
            }
            ps.step(0.032);
        }
        let after: Vec<f32> = (0..3).map(|i| dist(&ps, i)).collect();
        let improved = (0..3).filter(|&i| after[i] < before[i] - 0.02).count();
        assert!(
            improved >= 2,
            "attract should pull balls inward through FLIP; before={before:?} after={after:?}"
        );
    }

    fn ring_spawn(ps: &mut ParticleSystem, boundary_radius: f32) {
        let n = ps.count;
        let rings = (n as f32).sqrt().ceil() as usize;
        let particles_per_ring = (n + rings - 1) / rings;
        let spawn_radius = boundary_radius * 0.95;
        let mut index = 0usize;
        for ring in 0..rings {
            if index >= n {
                break;
            }
            let ring_radius = spawn_radius * (ring + 1) as f32 / rings as f32;
            let mut ring_particles = particles_per_ring * (ring + 1) / 2;
            ring_particles = ring_particles.min(n - index);
            for i in 0..ring_particles {
                if index >= n {
                    break;
                }
                let angle = i as f32 / ring_particles as f32 * std::f32::consts::TAU;
                ps.x[index] = 0.5 + angle.cos() * ring_radius;
                ps.y[index] = 0.5 + angle.sin() * ring_radius;
                ps.vx[index] = 0.0;
                ps.vy[index] = 0.0;
                index += 1;
            }
        }
    }

    /// Screen-space clockwise is positive: y grows downward, so L = rx*vy - ry*vx.
    fn mean_clockwise(ps: &ParticleSystem) -> f32 {
        let n = ps.count.max(1) as f32;
        let mut cx = 0.0;
        let mut cy = 0.0;
        for i in 0..ps.count {
            cx += ps.x[i];
            cy += ps.y[i];
        }
        cx /= n;
        cy /= n;
        let mut spin = 0.0;
        for i in 0..ps.count {
            let rx = ps.x[i] - cx;
            let ry = ps.y[i] - cy;
            spin += rx * ps.vy[i] - ry * ps.vx[i];
        }
        spin / n
    }

    #[test]
    fn swarm_ring_does_not_pick_up_clockwise_spin() {
        // Swarm_01: rings spawn clockwise on screen, alignment is strong, and
        // collision is on. Updating vx inside the neighbor loop used to lock
        // that order into a clockwise current (spin about +0.02 after 8s).
        // The JS pass writes forces only after every particle has been scored.
        let mut ps = ParticleSystem::new(360);
        ps.set_count(360);
        ps.params = Params::default();
        ps.params.velocity_damping = 1.0;
        ps.params.velocity_threshold = 0.0;
        ps.params.position_threshold = 0.0;
        ps.params.max_velocity = 1.0;
        ps.params.particle_radius = 0.008;
        ps.params.collision_enabled = true;
        ps.params.collision_grid = 10;
        ps.params.collision_repulsion = 0.5;
        ps.params.collision_restitution = 0.8;
        ps.params.rest_density = 2.0;
        ps.params.boundary_repulsion = 0.0;
        ps.params.boundary_radius = 0.5;
        ps.params.boundary_damping = 0.8;
        ps.params.boundary_restitution = 1.0;
        ps.params.turb_strength = 0.0;
        ps.params.turb_affect_position = false;
        ps.params.turb_affect_scale = false;
        ps.params.turb_scale_field = false;
        ps.params.voronoi_strength = 0.0;
        ps.params.flip_ratio = -1.0;
        ps.params.gravity_x = 0.0;
        ps.params.gravity_y = 0.0;
        ps.params.organic_behavior = behavior::SWARM;
        ps.params.organic_radius = 66.405;
        ps.params.organic_swarm_cohesion = 2.0;
        ps.params.organic_swarm_alignment = 2.0;
        ps.params.organic_swarm_separation = 1.48;
        ps.params.organic_swarm_max_speed = 0.763;
        ring_spawn(&mut ps, 0.5);
        for _ in 0..480 {
            ps.step(1.0 / 60.0);
        }
        let spin = mean_clockwise(&ps);
        assert!(
            spin < 0.005,
            "swarm should not develop a clockwise current, spin={spin}"
        );
    }

    fn swarm01_base(count: usize) -> ParticleSystem {
        let mut ps = ParticleSystem::new(count);
        ps.set_count(count);
        ps.params = Params::default();
        ps.params.velocity_damping = 1.0;
        ps.params.velocity_threshold = 0.0;
        ps.params.position_threshold = 0.0;
        ps.params.max_velocity = 1.0;
        ps.params.particle_radius = 0.008;
        ps.params.collision_enabled = true;
        ps.params.collision_grid = 10;
        ps.params.collision_repulsion = 0.5;
        ps.params.collision_restitution = 0.8;
        ps.params.rest_density = 2.0;
        ps.params.boundary_radius = 0.5;
        ps.params.boundary_damping = 0.8;
        ps.params.boundary_restitution = 1.0;
        ps.params.boundary_repulsion = 0.0;
        ps.params.gravity_x = 0.0;
        ps.params.gravity_y = 0.0;
        ps.params.flip_ratio = -1.0;
        ps.params.voronoi_strength = 0.0;
        ps.params.organic_behavior = behavior::SWARM;
        ps.params.organic_radius = 66.405;
        ps.params.organic_swarm_cohesion = 2.0;
        ps.params.organic_swarm_alignment = 2.0;
        ps.params.organic_swarm_separation = 1.48;
        ps.params.organic_swarm_max_speed = 0.763;
        ps.params.turb_strength = 0.19;
        ps.params.turb_scale = 3.0;
        ps.params.turb_speed = 1.0;
        ps.params.turb_rot_speed = 0.0;
        ps.params.turb_pull = 1.0;
        ps.params.turb_decay = 0.99;
        ps.params.turb_freq = 2.0;
        ps.params.turb_pattern = crate::config::params::pattern::WAVES;
        ps.params.turb_contrast = 0.5;
        ps.params.turb_phase_speed = -1.0;
        ps.params.turb_blur = 0.8;
        ps.params.turb_min_scale = 0.008;
        ps.params.turb_max_scale = 0.03;
        ps.params.turb_affect_position = false;
        ps.params.turb_affect_scale = true;
        ps.params.turb_scale_field = false;
        ps.params.turb_offset_x = 0.0;
        ps.params.turb_offset_y = 0.0;
        ps.params.turb_bias_strength = 0.3;
        ring_spawn(&mut ps, 0.5);
        for i in 0..count {
            ps.radius[i] = 0.008;
        }
        ps
    }

    #[test]
    fn swarm01_size_wave_keeps_negative_field_at_min_size() {
        // Original size is `min + noise * (max - min)` clamped. Noise is [-1, 1],
        // so the negative lobe is T-Min Size and only positive crests grow.
        // `(noise + 1) / 2` made the average particle mid-size (Gate_02 looked
        // bulky; Swarm_01 could not pack small and then get pushed).
        let mut ps = swarm01_base(220);
        ps.step(1.0 / 60.0);
        let mut at_min = 0usize;
        let mut peak = 0.0_f32;
        for i in 0..ps.count {
            if ps.radius[i] <= ps.params.turb_min_scale + 1e-4 {
                at_min += 1;
            }
            peak = peak.max(ps.radius[i]);
        }
        let min_frac = at_min as f32 / ps.count as f32;
        assert!(
            min_frac > 0.35,
            "negative field samples should sit on T-Min Size, fraction={min_frac} peak={peak}"
        );
        assert!(
            peak > 0.02,
            "positive crests should grow toward T-Max Size, peak={peak}"
        );
    }

    fn park_on_rim(ps: &mut ParticleSystem, angle: f32) {
        let radius = ps.params.particle_radius;
        let safe = ps.params.boundary_radius - radius - 0.001;
        ps.x[0] = ps.params.boundary_cx + angle.cos() * safe;
        ps.y[0] = ps.params.boundary_cy + angle.sin() * safe;
        ps.vx[0] = 0.0;
        ps.vy[0] = 0.0;
        ps.radius[0] = radius;
    }

    fn rim_dist(ps: &ParticleSystem) -> f32 {
        let dx = ps.x[0] - ps.params.boundary_cx;
        let dy = ps.y[0] - ps.params.boundary_cy;
        (dx * dx + dy * dy).sqrt()
    }

    /// A particle parked on the diagonal sits in a PIC cell whose center is
    /// outside the circle. That cell was marked solid and its velocity forced
    /// to 0, so gravity, repulsion, and turbulence never integrated. Flip 0
    /// skips that pass and does move.
    #[test]
    fn flip_one_releases_rim_particle_under_inward_force() {
        let steps = 30;
        let dt = 1.0 / 60.0;
        let run = |flip: f32, repulsion: f32, gravity: bool, turb: bool| {
            let mut ps = quiet(1);
            ps.params.flip_ratio = flip;
            ps.params.flip_grid = 32;
            ps.params.flip_iterations = 20;
            ps.params.boundary_radius = 0.5;
            ps.params.boundary_repulsion = repulsion;
            ps.params.particle_radius = 0.01;
            ps.params.max_velocity = 1.0;
            park_on_rim(&mut ps, std::f32::consts::FRAC_PI_4);
            if gravity {
                let dx = ps.params.boundary_cx - ps.x[0];
                let dy = ps.params.boundary_cy - ps.y[0];
                let d = (dx * dx + dy * dy).sqrt().max(1e-6);
                ps.params.gravity_x = dx / d * 4.0;
                ps.params.gravity_y = dy / d * 4.0;
                ps.params.gravity_enabled = true;
            }
            if turb {
                ps.params.turb_affect_position = true;
                ps.params.turb_strength = 8.0;
                ps.params.turb_pull = 1.0;
                ps.params.turb_scale = 3.0;
                ps.params.turb_decay = 1.0;
                ps.params.turb_blur = 0.0;
            }
            let start = rim_dist(&ps);
            for _ in 0..steps {
                ps.step(dt);
            }
            let dist = rim_dist(&ps);
            (start - dist, dist)
        };

        let drop = |label: &str, flip: f32, repulsion: f32, gravity: bool, turb: bool| {
            let (inward, dist) = run(flip, repulsion, gravity, turb);
            assert!(
                inward > 0.02,
                "{label} should leave the wall, inward={inward} dist={dist}"
            );
        };
        drop("flip 0 gravity", 0.0, 0.0, true, false);
        drop("flip 1 gravity", 1.0, 0.0, true, false);
        drop("flip 0 repulsion", 0.0, 1.0, false, false);
        drop("flip 1 repulsion", 1.0, 1.0, false, false);
        drop("flip 0 turbulence", 0.0, 0.0, false, true);
        drop("flip 1 turbulence", 1.0, 0.0, false, true);
    }

    #[test]
    fn flip_one_pile_leaves_wall_when_gravity_reverses() {
        let mut ps = ParticleSystem::new(200);
        let count = 160;
        ps.set_count(count);
        ps.params.flip_ratio = 1.0;
        ps.params.flip_grid = 32;
        ps.params.flip_iterations = 20;
        ps.params.gravity_enabled = true;
        ps.params.gravity_y = -1.5;
        ps.params.velocity_damping = 0.98;
        ps.params.velocity_threshold = 0.001;
        ps.params.position_threshold = 0.0001;
        ps.params.collision_enabled = true;
        ps.params.collision_repulsion = 0.5;
        ps.params.collision_restitution = 0.8;
        ps.params.collision_grid = 10;
        ps.params.particle_radius = 0.012;
        ps.params.boundary_radius = 0.5;
        ps.params.boundary_damping = 0.95;
        ps.params.boundary_restitution = 0.8;
        ps.params.boundary_repulsion = 0.1;
        ps.params.max_velocity = 1.0;
        ps.params.turb_strength = 0.0;
        ps.params.turb_affect_position = false;
        ps.params.organic_behavior = behavior::NONE;
        let mut seed = 1u32;
        for i in 0..count {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let ang = ((seed >> 8) as f32 / 16_777_216.0) * std::f32::consts::TAU;
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let rad = 0.05 + ((seed >> 8) as f32 / 16_777_216.0) * 0.40;
            ps.x[i] = 0.5 + ang.cos() * rad;
            ps.y[i] = 0.5 + ang.sin() * rad;
            ps.vx[i] = 0.0;
            ps.vy[i] = 0.0;
            ps.radius[i] = 0.012;
        }
        let dt = 1.0 / 60.0;
        for _ in 0..180 {
            ps.step(dt);
        }
        let on_bottom = |e: &ParticleSystem| {
            (0..count)
                .filter(|&i| {
                    let dx = e.x[i] - 0.5;
                    let dy = e.y[i] - 0.5;
                    let dist = (dx * dx + dy * dy).sqrt();
                    e.y[i] < 0.28 && dist > 0.42
                })
                .count()
        };
        let piled = on_bottom(&ps);
        ps.params.gravity_y = 1.5;
        for _ in 0..120 {
            ps.step(dt);
        }
        let still = on_bottom(&ps);
        assert!(
            piled > 20,
            "particles should settle on the bottom under gravity, count={piled}"
        );
        assert!(
            still * 2 < piled,
            "a reversed gravity should pull the pile off the wall, before={piled} after={still}"
        );

        ps.params.gravity_y = -1.5;
        for _ in 0..120 {
            ps.step(dt);
        }
        let stuck_again = on_bottom(&ps);
        assert!(stuck_again > 20, "pile should reform, count={stuck_again}");
        ps.params.gravity_x = 0.0;
        ps.params.gravity_y = 0.0;
        ps.params.velocity_damping = 1.0;
        let mut pushed = [0usize; 200];
        let mut touched = 0usize;
        let mut mean_before = 0.0f32;
        for i in 0..count {
            let dx = ps.x[i] - 0.5;
            let dy = ps.y[i] - 0.5;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist > 0.40 {
                let d = dist.max(1e-6);
                ps.vx[i] = -dx / d * 0.5;
                ps.vy[i] = -dy / d * 0.5;
                pushed[touched] = i;
                touched += 1;
                mean_before += dist;
            }
        }
        assert!(touched > 10, "expected rim particles to push, count={touched}");
        mean_before /= touched as f32;
        for _ in 0..20 {
            ps.step(dt);
        }
        let mut mean_after = 0.0f32;
        for i in 0..touched {
            let idx = pushed[i];
            let dx = ps.x[idx] - 0.5;
            let dy = ps.y[idx] - 0.5;
            mean_after += (dx * dx + dy * dy).sqrt();
        }
        mean_after /= touched as f32;
        assert!(
            mean_before - mean_after > 0.05,
            "an inward push should release the rim, before={mean_before} after={mean_after}"
        );
    }

    #[test]
    fn organic_swarm_pushes_neighbors_apart() {
        let mut ps = quiet(2);
        ps.x[0] = 0.50;
        ps.y[0] = 0.50;
        ps.x[1] = 0.52;
        ps.y[1] = 0.50;
        ps.params.organic_behavior = behavior::SWARM;
        ps.params.organic_radius = 30.0;
        ps.params.organic_swarm_cohesion = 0.0;
        ps.params.organic_swarm_alignment = 0.0;
        ps.params.organic_swarm_separation = 2.0;
        ps.params.organic_swarm_max_speed = 1.0;
        ps.step(1.0 / 60.0);
        assert!(ps.vx[0] < 0.0, "left particle should move away, vx={}", ps.vx[0]);
        assert!(ps.vx[1] > 0.0, "right particle should move away, vx={}", ps.vx[1]);
    }
}
