//! Fluid, swarm, automata, and chain force formulas.

use crate::particles::behaviors::chain::{linked, push_link, MAX_LINKS};
use crate::particles::behaviors::neighbor_search::{Near, NEAR_CAP, PIXEL};
use crate::config::params::Params;

pub(crate) fn fluid_force(
    x: &[f32],
    y: &[f32],
    vx: &[f32],
    vy: &[f32],
    i: usize,
    near: &[Near; NEAR_CAP],
    nnear: usize,
    p: &Params,
) -> (f32, f32) {
    let mut fx = 0.0;
    let mut fy = 0.0;
    let pix = x[i] * PIXEL;
    let piy = y[i] * PIXEL;
    let pvx = vx[i] * PIXEL;
    let pvy = vy[i] * PIXEL;
    let tension_scale = p.organic_fluid_tension_scale * 0.1;
    let visc_scale = p.organic_fluid_visc_scale * 0.05;
    for k in 0..nnear {
        let j = near[k].idx as usize;
        let dx = x[j] * PIXEL - pix;
        let dy = y[j] * PIXEL - piy;
        let dist = near[k].dist;
        if dist <= 0.0 || dist >= p.organic_radius {
            continue;
        }
        let t = 1.0 - dist / p.organic_radius;
        let tension = t * t * p.organic_fluid_surface;
        let repulsion = if dist < p.organic_radius * 0.2 {
            1.0 / (dist + 0.1)
        } else {
            0.0
        };
        let nx = dx / (dist + 0.0001);
        let ny = dy / (dist + 0.0001);
        let rel_x = (vx[j] * PIXEL - pvx) * p.organic_fluid_viscosity * visc_scale;
        let rel_y = (vy[j] * PIXEL - pvy) * p.organic_fluid_viscosity * visc_scale;
        fx = (fx + (tension * nx - repulsion * nx) * tension_scale + rel_x).clamp(-0.5, 0.5);
        fy = (fy + (tension * ny - repulsion * ny) * tension_scale + rel_y).clamp(-0.5, 0.5);
    }
    (fx, fy)
}

pub(crate) fn swarm_force(
    x: &[f32],
    y: &[f32],
    vx: &[f32],
    vy: &[f32],
    i: usize,
    near: &[Near; NEAR_CAP],
    nnear: usize,
    p: &Params,
) -> (f32, f32) {
    if nnear == 0 {
        return (0.0, 0.0);
    }
    let pix = x[i] * PIXEL;
    let piy = y[i] * PIXEL;
    let mut center_x = 0.0;
    let mut center_y = 0.0;
    let mut avg_vx = 0.0;
    let mut avg_vy = 0.0;
    let mut sep_x = 0.0;
    let mut sep_y = 0.0;
    let mut count = 0.0;
    for k in 0..nnear {
        let j = near[k].idx as usize;
        let dx = x[j] * PIXEL - pix;
        let dy = y[j] * PIXEL - piy;
        let dist = near[k].dist;
        if dist <= 0.0 || dist >= p.organic_radius {
            continue;
        }
        count += 1.0;
        let repulsion = 1.0 / (dist + 1.0);
        sep_x -= (dx / dist) * repulsion;
        sep_y -= (dy / dist) * repulsion;
        center_x += x[j] * PIXEL;
        center_y += y[j] * PIXEL;
        avg_vx += vx[j] * PIXEL;
        avg_vy += vy[j] * PIXEL;
    }
    if count <= 0.0 {
        return (0.0, 0.0);
    }
    center_x = center_x / count - pix;
    center_y = center_y / count - piy;
    normalize(&mut center_x, &mut center_y);
    avg_vx /= count;
    avg_vy /= count;
    normalize(&mut avg_vx, &mut avg_vy);
    normalize(&mut sep_x, &mut sep_y);
    let mut fx = center_x * p.organic_swarm_cohesion * 0.05
        + avg_vx * p.organic_swarm_alignment * 0.05
        + sep_x * p.organic_swarm_separation * 0.05;
    let mut fy = center_y * p.organic_swarm_cohesion * 0.05
        + avg_vy * p.organic_swarm_alignment * 0.05
        + sep_y * p.organic_swarm_separation * 0.05;
    let mag = (fx * fx + fy * fy).sqrt();
    let max_force = p.organic_swarm_max_speed.max(0.0001);
    if mag > max_force {
        fx *= max_force / mag;
        fy *= max_force / mag;
    }
    (fx, fy)
}

