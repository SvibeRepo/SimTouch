//! Pointer / finger force. Inactive until `set_touch(..., true)`.

#[derive(Clone, Debug, Default)]
pub struct Touch {
    pub x: f32,
    pub y: f32,
    pub active: bool,
    pub radius: f32,
    pub strength: f32,
    /// false = attract, true = repulse
    pub repulse: bool,
}

impl Touch {
    pub fn set_touch(&mut self, x: f32, y: f32, active: bool) {
        self.x = x.clamp(0.0, 1.0);
        self.y = y.clamp(0.0, 1.0);
        self.active = active;
    }

    pub fn apply(&self, x: &[f32], y: &[f32], vx: &mut [f32], vy: &mut [f32], count: usize) {
        if !self.active || self.radius <= 0.0 || self.strength == 0.0 {
            return;
        }
        let r2 = self.radius * self.radius;
        let signed = if self.repulse {
            -self.strength
        } else {
            self.strength
        };
        for i in 0..count {
            let dx = self.x - x[i];
            let dy = self.y - y[i];
            let d2 = dx * dx + dy * dy;
            if d2 > r2 || d2 < 1e-8 {
                continue;
            }
            let dist = d2.sqrt();
            let nx = dx / dist;
            let ny = dy / dist;
            let falloff = 1.0 - dist / self.radius;
            vx[i] += nx * signed * falloff;
            vy[i] += ny * signed * falloff;
        }
    }
}
