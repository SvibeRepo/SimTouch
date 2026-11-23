use std::sync::Mutex;

const EDGE: f32 = 0.03;
const STROKE: f32 = 0.015;

struct Seg {
    ax: f32,
    ay: f32,
    bx: f32,
    by: f32,
    cum: f32,
    len: f32,
}

struct Contour {
    closed: bool,
    segs: Vec<Seg>,
}

struct Store {
    mode: u8,
    contours: Vec<Contour>,
}

static STORE: Mutex<Store> = Mutex::new(Store {
    mode: 0,
    contours: Vec::new(),
});

pub fn set_buffer(data: &[f32]) {
    let mut store = STORE.lock().expect("spline store");
    store.mode = 0;
    store.contours.clear();
    if data.len() < 2 {
        return;
    }
    store.mode = data[0] as u8;
    let count = data[1] as usize;
    let mut i = 2;
    for _ in 0..count {
        if i + 2 > data.len() {
            break;
        }
        let n = data[i] as usize;
        let closed = data[i + 1] != 0.0;
        i += 2;
        if i + n * 2 > data.len() {
            break;
        }
        let mut pts = Vec::with_capacity(n);
        for _ in 0..n {
            pts.push((data[i], data[i + 1]));
            i += 2;
        }
        let limit = if closed { n } else { n.saturating_sub(1) };
        let mut segs = Vec::with_capacity(limit);
        let mut cum = 0.0;
        for s in 0..limit {
            let (ax, ay) = pts[s];
            let (bx, by) = pts[(s + 1) % n];
            let len = ((bx - ax).powi(2) + (by - ay).powi(2)).sqrt();
            segs.push(Seg {
                ax,
                ay,
                bx,
                by,
                cum,
                len,
            });
            cum += len;
        }
        store.contours.push(Contour { closed, segs });
    }
}

fn hit(px: f32, py: f32, seg: &Seg) -> (f32, f32) {
    let abx = seg.bx - seg.ax;
    let aby = seg.by - seg.ay;
    let ab2 = abx * abx + aby * aby;
    let mut t = if ab2 > 0.0 {
        ((px - seg.ax) * abx + (py - seg.ay) * aby) / ab2
    } else {
        0.0
    };
    t = t.clamp(0.0, 1.0);
    let dx = seg.ax + abx * t - px;
    let dy = seg.ay + aby * t - py;
    ((dx * dx + dy * dy).sqrt(), seg.cum + t * seg.len)
}

fn nearest(x: f32, y: f32, contours: &[Contour], closed_only: bool) -> Option<(f32, f32)> {
    let mut best: Option<(f32, f32)> = None;
    for contour in contours {
        if closed_only && !contour.closed {
            continue;
        }
        for seg in &contour.segs {
            let (dist, arc) = hit(x, y, seg);
            if best.map(|(d, _)| dist < d).unwrap_or(true) {
                best = Some((dist, arc));
            }
        }
    }
    best
}

fn winding(x: f32, y: f32, contours: &[Contour]) -> i32 {
    let mut w = 0;
    for contour in contours {
        if !contour.closed {
            continue;
        }
        for seg in &contour.segs {
            let (ax, ay, bx, by) = (seg.ax, seg.ay, seg.bx, seg.by);
            if (ay <= y && by > y) || (by <= y && ay > y) {
                let t = (y - ay) / (by - ay);
                if x < ax + t * (bx - ax) {
                    w += if ay <= y { 1 } else { -1 };
                }
            }
        }
    }
    w
}

fn smooth(t: f32) -> f32 {
    let c = t.clamp(0.0, 1.0);
    c * c * (3.0 - 2.0 * c)
}

pub(crate) fn value(x: f32, y: f32, _cx: f32, _cy: f32, freq: f32) -> f32 {
    let store = STORE.lock().expect("spline store");
    if store.contours.is_empty() {
        return 0.0;
    }
    let mode = store.mode;
    if mode == 1 {
        let inside = winding(x, y, &store.contours) != 0;
        let hit = nearest(x, y, &store.contours, true);
        let signed = match hit {
            Some((dist, _)) if inside => -dist,
            Some((dist, _)) => dist,
            None => return 0.0,
        };
        if !inside && signed >= EDGE {
            return 0.0;
        }
        return 0.5 * smooth(0.5 - signed / EDGE);
    }
    let Some((dist, arc)) = nearest(x, y, &store.contours, false) else {
        return 0.0;
    };
    if mode == 0 {
        return (dist * freq * std::f32::consts::PI * 0.3).sin();
    }
    if mode == 2 {
        if dist > STROKE {
            return 0.0;
        }
        return (arc * freq * std::f32::consts::PI * 0.3).sin();
    }
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square() -> Vec<f32> {
        vec![1.0, 1.0, 4.0, 1.0, 0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8]
    }

    #[test]
    fn fill_center_and_outside_corner() {
        let mut buf = square();
        buf[0] = 1.0;
        set_buffer(&buf);
        assert!((value(0.5, 0.5, 0.5, 0.5, 2.0) - 0.5).abs() < 1e-5);
        assert!(value(0.1, 0.1, 0.5, 0.5, 2.0).abs() < 1e-5);
    }

    #[test]
    fn bands_center_matches_circles_at_distance_0_3() {
        let mut buf = square();
        buf[0] = 0.0;
        set_buffer(&buf);
        let expected = (0.3_f32 * 2.0 * std::f32::consts::PI * 0.3).sin();
        let got = value(0.5, 0.5, 0.5, 0.5, 2.0);
        assert!((got - expected).abs() < 1e-5, "{got} vs {expected}");
    }

    #[test]
    fn along_bottom_midpoint_uses_arc_0_3() {
        let mut buf = square();
        buf[0] = 2.0;
        set_buffer(&buf);
        let expected = (0.3_f32 * 2.0 * std::f32::consts::PI * 0.3).sin();
        let got = value(0.5, 0.2, 0.5, 0.5, 2.0);
        assert!((got - expected).abs() < 1e-5, "{got} vs {expected}");
        assert!(value(0.5, 0.5, 0.5, 0.5, 2.0).abs() < 1e-5);
    }

    #[test]
    fn empty_buffer_returns_0_and_checker_math_is_untouched() {
        set_buffer(&[]);
        assert_eq!(value(0.5, 0.5, 0.5, 0.5, 2.0), 0.0);
    }
}