pub(crate) fn automata_force(
    x: &[f32],
    y: &[f32],
    state: &[f32],
    i: usize,
    near: &[Near; NEAR_CAP],
    nnear: usize,
    p: &Params,
) -> (f32, f32) {
    let pix = x[i] * PIXEL;
    let piy = y[i] * PIXEL;
    let mut fx = 0.0;
    let mut fy = 0.0;
    for k in 0..nnear {
        let j = near[k].idx as usize;
        let dx = x[j] * PIXEL - pix;
        let dy = y[j] * PIXEL - piy;
        let dist = near[k].dist;
        if dist <= 0.0 || dist >= p.organic_radius {
            continue;
        }
        let nx = dx / (dist + 0.0001);
        let ny = dy / (dist + 0.0001);
        let state_diff = (state[j] - state[i]).abs();
        let magnitude = if state_diff < p.organic_auto_threshold {
            p.organic_auto_attraction * (1.0 - dist / p.organic_radius)
        } else {
            -p.organic_auto_repulsion * (1.0 - dist / p.organic_radius)
        };
        fx += nx * magnitude;
        fy += ny * magnitude;
    }
    fx = (fx * p.organic_auto_base).clamp(-0.5, 0.5);
    fy = (fy * p.organic_auto_base).clamp(-0.5, 0.5);
    (fx, fy)
}

pub(crate) fn chain_force(
    x: &[f32],
    y: &[f32],
    i: usize,
    near: &[Near; NEAR_CAP],
    nnear: usize,
    link_count: &mut [u16],
    links: &mut [u16],
    count: usize,
    p: &Params,
) -> (f32, f32) {
    if nnear == 0 {
        return (0.0, 0.0);
    }
    let mut order = [0usize; NEAR_CAP];
    for k in 0..nnear {
        order[k] = k;
    }
    for a in 1..nnear {
        let mut b = a;
        while b > 0 && near[order[b]].dist < near[order[b - 1]].dist {
            order.swap(b, b - 1);
            b -= 1;
        }
    }
    let max_links = p.organic_chain_links.min(MAX_LINKS);
    for k in 0..nnear.min(2) {
        if link_count[i] as usize >= max_links {
            break;
        }
        let j = near[order[k]].idx as usize;
        if j >= count || linked(links, link_count, i, j) {
            continue;
        }
        if link_count[j] as usize >= max_links {
            continue;
        }
        if link_count[j] as f32 >= p.organic_chain_branch {
            continue;
        }
        push_link(links, link_count, i, j);
        push_link(links, link_count, j, i);
    }
    let pix = x[i] * PIXEL;
    let piy = y[i] * PIXEL;
    let mut fx = 0.0;
    let mut fy = 0.0;
    let nlinks = link_count[i] as usize;
    for s in 0..nlinks {
        let j = links[i * MAX_LINKS + s] as usize;
        if j >= count {
            continue;
        }
        let dx = x[j] * PIXEL - pix;
        let dy = y[j] * PIXEL - piy;
        let dist = (dx * dx + dy * dy).sqrt();
        if dist <= 0.0 {
            continue;
        }
        let spring = (dist - p.organic_chain_distance) * p.organic_chain_strength * 2.0;
        fx += (dx / dist) * spring;
        fy += (dy / dist) * spring;
    }
    if nlinks >= 2 && p.organic_chain_alignment > 0.0 {
        for a in 0..nlinks {
            for b in (a + 1)..nlinks {
                let ja = links[i * MAX_LINKS + a] as usize;
                let jb = links[i * MAX_LINKS + b] as usize;
                if ja >= count || jb >= count {
                    continue;
                }
                let mut v1x = x[ja] * PIXEL - pix;
                let mut v1y = y[ja] * PIXEL - piy;
                let mut v2x = x[jb] * PIXEL - pix;
                let mut v2y = y[jb] * PIXEL - piy;
                normalize(&mut v1x, &mut v1y);
                normalize(&mut v2x, &mut v2y);
                let dot = v1x * v2x + v1y * v2y;
                let align = (1.0 + dot) * p.organic_chain_alignment * 2.0;
                if align > 0.01 {
                    let mut px = -(v1y + v2y);
                    let mut py = v1x + v2x;
                    let len = (px * px + py * py).sqrt();
                    if len > 0.0 {
                        px /= len;
                        py /= len;
                        fx += px * align;
                        fy += py * align;
                    }
                }
            }
        }
    }
    fx *= p.organic_chain_base;
    fy *= p.organic_chain_base;
    let mag = (fx * fx + fy * fy).sqrt();
    if mag > 2.0 {
        fx *= 2.0 / mag;
        fy *= 2.0 / mag;
    }
    (fx, fy)
}

pub(crate) fn normalize(x: &mut f32, y: &mut f32) {
    let len = (*x * *x + *y * *y).sqrt();
    if len > 1e-6 {
        *x /= len;
        *y /= len;
    }
}
