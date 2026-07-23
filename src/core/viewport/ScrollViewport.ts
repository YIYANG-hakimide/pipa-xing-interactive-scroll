export class ScrollViewport {
  offset = 0;
  target = 0;
  maxOffset = 0;
  velocity = 0;

  resize(worldWidth: number, viewportWidth: number): void {
    this.maxOffset = Math.max(0, worldWidth - viewportWidth * 0.62);
    this.target = Math.min(this.target, this.maxOffset);
    this.offset = Math.min(this.offset, this.maxOffset);
  }

  add(delta: number): void {
    this.target = Math.max(0, Math.min(this.maxOffset, this.target + delta));
  }

  update(dt = 16.67): void {
    const previous = this.offset;
    const smoothing = 1 - Math.exp(-Math.max(1, dt) / 150);
    this.offset += (this.target - this.offset) * smoothing;
    this.velocity = this.offset - previous;
  }

  setProgress(progress: number, immediate = false): void {
    this.target = Math.max(0, Math.min(this.maxOffset, progress * this.maxOffset));
    if (immediate) this.offset = this.target;
  }

  setTarget(offset: number, immediate = false): void {
    this.target = Math.max(0, Math.min(this.maxOffset, offset));
    if (immediate) this.offset = this.target;
  }

  get progress(): number {
    return this.maxOffset > 0 ? this.offset / this.maxOffset : 0;
  }
}
