// One headless step of the Rust tick for fixtures/gravity-step.json.
// Build from engines/rust:
//   cargo build --bin slice_step
//
// Stdin matches the C++ runner, except each field index is a Rust pack slot
// (params::id), not a suit registry index:
//   dt timeScale particleRadius maxVelocity
//   fieldCount
//   packSlot value
//   particleCount
//   x y vx vy
// Stdout: one "x y vx vy" line per particle.

use sim_core::ParticleSystem;
use std::io::{self, Read};
use std::process::exit;

fn take<'a>(it: &mut impl Iterator<Item = &'a str>, what: &str) -> &'a str {
    match it.next() {
        Some(token) => token,
        None => {
            eprintln!("slice_step: expected {what}");
            exit(1);
        }
    }
}

fn num(token: &str) -> f32 {
    match token.parse::<f32>() {
        Ok(v) if v.is_finite() => v,
        _ => {
            eprintln!("slice_step: bad number {token}");
            exit(1);
        }
    }
}

fn count_of(token: &str) -> usize {
    match token.parse::<usize>() {
        Ok(v) => v,
        Err(_) => {
            eprintln!("slice_step: bad count {token}");
            exit(1);
        }
    }
}

fn main() {
    let mut text = String::new();
    if io::stdin().read_to_string(&mut text).is_err() {
        eprintln!("slice_step: could not read stdin");
        exit(1);
    }
    let mut it = text.split_whitespace();
    let dt = num(take(&mut it, "dt timeScale radius maxVelocity"));
    let time_scale = num(take(&mut it, "timeScale"));
    let radius = num(take(&mut it, "particleRadius"));
    let max_velocity = num(take(&mut it, "maxVelocity"));
    let field_count = count_of(take(&mut it, "fieldCount"));

    let mut slots = Vec::with_capacity(field_count);
    for _ in 0..field_count {
        let index = count_of(take(&mut it, "pack slot"));
        let value = num(take(&mut it, "pack value"));
        slots.push((index, value));
    }

    let count = count_of(take(&mut it, "particleCount"));
    if count < 1 || count > 4096 {
        eprintln!("slice_step: particle count {count} is out of range");
        exit(1);
    }

    let mut ps = ParticleSystem::new(count);
    ps.set_count(count);
    ps.params.particle_radius = radius.max(0.0);
    ps.params.max_velocity = max_velocity.max(0.0);
    ps.set_time_scale(time_scale);
    // The lab compare and core/cpp both use a circle of radius 0.5 * 1.03.
    // Boundary scale is not a pack slot.
    ps.params.boundary_radius = 0.5 * 1.03;
    ps.params.boundary_cx = 0.5;
    ps.params.boundary_cy = 0.5;
    // 0 on the slider is PIC. This slice is the ballistic particle step.
    ps.params.flip_ratio = -1.0;

    for (index, value) in slots {
        // Shared chart damping fields are amount (0 = none); pack stores retain.
        let value = if index == sim_core::config::params::id::VELOCITY_DAMPING
            || index == sim_core::config::params::id::BOUNDARY_DAMPING
            || index == sim_core::config::params::id::EXTERNAL_DAMPING
        {
            1.0 - value
        } else {
            value
        };
        if !ps.set_pack_slot(index, value) {
            eprintln!("slice_step: rust pack slot {index} is not on the shared slice");
            exit(1);
        }
    }

    // Offset and blur are off the shared chart. Defaults are 0.5 / -0.5 and 0.
    // The JavaScript compare uses origin 0 and no blur. gravity-step never
    // samples the field (pull is 0), so this pin does not change that fixture.
    ps.params.turb_offset_x = 0.0;
    ps.params.turb_offset_y = 0.0;
    ps.params.turb_blur = 0.0;

    for i in 0..count {
        ps.x[i] = num(take(&mut it, "x"));
        ps.y[i] = num(take(&mut it, "y"));
        ps.vx[i] = num(take(&mut it, "vx"));
        ps.vy[i] = num(take(&mut it, "vy"));
        ps.radius[i] = ps.params.particle_radius;
    }

    ps.step(dt);
    for i in 0..count {
        println!(
            "{:.9} {:.9} {:.9} {:.9}",
            ps.x[i], ps.y[i], ps.vx[i], ps.vy[i]
        );
    }
}
