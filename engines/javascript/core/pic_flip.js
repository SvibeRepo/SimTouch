import { VelocityGrid } from "./velocity_grid.js";

// Slider fraction of FLIP. 0 is PIC (cell average). 1 is FLIP (particle + grid delta).
export class PicFlip {
  constructor(opts = {}) {
    this.grid = new VelocityGrid(opts);
    this.picFlipRatio = opts.picFlipRatio ?? 0.95;
  }

  get dt() {
    return this.grid.dt;
  }
  set dt(v) {
    this.grid.dt = v;
  }
  get restDensity() {
    return this.grid.restDensity;
  }
  set restDensity(v) {
    this.grid.restDensity = v;
  }
  get gasConstant() {
    return this.grid.gasConstant;
  }
  set gasConstant(v) {
    this.grid.gasConstant = v;
  }

  initializeBoundary() {
    this.grid.initializeBoundary();
  }

  setParameters(restDensity) {
    this.grid.setParameters(restDensity);
  }

  transferToGrid(particles, velocitiesX, velocitiesY) {
    this.grid.transferToGrid(particles, velocitiesX, velocitiesY);
  }

  solveIncompressibility() {
    this.grid.solveIncompressibility();
  }

  transferToParticles(particles, velocitiesX, velocitiesY) {
    const n = this.grid.gridSizeFlip;
    const draggedIndex = this.grid.particleSystem?.draggedParticleIndex ?? -1;
    const maxVelocity = this.grid.particleSystem?.maxVelocity ?? 0.05;

    for (let i = 0; i < particles.length / 2; i++) {
      if (i === draggedIndex) continue;

      const x = particles[i * 2];
      const y = particles[i * 2 + 1];
      if (x < 0 || x >= 1 || y < 0 || y >= 1) continue;

      const gx = Math.min(Math.max(Math.floor(x * n), 0), n - 1);
      const gy = Math.min(Math.max(Math.floor(y * n), 0), n - 1);
      const center = gy * n + gx;
      const gridVx = this.grid.u[center];
      const gridVy = this.grid.v[center];
      const prevVx = this.grid.prevU[center];
      const prevVy = this.grid.prevV[center];

      const oldVx = velocitiesX[i];
      const oldVy = velocitiesY[i];
      const alpha = Math.min(1, Math.max(0, this.picFlipRatio));
      const picVx = gridVx;
      const picVy = gridVy;
      const flipVx = oldVx + (gridVx - prevVx);
      const flipVy = oldVy + (gridVy - prevVy);

      velocitiesX[i] = (1 - alpha) * picVx + alpha * flipVx;
      velocitiesY[i] = (1 - alpha) * picVy + alpha * flipVy;
      velocitiesX[i] = Math.max(-maxVelocity, Math.min(maxVelocity, velocitiesX[i]));
      velocitiesY[i] = Math.max(-maxVelocity, Math.min(maxVelocity, velocitiesY[i]));
    }
  }
}
