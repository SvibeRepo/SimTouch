//! Organic behaviors over the shared arrays. Neighbor search uses the fixed
//! collision bins. No per-particle objects.

use crate::particles::core::collision::CollisionBins;
use crate::particles::behaviors::automata_rules::{ensure_states, update_automata};
use crate::particles::behaviors::neighbor_search::{
    gather, reach_cells, Near, NEAR_CAP, ORG_GRID,
};
use crate::particles::forces::organic::{automata_force, chain_force, fluid_force, swarm_force};
use crate::config::params::{behavior, Params};

pub use crate::particles::behaviors::chain::MAX_LINKS;

const FORCE_DAMP: f32 = 0.85;

pub fn apply(
    bins: &mut CollisionBins,
    x: &[f32],
    y: &[f32],
    read_vx: &[f32],
    read_vy: &[f32],
    vx: &mut [f32],
    vy: &mut [f32],
    state: &mut [f32],
    state_next: &mut [f32],
    state_init: &mut [u8],
    link_count: &mut [u16],
    links: &mut [u16],
    count: usize,
    p: &Params,
    dt: f32,
) {
    if p.organic_behavior == behavior::NONE || count == 0 {
        return;
    }
    bins.rebuild(x, y, count, ORG_GRID, 1.0, 1.0);
    if p.organic_behavior == behavior::AUTOMATA {
        ensure_states(state, state_init, count);
        update_automata(bins, x, y, state, state_next, count, p);
        for i in 0..count {
            state[i] = state_next[i];
        }
    } else if p.organic_behavior != behavior::CHAIN {
        for c in link_count.iter_mut().take(count) {
            *c = 0;
        }
    }

    let reach = reach_cells(p.organic_radius);
    for i in 0..count {
        let mut near = [Near { idx: 0, dist: 0.0 }; NEAR_CAP];
        let nnear = gather(bins, x, y, i, count, p.organic_radius, reach, &mut near);
        let (mut fx, mut fy) = match p.organic_behavior {
            behavior::FLUID => fluid_force(x, y, read_vx, read_vy, i, &near, nnear, p),
            behavior::SWARM => swarm_force(x, y, read_vx, read_vy, i, &near, nnear, p),
            behavior::AUTOMATA => automata_force(x, y, state, i, &near, nnear, p),
            behavior::CHAIN => chain_force(x, y, i, &near, nnear, link_count, links, count, p),
            _ => (0.0, 0.0),
        };
        fx *= FORCE_DAMP;
        fy *= FORCE_DAMP;
        vx[i] += fx * dt;
        vy[i] += fy * dt;
    }
}
