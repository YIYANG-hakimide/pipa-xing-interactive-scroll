import type { StringSimulation } from "../physics/StringSimulation";
import { publicAssetUrl } from "../assets/publicAssetUrl";
import { GlyphCache } from "./GlyphCache";

export interface StageInteractionState {
  x: number;
  y: number;
  speed: number;
  directionX: number;
  directionY: number;
  active: boolean;
  pressing: boolean;
}

interface RenderOptions {
  width: number;
  height: number;
  dpr: number;
  cameraOffset: number;
  rightAnchor: number;
  progress: number;
  endingProgress: number;
  fontSize: number;
  visibleMinX: number;
  visibleMaxX: number;
  time: number;
  reducedMotion: boolean;
  interaction: StageInteractionState;
}

interface WaterRipple {
  x: number;
  y: number;
  strength: number;
  startedAt: number;
}

export class StageRenderer {
  readonly backgroundReady: Promise<boolean>;
  private context: CanvasRenderingContext2D;
  private glyphs = new GlyphCache();
  private handscroll = new Image();
  private inkMode: "black" | "white";
  private ripples: WaterRipple[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
    this.inkMode = new URLSearchParams(window.location.search).get("ink") === "black"
      ? "black"
      : "white";
    this.canvas.dataset.inkMode = this.inkMode;
    this.handscroll.decoding = "async";
    const backgroundCandidates = [
      publicAssetUrl("assets/images/pipa-xing-gongbi-handscroll-v1.avif"),
      publicAssetUrl("assets/images/pipa-xing-gongbi-handscroll-v1.png")
    ];
    let backgroundCandidate = 0;
    this.backgroundReady = new Promise((resolve) => {
      this.handscroll.addEventListener("load", () => {
        this.canvas.dataset.backgroundImageLoaded = "true";
        this.canvas.dataset.backgroundImageFormat = backgroundCandidates[backgroundCandidate]
          .split(".")
          .pop() ?? "unknown";
        resolve(true);
      }, { once: true });
      this.handscroll.addEventListener("error", () => {
        backgroundCandidate += 1;
        if (backgroundCandidate < backgroundCandidates.length) {
          this.handscroll.src = backgroundCandidates[backgroundCandidate];
          this.canvas.dataset.backgroundImageUrl = this.handscroll.src;
          return;
        }
        this.canvas.dataset.backgroundImageLoaded = "false";
        resolve(false);
      });
      this.handscroll.src = backgroundCandidates[backgroundCandidate];
      this.canvas.dataset.backgroundImageUrl = this.handscroll.src;
    });
  }

  resize(width: number, height: number, dpr: number): void {
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.glyphs.clear();
  }

  addRipple(x: number, y: number, strength: number, time: number): void {
    this.ripples.push({ x, y, strength: Math.min(1, strength), startedAt: time });
    if (this.ripples.length > 18) this.ripples.shift();
  }

  clearRipples(): void {
    this.ripples.length = 0;
  }

