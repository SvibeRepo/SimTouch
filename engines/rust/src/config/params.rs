//! Panel parameters copied in from JavaScript before `step`.
//! Indices must match `PARAM` in `src/simulation/core/rustCore.js`.

pub const PARAM_COUNT: usize = 107;

pub mod id {
    pub const GRAVITY_X: usize = 0;
    pub const GRAVITY_Y: usize = 1;
    pub const GRAVITY_ENABLED: usize = 2;
    pub const VELOCITY_DAMPING: usize = 3;
    pub const EXTERNAL_DAMPING: usize = 4;
    pub const MAX_VELOCITY: usize = 5;
    pub const VELOCITY_THRESHOLD: usize = 6;
    pub const POSITION_THRESHOLD: usize = 7;
    pub const PARTICLE_RADIUS: usize = 8;
    pub const REST_DENSITY: usize = 9;
    pub const TIME: usize = 10;
    pub const ROTATION: usize = 11;
    pub const BIAS_X: usize = 12;
    pub const BIAS_Y: usize = 13;
    pub const BIAS_VX: usize = 14;
    pub const BIAS_VY: usize = 15;

    pub const COLLISION_ENABLED: usize = 16;
    pub const COLLISION_GRID: usize = 17;
    pub const COLLISION_REPULSION: usize = 18;
    pub const COLLISION_RESTITUTION: usize = 19;

    pub const BOUNDARY_SHAPE: usize = 20;
    pub const BOUNDARY_MODE: usize = 21;
    pub const BOUNDARY_CX: usize = 22;
    pub const BOUNDARY_CY: usize = 23;
    pub const BOUNDARY_RADIUS: usize = 24;
    pub const BOUNDARY_WIDTH: usize = 25;
    pub const BOUNDARY_HEIGHT: usize = 26;
    pub const BOUNDARY_RESTITUTION: usize = 27;
    pub const BOUNDARY_DAMPING: usize = 28;
    pub const BOUNDARY_REPULSION: usize = 29;
    pub const RECT_MIN_X: usize = 30;
    pub const RECT_MIN_Y: usize = 31;
    pub const RECT_MAX_X: usize = 32;
    pub const RECT_MAX_Y: usize = 33;

    pub const TURB_STRENGTH: usize = 34;
    pub const TURB_SCALE: usize = 35;
    pub const TURB_SPEED: usize = 36;
    pub const TURB_ROT_SPEED: usize = 37;
    pub const TURB_PULL: usize = 38;
    pub const TURB_DECAY: usize = 39;
    pub const TURB_FREQ: usize = 40;
    pub const TURB_PATTERN: usize = 41;
    pub const TURB_CONTRAST: usize = 42;
    pub const TURB_SEPARATION: usize = 43;
    pub const TURB_WARP: usize = 44;
    pub const TURB_WARP_SPEED: usize = 45;
    pub const TURB_SYMMETRY: usize = 46;
    pub const TURB_PHASE: usize = 47;
    pub const TURB_PHASE_SPEED: usize = 48;
    pub const TURB_AMPLITUDE: usize = 49;
    pub const TURB_AMPLITUDE_SPEED: usize = 50;
    pub const TURB_BLUR: usize = 51;
    pub const TURB_MIN_SCALE: usize = 52;
    pub const TURB_BIAS_STRENGTH: usize = 53;
    pub const TURB_BIAS_FRICTION: usize = 54;
    pub const TURB_BIAS_SENSITIVITY: usize = 55;
    pub const TURB_BIAS_ACCEL_X: usize = 56;
    pub const TURB_BIAS_ACCEL_Y: usize = 57;
    pub const TURB_OFFSET_X: usize = 58;
    pub const TURB_OFFSET_Y: usize = 59;
    pub const TURB_DIR_X: usize = 60;
    pub const TURB_DIR_Y: usize = 61;
    pub const TURB_AFFECT_POSITION: usize = 62;
    pub const TURB_AFFECT_SCALE: usize = 63;
    pub const TURB_SCALE_FIELD: usize = 64;
    pub const TURB_AMPLITUDE_ENABLED: usize = 65;
    pub const TURB_CONTRAST_SHADOW: usize = 66;
    pub const TURB_CONTRAST_MID: usize = 67;
    pub const TURB_CONTRAST_HIGH: usize = 68;
    pub const TURB_CONTRAST_DARK: usize = 69;
    pub const TURB_CENTER_X: usize = 70;
    pub const TURB_CENTER_Y: usize = 71;

