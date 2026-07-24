import { Vec2 } from "./Vec2";

export interface StringParticle {
  id: number;
  columnIndex: number;
  charIndex: number;
  char: string;
  position: Vec2;
  previous: Vec2;
  anchor: Vec2;
  pinned: boolean;
  energy: number;
}

export interface StringColumn {
  id: string;
  sectionId: string;
  sectionTitle: string;
  particles: StringParticle[];
  x: number;
}

interface SimulationOptions {
  columnGap: number;
  charGap: number;
  top: number;
  gravity: number;
  damping: number;
  iterations: number;
}

export class StringSimulation {
  readonly columns: StringColumn[] = [];
  private particleId = 0;
  private awakeColumns = new Set<string>();
  private quietFrames = new Map<string, number>();

  constructor(
    source: Array<{
      id: string;
      sectionId: string;
      sectionTitle: string;
      text: string;
    }>,
    private options: SimulationOptions
  ) {
    this.rebuild(source, options);
  }

  rebuild(
    source: Array<{
      id: string;
      sectionId: string;
      sectionTitle: string;
      text: string;
    }>,
    options = this.options
  ): void {
    this.options = options;
    this.columns.length = 0;
    this.particleId = 0;
    this.awakeColumns.clear();
    this.quietFrames.clear();

    source.forEach((item, columnIndex) => {
      const x = -columnIndex * options.columnGap;
      const particles = Array.from(item.text).map((char, charIndex) => {
        const y = options.top + charIndex * options.charGap;
        return {
          id: this.particleId++,
          columnIndex,
          charIndex,
          char,
          position: new Vec2(x, y),
          previous: new Vec2(x, y),
          anchor: new Vec2(x, y),
          pinned: charIndex === 0,
          energy: 0
        };
      });

      this.columns.push({
        id: item.id,
        sectionId: item.sectionId,
        sectionTitle: item.sectionTitle,
        particles,
        x
      });
    });
  }

  step(dt: number, activeRange: { minX: number; maxX: number }): void {
    const frameScale = Math.min(1.8, Math.max(0.45, dt / 16.67));
    const { gravity, damping, iterations, charGap } = this.options;

    for (const column of this.columns) {
      if (column.x < activeRange.minX || column.x > activeRange.maxX) continue;
      if (!this.awakeColumns.has(column.id)) continue;

      for (const particle of column.particles) {
        particle.energy *= 0.91;
        if (particle.pinned) {
          particle.position.set(particle.anchor.x, particle.anchor.y);
          particle.previous.set(particle.anchor.x, particle.anchor.y);
          continue;
        }

        const velocityX = (particle.position.x - particle.previous.x) * damping;
        const velocityY = (particle.position.y - particle.previous.y) * damping;
        particle.previous.set(particle.position.x, particle.position.y);
        particle.position.x += velocityX * frameScale;
        particle.position.y += velocityY * frameScale + gravity * frameScale * frameScale;
      }

      for (let pass = 0; pass < iterations; pass += 1) {
        for (let i = 1; i < column.particles.length; i += 1) {
          const a = column.particles[i - 1];
          const b = column.particles[i];
          const dx = b.position.x - a.position.x;
          const dy = b.position.y - a.position.y;
          const distance = Math.hypot(dx, dy) || 1;
          const correction = (distance - charGap) / distance;
          const cx = dx * correction;
          const cy = dy * correction;

          if (!a.pinned) {
            a.position.x += cx * 0.48;
            a.position.y += cy * 0.48;
          }
          if (!b.pinned) {
            b.position.x -= cx * (a.pinned ? 1 : 0.52);
            b.position.y -= cy * (a.pinned ? 1 : 0.52);
          }
        }
      }

      // 保持竖排阅读顺序，避免受力后文字向上折叠并互相覆盖。
      for (let i = 1; i < column.particles.length; i += 1) {
        const previous = column.particles[i - 1];
        const particle = column.particles[i];
        const minimumY = previous.position.y + charGap * 0.54;
        if (particle.position.y < minimumY) {
          particle.position.y = minimumY;
          particle.previous.y = Math.min(particle.previous.y, minimumY);
        }
      }

      const active = column.particles.some((particle) => {
        if (particle.pinned && particle.charIndex > 0) return true;
        const motion = Math.hypot(
          particle.position.x - particle.previous.x,
          particle.position.y - particle.previous.y
        );
        return particle.energy > 0.012 || motion > 0.34;
      });
      const quietFrames = active ? 0 : (this.quietFrames.get(column.id) ?? 0) + 1;
      this.quietFrames.set(column.id, quietFrames);
      if (quietFrames >= 18) this.sleepColumn(column);
    }
  }

