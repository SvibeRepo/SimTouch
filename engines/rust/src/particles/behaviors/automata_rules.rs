//! Automata state init and update.

use crate::particles::core::collision::CollisionBins;
use crate::config::params::Params;
use super::neighbor_search::{gather, reach_cells, Near, NEAR_CAP};

pub(crate) fn ensure_states(state: &mut [f32], state_init: &mut [u8], count: usize) {
    for i in 0..count {
        if state_init[i] == 0 {
            let h = (i as f32 * 12.9898).sin() * 43758.5453;
            state[i] = (h - h.floor()).abs().clamp(0.0, 1.0);
            state_init[i] = 1;
        }
    }
}

pub(crate) fn update_automata(
    bins: &CollisionBins,
    x: &[f32],
    y: &[f32],
    state: &[f32],
    state_next: &mut [f32],
    count: usize,
    p: &Params,
) {
    let reach = reach_cells(p.organic_radius);
    for i in 0..count {
        let mut near = [Near { idx: 0, dist: 0.0 }; NEAR_CAP];
        let nnear = gather(bins, x, y, i, count, p.organic_radius, reach, &mut near);
        let mut avg = 0.0;
        for k in 0..nnear {
            avg += state[near[k].idx as usize];
        }
        let current = state[i];
        avg = if nnear > 0 { avg / nnear as f32 } else { current };
        let mut next = current;
        if (avg - current).abs() > p.organic_auto_threshold {
            next += (avg - current) * 0.1;
        }
        state_next[i] = next.clamp(0.0, 1.0);
    }
}