    pub const VORONOI_STRENGTH: usize = 72;
    pub const VORONOI_EDGE: usize = 73;
    pub const VORONOI_ATTRACTION: usize = 74;
    pub const VORONOI_CELLS: usize = 75;
    pub const VORONOI_SPEED: usize = 76;
    pub const VORONOI_DECAY: usize = 77;
    pub const VORONOI_BLEND: usize = 78;
    pub const VORONOI_PULL: usize = 79;
    pub const VORONOI_SMOOTH: usize = 80;

    pub const FLIP_RATIO: usize = 81;
    pub const FLIP_ITERATIONS: usize = 82;
    pub const FLIP_GRID: usize = 83;
    pub const FLIP_GAS: usize = 84;
    pub const FLIP_OVERRELAX: usize = 85;

    pub const ORGANIC_BEHAVIOR: usize = 86;
    pub const ORGANIC_RADIUS: usize = 87;
    pub const ORGANIC_FLUID_SURFACE: usize = 88;
    pub const ORGANIC_FLUID_VISCOSITY: usize = 89;
    pub const ORGANIC_FLUID_TENSION_SCALE: usize = 90;
    pub const ORGANIC_FLUID_VISC_SCALE: usize = 91;
    pub const ORGANIC_SWARM_COHESION: usize = 92;
    pub const ORGANIC_SWARM_ALIGNMENT: usize = 93;
    pub const ORGANIC_SWARM_SEPARATION: usize = 94;
    pub const ORGANIC_SWARM_MAX_SPEED: usize = 95;
    pub const ORGANIC_AUTO_REPULSION: usize = 96;
    pub const ORGANIC_AUTO_ATTRACTION: usize = 97;
    pub const ORGANIC_AUTO_THRESHOLD: usize = 98;
    pub const ORGANIC_AUTO_BASE: usize = 99;
    pub const ORGANIC_CHAIN_DISTANCE: usize = 100;
    pub const ORGANIC_CHAIN_STRENGTH: usize = 101;
    pub const ORGANIC_CHAIN_ALIGNMENT: usize = 102;
    pub const ORGANIC_CHAIN_LINKS: usize = 103;
    pub const ORGANIC_CHAIN_BRANCH: usize = 104;
    pub const ORGANIC_CHAIN_BASE: usize = 105;
    pub const TURB_MAX_SCALE: usize = 106;
}

pub mod pattern {
    pub const CHECKERBOARD: u8 = 0;
    pub const WAVES: u8 = 1;
    pub const SPIRAL: u8 = 2;
    pub const GRID: u8 = 3;
    pub const CIRCLES: u8 = 4;
    pub const DIAMONDS: u8 = 5;
    pub const RIPPLES: u8 = 6;
    pub const DOTS: u8 = 7;
    pub const WATER: u8 = 8;
    pub const CLASSIC_DROP: u8 = 9;
    pub const CELLS: u8 = 10;
    pub const VORONOI: u8 = 11;
    pub const FRACTAL: u8 = 12;
    pub const VORTEX: u8 = 13;
    pub const BUBBLES: u8 = 14;
    pub const SPLINE: u8 = 15;
}

pub mod behavior {
    pub const NONE: u8 = 0;
    pub const FLUID: u8 = 1;
    pub const SWARM: u8 = 2;
    pub const AUTOMATA: u8 = 3;
    pub const CHAIN: u8 = 4;
}

pub mod boundary_shape {
    pub const CIRCULAR: u8 = 0;
    pub const RECTANGULAR: u8 = 1;
}

pub mod boundary_mode {
    pub const BOUNCE: u8 = 0;
    pub const WARP: u8 = 1;
}

