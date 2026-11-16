/**
 * Work-time and frame-gap tracker. Feeds a Stats panel once per second with
 * headroom (frame gap minus work). Headroom 0 paints red; comfortable budget
 * paints green.
 */
export class HeadroomMeter {
  constructor(panel) {
    this.panel = panel;
    this.workMs = [];
    this.gapMs = [];
    this.lastFrameAt = 0;
    this.windowStart = 0;
    this.avgWork = 0;
    this.peakWork = 0;
    this.avgGap = 0;
    this.headroom = 0;
  }

  beginFrame() {
    const now = performance.now();
    if (this.lastFrameAt > 0) {
      this.gapMs.push(now - this.lastFrameAt);
    }
    this.lastFrameAt = now;
    this._workStart = now;
  }

  endFrame() {
    const now = performance.now();
    const work = now - this._workStart;
    this.workMs.push(work);
    if (this.windowStart === 0) {
      this.windowStart = now;
    }
    if (now - this.windowStart >= 1000) {
      this._publish();
      this.workMs.length = 0;
      this.gapMs.length = 0;
      this.windowStart = now;
    }
  }

  _publish() {
    if (this.workMs.length === 0 || !this.panel) {
      return;
    }
    let sum = 0;
    let peak = 0;
    for (const w of this.workMs) {
      sum += w;
      if (w > peak) peak = w;
    }
    this.avgWork = sum / this.workMs.length;
    this.peakWork = peak;
    let gapSum = 0;
    for (const g of this.gapMs) {
      gapSum += g;
    }
    this.avgGap = this.gapMs.length > 0 ? gapSum / this.gapMs.length : 0;
    this.headroom = Math.max(0, this.avgGap - this.avgWork);

    // Full display budget (~16.7 ms at 60 Hz) is comfortable green; 0 is red.
    const budget = this.avgGap > 1 ? this.avgGap : 1000 / 60;
    const t = Math.min(1, this.headroom / budget);
    const fg = headroomFg(t);
    const bg = headroomBg(t);
    this.panel.update(this.headroom, budget, fg, bg);
  }
}

function headroomFg(t) {
  // t=0 red, t=1 green
  const r = Math.round(255 * (1 - t));
  const g = Math.round(255 * t);
  return `#${hex2(r)}${hex2(g)}00`;
}

function headroomBg(t) {
  const r = Math.round(32 * (1 - t));
  const g = Math.round(32 * t);
  return `#${hex2(r)}${hex2(g)}00`;
}

function hex2(n) {
  return n.toString(16).padStart(2, "0");
}