  render(simulation: StringSimulation, options: RenderOptions): void {
    const { context: ctx } = this;
    const { width, height, dpr, endingProgress } = options;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawAtmosphere(options);

    const columnCount = Math.max(1, simulation.columns.length - 1);
    for (const column of simulation.columns) {
      if (column.x < options.visibleMinX || column.x > options.visibleMaxX) continue;
      const baseScreenX = options.rightAnchor + column.x + options.cameraOffset;
      const pointerDistance = options.interaction.active
        ? Math.hypot(baseScreenX - options.interaction.x, height * 0.44 - options.interaction.y)
        : width;
      const pointerFocus = Math.max(0, 1 - pointerDistance / Math.max(180, width * 0.24));
      const centerDistance = Math.min(1, Math.abs(baseScreenX - width * 0.5) / (width * 0.66));
      const depth = Math.max(0, 1 - centerDistance);
      const depthScale = 0.94 + depth * 0.055 + pointerFocus * 0.018;
      const depthAlpha = 0.68 + depth * 0.26 + pointerFocus * 0.06;
      const columnDelay = (column.particles[0]?.columnIndex ?? 0) / columnCount;
      const dissolve = Math.max(
        0,
        Math.min(1, endingProgress * 1.36 - columnDelay * 0.24)
      );
      const columnAlpha = (1 - dissolve * 0.985) * depthAlpha;
      const screenX = baseScreenX + (
        options.reducedMotion ? 0 : pointerFocus * options.interaction.directionX * 1.6
      );
      const sectionTint = this.sectionColor(column.sectionId);

      ctx.save();
      ctx.globalAlpha = columnAlpha;

      ctx.beginPath();
      column.particles.forEach((particle, index) => {
        const x = options.rightAnchor + particle.position.x + options.cameraOffset;
        const y = particle.position.y + dissolve * (24 + index * 1.8);
        if (index === 0) ctx.moveTo(x, 65);
        ctx.lineTo(x, y);
      });
      const lineGradient = ctx.createLinearGradient(screenX, 62, screenX, height * 0.84);
      lineGradient.addColorStop(0, `rgba(239, 202, 126, ${0.3 + pointerFocus * 0.28})`);
      lineGradient.addColorStop(0.22, `rgba(218, 174, 92, ${0.1 + pointerFocus * 0.12})`);
      lineGradient.addColorStop(1, "rgba(218, 174, 92, 0.012)");
      ctx.strokeStyle = lineGradient;
      ctx.lineWidth = 0.58 + pointerFocus * 0.56;
      ctx.shadowColor = pointerFocus > 0.1 ? "rgba(232, 183, 91, 0.34)" : "transparent";
      ctx.shadowBlur = 7 * pointerFocus;
      ctx.stroke();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      const anchorGlow = ctx.createRadialGradient(screenX, 64, 0, screenX, 65, 5 + pointerFocus * 3);
      anchorGlow.addColorStop(0, `rgba(255, 240, 194, ${0.74 + pointerFocus * 0.24})`);
      anchorGlow.addColorStop(0.45, "rgba(191, 139, 67, 0.58)");
      anchorGlow.addColorStop(1, "rgba(45, 28, 17, 0)");
      ctx.fillStyle = anchorGlow;
      ctx.beginPath();
      ctx.arc(screenX, 65, 3.2 + pointerFocus * 1.4, 0, Math.PI * 2);
      ctx.fill();

      column.particles.forEach((particle, index) => {
        const glyph = this.glyphs.get(
          particle.char,
          options.fontSize,
          sectionTint,
          dpr,
          this.inkMode
        );
        const size = Number(glyph.dataset.size || options.fontSize * 1.5);
        const next = column.particles[index + 1];
        const rawAngle = next
          ? Math.atan2(
              next.position.y - particle.position.y,
              next.position.x - particle.position.x
            ) - Math.PI / 2
          : 0;
        const angle = index === 0 ? 0 : Math.max(-0.72, Math.min(0.72, rawAngle));
        const x = options.rightAnchor + particle.position.x + options.cameraOffset;
        const y = particle.position.y + dissolve * (24 + index * 1.8);
        const edgeFade = Math.min(1, Math.max(0, (x + 64) / 145)) *
          Math.min(1, Math.max(0, (width + 64 - x) / 145));
        const energyScale = 1 + particle.energy * 0.032;

        ctx.save();
        ctx.translate(x, y + (1 - depthScale) * 18);
        ctx.rotate(angle * (0.76 + particle.energy * 0.22));
        ctx.scale(depthScale * energyScale, depthScale * energyScale);
        ctx.globalAlpha = columnAlpha * edgeFade * (0.88 + particle.energy * 0.12);

        // 只保留一层硬边景深，拨动时轻微提亮，不制造残影和光晕。
        ctx.globalAlpha *= 0.24;
        ctx.drawImage(glyph, -size / 2 + 1.35, -size / 2 + 1.75, size, size);
        ctx.globalAlpha = columnAlpha * edgeFade * (0.94 + particle.energy * 0.06);
        ctx.drawImage(glyph, -size / 2, -size / 2, size, size);
        ctx.restore();
      });
      ctx.restore();
    }

    this.drawForeground(options);
  }