#[derive(Clone, Debug)]
pub struct Params {
    pub gravity_x: f32,
    pub gravity_y: f32,
    pub gravity_enabled: bool,
    /// Playback rate for the whole tick. Not in the float pack; hosts set it.
    pub time_scale: f32,
    pub velocity_damping: f32,
    pub external_damping: f32,
    pub max_velocity: f32,
    pub velocity_threshold: f32,
    pub position_threshold: f32,
    pub particle_radius: f32,
    pub rest_density: f32,

    pub collision_enabled: bool,
    pub collision_grid: usize,
    pub collision_repulsion: f32,
    pub collision_restitution: f32,

    pub boundary_shape: u8,
    pub boundary_mode: u8,
    pub boundary_cx: f32,
    pub boundary_cy: f32,
    pub boundary_radius: f32,
    pub boundary_width: f32,
    pub boundary_height: f32,
    pub boundary_restitution: f32,
    pub boundary_damping: f32,
    pub boundary_repulsion: f32,
    pub rect_min_x: f32,
    pub rect_min_y: f32,
    pub rect_max_x: f32,
    pub rect_max_y: f32,
    /// Caller framebuffer size. Not in the float bag; set by the host.
    pub render_width: f32,
    pub render_height: f32,

    pub turb_strength: f32,
    pub turb_scale: f32,
    pub turb_speed: f32,
    pub turb_rot_speed: f32,
    pub turb_pull: f32,
    pub turb_decay: f32,
    pub turb_freq: f32,
    pub turb_pattern: u8,
    pub turb_contrast: f32,
    pub turb_separation: f32,
    pub turb_warp: f32,
    pub turb_warp_speed: f32,
    pub turb_symmetry: f32,
    pub turb_phase: f32,
    pub turb_phase_speed: f32,
    pub turb_amplitude: f32,
    pub turb_amplitude_speed: f32,
    pub turb_blur: f32,
    pub turb_min_scale: f32,
    pub turb_max_scale: f32,
    pub turb_bias_strength: f32,
    pub turb_bias_friction: f32,
    pub turb_bias_sensitivity: f32,
    pub turb_bias_accel_x: f32,
    pub turb_bias_accel_y: f32,
    pub turb_offset_x: f32,
    pub turb_offset_y: f32,
    pub turb_dir_x: f32,
    pub turb_dir_y: f32,
    pub turb_affect_position: bool,
    pub turb_affect_scale: bool,
    pub turb_scale_field: bool,
    pub turb_amplitude_enabled: bool,
    pub turb_contrast_shadow: f32,
    pub turb_contrast_mid: f32,
    pub turb_contrast_high: f32,
    pub turb_contrast_dark: f32,
    pub turb_center_x: f32,
    pub turb_center_y: f32,

    pub voronoi_strength: f32,
    pub voronoi_edge: f32,
    pub voronoi_attraction: f32,
    pub voronoi_cells: usize,
    pub voronoi_speed: f32,
    pub voronoi_decay: f32,
    pub voronoi_blend: f32,
    pub voronoi_pull: bool,
    pub voronoi_smooth: f32,

    pub flip_ratio: f32,
    pub flip_iterations: usize,
    pub flip_grid: usize,
    pub flip_gas: f32,
    pub flip_overrelax: f32,

    pub organic_behavior: u8,
    pub organic_radius: f32,
    pub organic_fluid_surface: f32,
    pub organic_fluid_viscosity: f32,
    pub organic_fluid_tension_scale: f32,
    pub organic_fluid_visc_scale: f32,
    pub organic_swarm_cohesion: f32,
    pub organic_swarm_alignment: f32,
    pub organic_swarm_separation: f32,
    pub organic_swarm_max_speed: f32,
    pub organic_auto_repulsion: f32,
    pub organic_auto_attraction: f32,
    pub organic_auto_threshold: f32,
    pub organic_auto_base: f32,
    pub organic_chain_distance: f32,
    pub organic_chain_strength: f32,
    pub organic_chain_alignment: f32,
    pub organic_chain_links: usize,
    pub organic_chain_branch: f32,
    pub organic_chain_base: f32,
}

