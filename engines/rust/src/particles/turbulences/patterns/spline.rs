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
    evenodd: bool,
    segs: Vec<Seg>,
}

const GRID: usize = 64;

struct Store {
    mode: u8,
    contours: Vec<Contour>,
    grid: Vec<f32>,
    grid_freq: f32,
    grid_ready: bool,
}

static STORE: Mutex<Store> = Mutex::new(Store {
    mode: 0,
    contours: Vec::new(),
    grid: Vec::new(),
    grid_freq: 0.0,
    grid_ready: false,
});

pub fn set_buffer(data: &[f32]) {
    let mut store = STORE.lock().expect("spline store");
    store.mode = 0;
    store.contours.clear();
    store.grid_ready = false;
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
        let flag = data[i + 1];
        let closed = flag != 0.0;
        let evenodd = flag >= 1.5;
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
        store.contours.push(Contour { closed, evenodd, segs });
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

fn exact_at(x: f32, y: f32, freq: f32, mode: u8, contours: &[Contour]) -> f32 {
    if contours.is_empty() {
        return 0.0;
    }
    if mode == 1 {
        let w = winding(x, y, contours);
        let evenodd = contours.iter().any(|c| c.evenodd);
        let inside = if evenodd { w.abs() % 2 == 1 } else { w != 0 };
        let hit = nearest(x, y, contours, true);
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
    let Some((dist, arc)) = nearest(x, y, contours, false) else {
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

fn raster(contours: &[Contour], mode: u8, freq: f32) -> Vec<f32> {
    let mut grid = vec![0.0; GRID * GRID];
    let n = GRID as f32;
    for j in 0..GRID {
        let y = (j as f32 + 0.5) / n;
        for i in 0..GRID {
            let x = (i as f32 + 0.5) / n;
            grid[j * GRID + i] = exact_at(x, y, freq, mode, contours);
        }
    }
    grid
}

fn sample_grid(grid: &[f32], x: f32, y: f32) -> f32 {
    if !(0.0..=1.0).contains(&x) || !(0.0..=1.0).contains(&y) {
        return 0.0;
    }
    let n = GRID as f32;
    let u = (x * n - 0.5).clamp(0.0, n - 1.001);
    let v = (y * n - 0.5).clamp(0.0, n - 1.001);
    let x0 = u.floor() as usize;
    let y0 = v.floor() as usize;
    let x1 = (x0 + 1).min(GRID - 1);
    let y1 = (y0 + 1).min(GRID - 1);
    let tx = u - x0 as f32;
    let ty = v - y0 as f32;
    let i00 = grid[y0 * GRID + x0];
    let i10 = grid[y0 * GRID + x1];
    let i01 = grid[y1 * GRID + x0];
    let i11 = grid[y1 * GRID + x1];
    let a = i00 * (1.0 - tx) + i10 * tx;
    let b = i01 * (1.0 - tx) + i11 * tx;
    a * (1.0 - ty) + b * ty
}

pub(crate) fn value(x: f32, y: f32, _cx: f32, _cy: f32, freq: f32) -> f32 {
    let mut store = STORE.lock().expect("spline store");
    if store.contours.is_empty() {
        return 0.0;
    }
    if !store.grid_ready || store.grid_freq != freq {
        let grid = raster(&store.contours, store.mode, freq);
        store.grid = grid;
        store.grid_freq = freq;
        store.grid_ready = true;
    }
    sample_grid(&store.grid, x, y)
}

#[cfg(test)]
fn exact(x: f32, y: f32, freq: f32) -> f32 {
    let store = STORE.lock().expect("spline store");
    exact_at(x, y, freq, store.mode, &store.contours)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn square() -> Vec<f32> {
        vec![1.0, 1.0, 4.0, 1.0, 0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8]
    }

    #[test]
    fn fill_center_and_outside_corner() {
        let _guard = TEST_LOCK.lock().expect("spline test lock");
        let mut buf = square();
        buf[0] = 1.0;
        set_buffer(&buf);
        assert!((exact(0.5, 0.5, 2.0) - 0.5).abs() < 1e-5);
        assert!(exact(0.1, 0.1, 2.0).abs() < 1e-5);
    }

    #[test]
    fn bands_center_matches_circles_at_distance_0_3() {
        let _guard = TEST_LOCK.lock().expect("spline test lock");
        let mut buf = square();
        buf[0] = 0.0;
        set_buffer(&buf);
        let expected = (0.3_f32 * 2.0 * std::f32::consts::PI * 0.3).sin();
        let got = exact(0.5, 0.5, 2.0);
        assert!((got - expected).abs() < 1e-5, "{got} vs {expected}");
    }

    #[test]
    fn along_bottom_midpoint_uses_arc_0_3() {
        let _guard = TEST_LOCK.lock().expect("spline test lock");
        let mut buf = square();
        buf[0] = 2.0;
        set_buffer(&buf);
        let expected = (0.3_f32 * 2.0 * std::f32::consts::PI * 0.3).sin();
        let got = exact(0.5, 0.2, 2.0);
        assert!((got - expected).abs() < 1e-5, "{got} vs {expected}");
        assert!(exact(0.5, 0.5, 2.0).abs() < 1e-5);
    }

    #[test]
    fn empty_buffer_returns_0_and_checker_math_is_untouched() {
        let _guard = TEST_LOCK.lock().expect("spline test lock");
        set_buffer(&[]);
        assert_eq!(value(0.5, 0.5, 0.5, 0.5, 2.0), 0.0);
    }
}