  get awakeCount(): number {
    return this.awakeColumns.size;
  }

  disturb(
    worldX: number,
    y: number,
    velocityX: number,
    velocityY: number,
    radius: number,
    strength: number
  ): { column: StringColumn; particle: StringParticle; intensity: number } | null {
    let nearest: { column: StringColumn; particle: StringParticle; distance: number } | null = null;

    for (const column of this.columns) {
      if (Math.abs(column.x - worldX) > radius * 1.5) continue;
      for (const particle of column.particles) {
        if (particle.pinned || /[，。？！；、《》]/.test(particle.char)) continue;
        const dx = particle.position.x - worldX;
        const dy = particle.position.y - y;
        const distance = Math.hypot(dx, dy);
        if (distance >= radius) continue;

        const influence = 1 - distance / radius;
        const impulseX = velocityX * 0.145 + (dx / Math.max(10, distance)) * strength * 1.12;
        const impulseY = velocityY * 0.032;
        particle.position.x += impulseX * influence;
        particle.position.y += impulseY * influence;
        particle.energy = Math.min(1, particle.energy + influence * 0.62);
        this.wakeColumn(column);

        if (!nearest || distance < nearest.distance) {
          nearest = { column, particle, distance };
        }
      }
    }

    if (!nearest) return null;
    const sourceIndex = nearest.particle.charIndex;
    nearest.column.particles.forEach((particle) => {
      if (particle.pinned) return;
      const distance = Math.abs(particle.charIndex - sourceIndex);
      if (distance > 2) return;
      const propagation = Math.exp(-distance * 1.05) * Math.min(1, Math.hypot(velocityX, velocityY) / 12);
      particle.previous.x -= velocityX * propagation * 0.056;
      particle.previous.y -= velocityY * propagation * 0.018;
      particle.energy = Math.min(1, particle.energy + propagation * 0.38);
    });
    return {
      column: nearest.column,
      particle: nearest.particle,
      intensity: Math.max(0.15, 1 - nearest.distance / radius)
    };
  }

  grabParticle(worldX: number, y: number, radius: number): StringParticle | null {
    let nearest: StringParticle | null = null;
    let nearestColumn: StringColumn | null = null;
    let nearestDistance = radius;
    for (const column of this.columns) {
      if (Math.abs(column.x - worldX) > radius) continue;
      for (const particle of column.particles) {
        if (particle.pinned) continue;
        const distance = Math.hypot(
          particle.position.x - worldX,
          particle.position.y - y
        );
        if (distance < nearestDistance) {
          nearest = particle;
          nearestColumn = column;
          nearestDistance = distance;
        }
      }
    }
    if (nearestColumn) this.wakeColumn(nearestColumn);
    return nearest;
  }

  private wakeColumn(column: StringColumn): void {
    this.awakeColumns.add(column.id);
    this.quietFrames.set(column.id, 0);
  }

  private sleepColumn(column: StringColumn): void {
    for (const particle of column.particles) {
      particle.previous.set(particle.position.x, particle.position.y);
      if (particle.energy < 0.012) particle.energy = 0;
    }
    this.awakeColumns.delete(column.id);
    this.quietFrames.delete(column.id);
  }
}