impl Default for Params {
    fn default() -> Self {
        Self {
            gravity_x: 0.0,
            gravity_y: 0.0,
            gravity_enabled: true,
            time_scale: 1.0,
            velocity_damping: 1.0,
            external_damping: 0.95,
            max_velocity: 1.0,
            velocity_threshold: 0.001,
            position_threshold: 0.0001,
            particle_radius: 0.01,
            rest_density: 2.0,
            collision_enabled: false,
            collision_grid: 10,
            collision_repulsion: 0.5,
            collision_restitution: 0.8,
            boundary_shape: boundary_shape::CIRCULAR,
            boundary_mode: boundary_mode::BOUNCE,
            boundary_cx: 0.5,
            boundary_cy: 0.5,
            boundary_radius: 0.5,
            boundary_width: 0.8,
            boundary_height: 0.8,
            boundary_restitution: 0.8,
            boundary_damping: 0.95,
            boundary_repulsion: 0.0,
            rect_min_x: 0.1,
            rect_min_y: 0.1,
            rect_max_x: 0.9,
            rect_max_y: 0.9,
            render_width: 1.0,
            render_height: 1.0,
            turb_strength: 0.0,
            turb_scale: 3.0,
            turb_speed: 1.0,
            turb_rot_speed: 0.0,
            turb_pull: 1.0,
            turb_decay: 1.0,
            turb_freq: 2.0,
            turb_pattern: pattern::CHECKERBOARD,
            turb_contrast: 0.5,
            turb_separation: 0.0,
            turb_warp: 0.0,
            turb_warp_speed: 0.0,
            turb_symmetry: 0.0,
            turb_phase: 0.0,
            turb_phase_speed: -1.0,
            turb_amplitude: 1.0,
            turb_amplitude_speed: 0.0,
            turb_blur: 0.0,
            turb_min_scale: 0.008,
            turb_max_scale: 0.03,
            turb_bias_strength: 0.3,
            turb_bias_friction: 0.05,
            turb_bias_sensitivity: 0.5,
            turb_bias_accel_x: 0.0,
            turb_bias_accel_y: 0.0,
            turb_offset_x: 0.5,
            turb_offset_y: -0.5,
            turb_dir_x: 0.0,
            turb_dir_y: 0.0,
            turb_affect_position: false,
            turb_affect_scale: false,
            turb_scale_field: false,
            turb_amplitude_enabled: false,
            turb_contrast_shadow: 0.1,
            turb_contrast_mid: 0.35,
            turb_contrast_high: 0.7,
            turb_contrast_dark: 1.5,
            turb_center_x: 0.5,
            turb_center_y: 0.5,
            voronoi_strength: 0.0,
            voronoi_edge: 0.3,
            voronoi_attraction: 1.0,
            voronoi_cells: 10,
            voronoi_speed: 0.2,
            voronoi_decay: 0.99,
            voronoi_blend: 0.7,
            voronoi_pull: false,
            voronoi_smooth: 0.3,
            flip_ratio: 0.0,
            flip_iterations: 20,
            flip_grid: 32,
            flip_gas: 2.0,
            flip_overrelax: 1.5,
            organic_behavior: behavior::NONE,
            organic_radius: 30.0,
            organic_fluid_surface: 0.5,
            organic_fluid_viscosity: 0.2,
            organic_fluid_tension_scale: 0.5,
            organic_fluid_visc_scale: 0.2,
            organic_swarm_cohesion: 1.0,
            organic_swarm_alignment: 0.7,
            organic_swarm_separation: 1.2,
            organic_swarm_max_speed: 0.5,
            organic_auto_repulsion: 0.8,
            organic_auto_attraction: 0.5,
            organic_auto_threshold: 0.2,
            organic_auto_base: 0.1,
            organic_chain_distance: 0.0,
            organic_chain_strength: 10.0,
            organic_chain_alignment: 0.5,
            organic_chain_links: 4,
            organic_chain_branch: 2.0,
            organic_chain_base: 1.5,
        }
    }
}

fn flag(v: f32) -> bool {
    v >= 0.5
}

fn u8_clamped(v: f32, max: u8) -> u8 {
    if v <= 0.0 {
        0
    } else if v >= max as f32 {
        max
    } else {
        v as u8
    }
}