  private sectionColor(sectionId: string): string {
    if (this.inkMode === "white") {
      if (sectionId === "reprise") return "#f3eadb";
      return "#f2eee5";
    }
    if (sectionId === "performance") return "#090806";
    if (sectionId === "reprise") return "#100c09";
    return "#17130f";
  }

  private imageMetrics(width: number, height: number) {
    const scale = Math.max(
      width / this.handscroll.naturalWidth,
      height / this.handscroll.naturalHeight
    );
    return {
      width: this.handscroll.naturalWidth * scale,
      height: this.handscroll.naturalHeight * scale
    };
  }

  private drawAtmosphere(options: RenderOptions): void {
    const { context: ctx } = this;
    const { width, height, progress, interaction, endingProgress } = options;
    ctx.fillStyle = "#061016";
    ctx.fillRect(0, 0, width, height);

    if (this.handscroll.complete && this.handscroll.naturalWidth > 0) {
      const image = this.imageMetrics(width, height);
      const travel = image.width - width;
      const pointerParallax = interaction.active && !options.reducedMotion
        ? (interaction.x / Math.max(1, width) - 0.5)
        : 0;
      const imageY = (height - image.height) * 0.5;

      // Middle architecture layer: the visual anchor of the handscroll.
      const middleX = -travel * (1 - progress) - pointerParallax * 8;
      ctx.drawImage(this.handscroll, middleX, imageY, image.width, image.height);

    }

    const nightWash = ctx.createLinearGradient(0, 0, 0, height);
    nightWash.addColorStop(0, `rgba(2, 9, 14, ${0.32 + endingProgress * 0.24})`);
    nightWash.addColorStop(0.42, `rgba(2, 11, 15, ${0.2 + endingProgress * 0.2})`);
    nightWash.addColorStop(1, `rgba(1, 7, 10, ${0.5 + endingProgress * 0.3})`);
    ctx.fillStyle = nightWash;
    ctx.fillRect(0, 0, width, height);

    this.drawWater(options);
    this.drawLanterns(options);
    this.drawMist(options);
  }

