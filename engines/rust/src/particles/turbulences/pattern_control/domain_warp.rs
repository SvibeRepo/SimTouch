use crate::config::params::Params;

pub fn domain_warp(x: f32, y: f32, p: &Params, time: f32, cx: f32, cy: f32) -> (f32, f32) {
    let domain_warp = p.turb_warp;
    if domain_warp <= 0.0 {
        return (x, y);
    }
    let tx = x - cx;
    let ty = y - cy;
    let warp_freq = 2.0;
    let (wx, wy) = if p.turb_speed > 0.0 && p.turb_warp_speed > 0.0 {
        let t = time * p.turb_speed * p.turb_warp_speed;
        (
            tx + domain_warp * (ty * warp_freq + t).sin(),
            ty + domain_warp * (tx * warp_freq + t).cos(),
        )
    } else {
        (
            tx + domain_warp * (ty * warp_freq).sin(),
            ty + domain_warp * (tx * warp_freq).cos(),
        )
    };
    (wx + cx, wy + cy)
}
