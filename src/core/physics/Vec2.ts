export class Vec2 {
  constructor(
    public x = 0,
    public y = 0
  ) {}

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
}