  private drawWater(options: RenderOptions): void {
    const { context: ctx } = this;
    const { width, height, progress, interaction, endingProgress } = options;
    const time = options.reducedMotion ? 0 : options.time;
    const waterTop = height * 0.5;
    const interactionLift = interaction.active && interaction.y > waterTop
      ? Math.min(1, interaction.speed / 18)
      : 0;

    for (let i = 0; i < 18; i += 1) {
      const y = waterTop + i * (height * 0.0235);
      const alpha = (0.014 + (i % 4) * 0.007 + interactionLift * 0.012) *
        (1 - endingProgress * 0.48);
      ctx.strokeStyle = `rgba(230, 205, 151, ${alpha})`;
      ctx.lineWidth = i % 5 === 0 ? 1.2 : 0.7;
      ctx.beginPath();
      for (let x = -30; x <= width + 30; x += 18) {
        const wave = Math.sin(
          x * 0.014 + time * 0.00038 + i * 0.74 + progress * 4.2
        ) * (1.1 + i * 0.075 + interactionLift * 1.8);
        if (x === -30) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }

    // Moonlight path, fragmented rather than a generic glow.
    const moonX = width * (0.62 - progress * 0.16);
    for (let i = 0; i < 12; i += 1) {
      const y = height * 0.55 + i * height * 0.025;
      const shimmer = Math.sin(time * 0.0011 + i * 1.7) * 10;
      const halfWidth = (14 + i * 4.5) * (1 - endingProgress * 0.62);
      ctx.strokeStyle = `rgba(224, 207, 165, ${0.055 - i * 0.0026})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(moonX - halfWidth + shimmer, y);
      ctx.lineTo(moonX + halfWidth + shimmer * 0.35, y);
      ctx.stroke();
    }
  }

  private drawLanterns(options: RenderOptions): void {
    const { context: ctx } = this;
    const { width, height, progress, interaction, endingProgress } = options;
    const time = options.reducedMotion ? 0 : options.time;
    const lanterns = [
      [0.12, 0.67, 0.7], [0.28, 0.61, 0.52], [0.46, 0.69, 0.8],
      [0.67, 0.63, 0.56], [0.82, 0.7, 0.72], [0.94, 0.6, 0.46]
    ];
    lanterns.forEach(([baseX, baseY, strength], index) => {
      const x = ((baseX * width + progress * width * (0.18 + index * 0.018)) % (width * 1.18)) - width * 0.08;
      const y = baseY * height + Math.sin(time * 0.0007 + index * 1.8) * 2.4;
      const pointerDistance = interaction.active
        ? Math.hypot(x - interaction.x, y - interaction.y)
        : width;
      const response = Math.max(0, 1 - pointerDistance / 180) * Math.min(1, interaction.speed / 12);
      const glow = (strength + response * 0.5) * (1 - endingProgress * 0.86);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 16 + response * 12);
      gradient.addColorStop(0, `rgba(255, 220, 142, ${0.72 * glow})`);
      gradient.addColorStop(0.22, `rgba(224, 155, 68, ${0.34 * glow})`);
      gradient.addColorStop(1, "rgba(188, 89, 38, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x + response * interaction.directionX * 3, y, 18 + response * 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(231, 170, 83, ${0.08 * glow})`;
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 12);
      ctx.lineTo(x + 5 + Math.sin(time * 0.001 + index) * 5, y + height * 0.16);
      ctx.stroke();
    });
  }

  private drawMist(options: RenderOptions): void {
    const { context: ctx } = this;
    const { width, height, progress, interaction, endingProgress } = options;
    const time = options.reducedMotion ? 0 : options.time;
    for (let i = 0; i < 7; i += 1) {
      const drift = (time * (0.004 + i * 0.0007) + progress * width * (0.1 + i * 0.018)) % (width + 420);
      const x = drift - 210 + (interaction.active ? (interaction.x / width - 0.5) * (i + 1) * 3 : 0);
      const y = height * (0.34 + i * 0.075);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 150 + i * 23);
      gradient.addColorStop(0, `rgba(151, 166, 158, ${0.018 + endingProgress * 0.012})`);
      gradient.addColorStop(0.52, `rgba(105, 129, 128, ${0.012 + endingProgress * 0.008})`);
      gradient.addColorStop(1, "rgba(63, 86, 91, 0)");
      ctx.fillStyle = gradient;
      ctx.save();
      ctx.scale(1.9, 0.42);
      ctx.beginPath();
      ctx.arc(x / 1.9, y / 0.42, 150 + i * 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawForeground(options: RenderOptions): void {
    const { context: ctx } = this;
    const { width, height, endingProgress } = options;
    const time = options.reducedMotion ? 0 : options.time;
    this.ripples = this.ripples.filter((ripple) => time - ripple.startedAt < 2100);
    for (const ripple of this.ripples) {
      const age = Math.max(0, (time - ripple.startedAt) / 2100);
      const radius = 12 + age * (78 + ripple.strength * 64);
      ctx.save();
      ctx.translate(ripple.x, ripple.y);
      ctx.scale(1, 0.32);
      ctx.strokeStyle = `rgba(236, 213, 163, ${(1 - age) * 0.2 * ripple.strength})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (age > 0.18) {
        ctx.strokeStyle = `rgba(211, 185, 132, ${(1 - age) * 0.11 * ripple.strength})`;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.68, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (endingProgress > 0.08) {
      const droplets = Math.floor(endingProgress * 42);
      ctx.fillStyle = `rgba(7, 13, 15, ${0.12 + endingProgress * 0.34})`;
      for (let i = 0; i < droplets; i += 1) {
        const seed = (i * 83.17) % 997;
        const x = (seed / 997) * width;
        const y = ((time * 0.012 + i * 67) % (height + 80)) - 40;
        ctx.fillRect(x, y, 0.8 + (i % 3) * 0.6, 5 + (i % 5) * 3);
      }
    }

    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.46,
      Math.min(width, height) * 0.18,
      width * 0.5,
      height * 0.46,
      Math.max(width, height) * 0.76
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(0.7, "rgba(0, 4, 8, 0.12)");
    vignette.addColorStop(1, `rgba(0, 3, 6, ${0.48 + endingProgress * 0.24})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }
}