impl Params {
    pub fn apply_slice(&mut self, d: &[f32]) {
        if d.len() < PARAM_COUNT {
            return;
        }
        let g = |i: usize| d[i];
        self.gravity_x = g(id::GRAVITY_X);
        self.gravity_y = g(id::GRAVITY_Y);
        self.gravity_enabled = flag(g(id::GRAVITY_ENABLED));
        self.velocity_damping = g(id::VELOCITY_DAMPING);
        self.external_damping = g(id::EXTERNAL_DAMPING);
        self.max_velocity = g(id::MAX_VELOCITY).max(0.0);
        self.velocity_threshold = g(id::VELOCITY_THRESHOLD);
        self.position_threshold = g(id::POSITION_THRESHOLD);
        self.particle_radius = g(id::PARTICLE_RADIUS).max(0.0);
        self.rest_density = g(id::REST_DENSITY);
        self.collision_enabled = flag(g(id::COLLISION_ENABLED));
        self.collision_grid = (g(id::COLLISION_GRID).round() as usize).clamp(1, 32);
        self.collision_repulsion = g(id::COLLISION_REPULSION);
        self.collision_restitution = g(id::COLLISION_RESTITUTION);
        self.boundary_shape = u8_clamped(g(id::BOUNDARY_SHAPE), 1);
        self.boundary_mode = u8_clamped(g(id::BOUNDARY_MODE), 1);
        self.boundary_cx = g(id::BOUNDARY_CX);
        self.boundary_cy = g(id::BOUNDARY_CY);
        self.boundary_radius = g(id::BOUNDARY_RADIUS).max(0.001);
        self.boundary_width = g(id::BOUNDARY_WIDTH).max(0.001);
        self.boundary_height = g(id::BOUNDARY_HEIGHT).max(0.001);
        self.boundary_restitution = g(id::BOUNDARY_RESTITUTION);
        self.boundary_damping = g(id::BOUNDARY_DAMPING);
        self.boundary_repulsion = g(id::BOUNDARY_REPULSION);
        self.rect_min_x = g(id::RECT_MIN_X);
        self.rect_min_y = g(id::RECT_MIN_Y);
        self.rect_max_x = g(id::RECT_MAX_X);
        self.rect_max_y = g(id::RECT_MAX_Y);
        self.turb_strength = g(id::TURB_STRENGTH);
        self.turb_scale = g(id::TURB_SCALE);
        self.turb_speed = g(id::TURB_SPEED);
        self.turb_rot_speed = g(id::TURB_ROT_SPEED);
        self.turb_pull = g(id::TURB_PULL);
        self.turb_decay = g(id::TURB_DECAY);
        self.turb_freq = g(id::TURB_FREQ);
        self.turb_pattern = u8_clamped(g(id::TURB_PATTERN), 15);
        self.turb_contrast = g(id::TURB_CONTRAST);
        self.turb_separation = g(id::TURB_SEPARATION);
        self.turb_warp = g(id::TURB_WARP);
        self.turb_warp_speed = g(id::TURB_WARP_SPEED);
        self.turb_symmetry = g(id::TURB_SYMMETRY);
        self.turb_phase = g(id::TURB_PHASE);
        self.turb_phase_speed = g(id::TURB_PHASE_SPEED);
        self.turb_amplitude = g(id::TURB_AMPLITUDE);
        self.turb_amplitude_speed = g(id::TURB_AMPLITUDE_SPEED);
        self.turb_blur = g(id::TURB_BLUR);
        self.turb_min_scale = g(id::TURB_MIN_SCALE);
        self.turb_max_scale = g(id::TURB_MAX_SCALE).max(0.0);
        self.turb_bias_strength = g(id::TURB_BIAS_STRENGTH);
        self.turb_bias_friction = g(id::TURB_BIAS_FRICTION);
        self.turb_bias_sensitivity = g(id::TURB_BIAS_SENSITIVITY);
        self.turb_bias_accel_x = g(id::TURB_BIAS_ACCEL_X);
        self.turb_bias_accel_y = g(id::TURB_BIAS_ACCEL_Y);
        self.turb_offset_x = g(id::TURB_OFFSET_X);
        self.turb_offset_y = g(id::TURB_OFFSET_Y);
        self.turb_dir_x = g(id::TURB_DIR_X);
        self.turb_dir_y = g(id::TURB_DIR_Y);
        self.turb_affect_position = flag(g(id::TURB_AFFECT_POSITION));
        self.turb_affect_scale = flag(g(id::TURB_AFFECT_SCALE));
        self.turb_scale_field = flag(g(id::TURB_SCALE_FIELD));
        self.turb_amplitude_enabled = flag(g(id::TURB_AMPLITUDE_ENABLED));
        self.turb_contrast_shadow = g(id::TURB_CONTRAST_SHADOW);
        self.turb_contrast_mid = g(id::TURB_CONTRAST_MID);
        self.turb_contrast_high = g(id::TURB_CONTRAST_HIGH);
        self.turb_contrast_dark = g(id::TURB_CONTRAST_DARK);
        self.turb_center_x = g(id::TURB_CENTER_X);
        self.turb_center_y = g(id::TURB_CENTER_Y);
        self.voronoi_strength = g(id::VORONOI_STRENGTH);
        self.voronoi_edge = g(id::VORONOI_EDGE).max(0.0001);
        self.voronoi_attraction = g(id::VORONOI_ATTRACTION);
        self.voronoi_cells = (g(id::VORONOI_CELLS).round() as usize).clamp(2, 48);
        self.voronoi_speed = g(id::VORONOI_SPEED);
        self.voronoi_decay = g(id::VORONOI_DECAY);
        self.voronoi_blend = g(id::VORONOI_BLEND).clamp(0.0, 1.0);
        self.voronoi_pull = flag(g(id::VORONOI_PULL));
        self.voronoi_smooth = g(id::VORONOI_SMOOTH);
        self.flip_ratio = g(id::FLIP_RATIO);
        self.flip_iterations = (g(id::FLIP_ITERATIONS).round() as usize).clamp(0, 40);
        self.flip_grid = (g(id::FLIP_GRID).round() as usize).clamp(4, 32);
        self.flip_gas = g(id::FLIP_GAS).max(0.01);
        self.flip_overrelax = g(id::FLIP_OVERRELAX);
        self.organic_behavior = u8_clamped(g(id::ORGANIC_BEHAVIOR), 4);
        self.organic_radius = g(id::ORGANIC_RADIUS).max(0.0);
        self.organic_fluid_surface = g(id::ORGANIC_FLUID_SURFACE);
        self.organic_fluid_viscosity = g(id::ORGANIC_FLUID_VISCOSITY);
        self.organic_fluid_tension_scale = g(id::ORGANIC_FLUID_TENSION_SCALE);
        self.organic_fluid_visc_scale = g(id::ORGANIC_FLUID_VISC_SCALE);
        self.organic_swarm_cohesion = g(id::ORGANIC_SWARM_COHESION);
        self.organic_swarm_alignment = g(id::ORGANIC_SWARM_ALIGNMENT);
        self.organic_swarm_separation = g(id::ORGANIC_SWARM_SEPARATION);
        self.organic_swarm_max_speed = g(id::ORGANIC_SWARM_MAX_SPEED).max(0.0);
        self.organic_auto_repulsion = g(id::ORGANIC_AUTO_REPULSION);
        self.organic_auto_attraction = g(id::ORGANIC_AUTO_ATTRACTION);
        self.organic_auto_threshold = g(id::ORGANIC_AUTO_THRESHOLD);
        self.organic_auto_base = g(id::ORGANIC_AUTO_BASE);
        self.organic_chain_distance = g(id::ORGANIC_CHAIN_DISTANCE);
        self.organic_chain_strength = g(id::ORGANIC_CHAIN_STRENGTH);
        self.organic_chain_alignment = g(id::ORGANIC_CHAIN_ALIGNMENT);
        self.organic_chain_links = (g(id::ORGANIC_CHAIN_LINKS).round() as usize).clamp(1, 16);
        self.organic_chain_branch = g(id::ORGANIC_CHAIN_BRANCH).max(0.0);
        self.organic_chain_base = g(id::ORGANIC_CHAIN_BASE);
    }
}
