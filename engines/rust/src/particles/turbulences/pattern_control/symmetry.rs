pub fn symmetry(x: f32, y: f32, amount: f32, cx: f32, cy: f32) -> (f32, f32) {
    if amount <= 0.0 {
        return (x, y);
    }
    let dx = x - cx;
    let dy = y - cy;
    let dist = (dx * dx + dy * dy).sqrt();
    let angle = dy.atan2(dx);
    let symmetric = angle * (1.0 + amount);
    (cx + dist * symmetric.cos(), cy + dist * symmetric.sin())
}
