//! Chain link bookkeeping.

pub const MAX_LINKS: usize = 16;

pub(crate) fn linked(links: &[u16], link_count: &[u16], i: usize, j: usize) -> bool {
    let n = link_count[i] as usize;
    for s in 0..n {
        if links[i * MAX_LINKS + s] as usize == j {
            return true;
        }
    }
    false
}

pub(crate) fn push_link(links: &mut [u16], link_count: &mut [u16], i: usize, j: usize) {
    let n = link_count[i] as usize;
    if n >= MAX_LINKS {
        return;
    }
    links[i * MAX_LINKS + n] = j as u16;
    link_count[i] = (n + 1) as u16;
}
