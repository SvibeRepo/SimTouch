use super::grid_render_manager::{cells_near, pixel, proximity_radius, Grid};

impl Grid {
    pub(super) fn eval_proximity(&mut self, x: &[f32], y: &[f32], count: usize, width: f32, height: f32) {
        const TUNE: f32 = 0.15;
        let radius = proximity_radius(width, height);
        let radius_sq = radius * radius;
        self.assign_containing(x, y, count, width, height);
        let n = self.count;
        for i in 0..n {
            let npart = self.members[i].len();
            if npart == 0 {
                continue;
            }
            let mut total = 0.0;
            for j in 0..n {
                if !cells_near(self.cells[i], self.cells[j], radius) {
                    continue;
                }
                let a_len = self.members[i].len();
                let b_len = self.members[j].len();
                for ia in 0..a_len {
                    let p1 = self.members[i][ia] as usize;
                    let (x1, y1) = pixel(x[p1], y[p1], width, height);
                    for ib in 0..b_len {
                        let p2 = self.members[j][ib] as usize;
                        if p1 == p2 {
                            continue;
                        }
                        let (x2, y2) = pixel(x[p2], y[p2], width, height);
                        let dx = x2 - x1;
                        let dy = y2 - y1;
                        let dist_sq = dx * dx + dy * dy;
                        if dist_sq < radius_sq {
                            total += 1.0 - dist_sq / radius_sq;
                        }
                    }
                }
            }
            self.values[i] = (total / npart as f32) * TUNE;
        }
    }

    pub(super) fn assign_containing(&mut self, x: &[f32], y: &[f32], count: usize, width: f32, height: f32) {
        self.clear_members();
        for i in 0..count {
            let (px, py) = pixel(x[i], y[i], width, height);
            for c in 0..self.count {
                if self.cells[c].contains_point(px, py) {
                    self.members[c].push(i as u32);
                    break;
                }
            }
        }
    }
}
