import { PipaEngine } from "../../core/audio/PipaEngine";
import {
  StringSimulation,
  type StringParticle
} from "../../core/physics/StringSimulation";
import {
  StageRenderer,
  type StageInteractionState
} from "../../core/rendering/StageRenderer";
import { pipaXing } from "../../content/works/pipa-xing";
import { stringMidiForColumn } from "../../themes/pipa-xing/melody";
import { buildPoemColumns } from "./poemColumns";
import { calculateStageMetrics } from "./stageMetrics";
import { StageUiPresenter } from "./StageUiPresenter";
import { StageNavigation } from "./StageNavigation";
import type { PoemColumn, PoemStageElements } from "./types";

export class PoemStage {
  private renderer: StageRenderer;
  private navigation: StageNavigation;
  private audio = new PipaEngine();
  private simulation: StringSimulation;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private rightAnchor = 0;
  private charGap = 30;
  private columnGap = 43;
  private fontSize = 22;
  private raf = 0;
  private lastFrame = performance.now();
  private lastPointer = { x: 0, y: 0, time: 0 };
  private grabbed: StringParticle | null = null;
  private introDistance = 0;
  private readingEndOffset = 0;
  private endingDistance = 0;
  private enabled = true;
  private openingSoundPlayed = false;
  private openingSoundPending = false;
  private openingSoundLastAttempt = 0;
  private openingAudioTriggerCount = 0;
  private endingSoundPlayed = false;
  private endingAudioTriggerCount = 0;
  private autoPlaying = false;
  private lastRippleAt = 0;
  private source: PoemColumn[];
  private ui: StageUiPresenter;
  private motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  private reducedMotion = this.motionPreference.matches ||
    new URLSearchParams(window.location.search).get("motion") === "reduce";
  private interaction: StageInteractionState = {
    x: 0,
    y: 0,
    speed: 0,
    directionX: 0,
    directionY: 0,
    active: false,
    pressing: false
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private elements: PoemStageElements
  ) {
    this.renderer = new StageRenderer(canvas);
    this.navigation = new StageNavigation(canvas.dataset);
    this.ui = new StageUiPresenter(elements, canvas);
    const content = buildPoemColumns(pipaXing);
    this.source = content.columns;
    this.canvas.dataset.columnCount = String(this.source.length);
    this.canvas.dataset.totalLines = String(content.totalLines);
    this.canvas.dataset.scrollLines = String(content.scrollLines);
    this.canvas.dataset.endingLines = String(content.endingLines);
    this.canvas.dataset.endingColumns = "2";
    this.canvas.dataset.fulltextComplete = String(
      content.scrollLines + content.endingLines === content.totalLines
    );
    this.canvas.dataset.reducedMotion = String(this.reducedMotion);
    this.simulation = new StringSimulation(this.source, this.simulationOptions());
    this.bind();
    this.resize();
    this.setAutoPlaying(false);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerenter", this.onPointerEnter);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("keydown", this.onKeyDown);
    this.elements.mute.removeEventListener("click", this.onMuteClick);
    this.elements.playback.removeEventListener("click", this.onPlaybackClick);
    this.elements.progress.removeEventListener("pointerdown", this.onTimelinePointerDown);
    window.removeEventListener("pointermove", this.onTimelinePointerMove);
    window.removeEventListener("pointerup", this.onTimelinePointerUp);
    this.motionPreference.removeEventListener("change", this.onMotionPreferenceChange);
  }

  private simulationOptions() {
    return {
      columnGap: this.columnGap,
      charGap: this.charGap,
      top: Math.max(102, this.height * 0.135),
      gravity: 0.19,
      damping: 0.982,
      iterations: 5
    };
  }

  private resize = (): void => {
    const metrics = calculateStageMetrics(window.innerWidth, window.innerHeight, this.source);
    this.width = metrics.width;
    this.height = metrics.height;
    this.dpr = metrics.dpr;
    this.charGap = metrics.charGap;
    this.columnGap = metrics.columnGap;
    this.fontSize = metrics.fontSize;
    this.rightAnchor = metrics.rightAnchor;
    this.introDistance = metrics.introDistance;
    this.readingEndOffset = metrics.readingEndOffset;
    this.endingDistance = metrics.endingDistance;
    this.renderer.resize(this.width, this.height, this.dpr);
    this.simulation.rebuild(this.source, this.simulationOptions());
    this.navigation.configure({
      width: this.width,
      worldWidth: metrics.worldWidth,
      readingEndOffset: this.readingEndOffset,
      endingDistance: this.endingDistance,
      reducedMotion: this.reducedMotion
    });
    this.canvas.dataset.introEndProgress = (
      this.introDistance / this.navigation.viewport.maxOffset
    ).toFixed(4);
    this.canvas.dataset.readingEndProgress = (
      this.readingEndOffset / this.navigation.viewport.maxOffset
    ).toFixed(4);
    this.canvas.dataset.readingEndOffset = String(Math.round(this.readingEndOffset));
    this.canvas.dataset.endingDistance = String(Math.round(this.endingDistance));
    this.canvas.dataset.scale = "gong-shang-jue-zhi-yu";
  };

  private loop = (time: number): void => {
    const dt = Math.min(32, time - this.lastFrame);
    this.lastFrame = time;
    if (this.autoPlaying) {
      const speed = this.width < 720 ? 50 : 64;
      const completed = this.navigation.advanceAutomatically(speed * dt / 1000);
      if (completed) this.setAutoPlaying(false);
    }
    this.navigation.update(dt, time);
    const visible = this.visibleWorldRange(260);
    this.simulation.step(dt, visible);
    this.renderer.render(this.simulation, {
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      cameraOffset: this.cameraOffset,
      rightAnchor: this.rightAnchor,
      progress: this.navigation.viewport.progress,
      endingProgress: this.endingProgressFor(this.navigation.viewport.offset),
      fontSize: this.fontSize,
      visibleMinX: visible.minX,
      visibleMaxX: visible.maxX,
      time,
      reducedMotion: this.reducedMotion,
      interaction: this.interaction
    });
    this.updateUi();
    this.raf = requestAnimationFrame(this.loop);
  };

  private visibleWorldRange(buffer: number) {
    return {
      minX: -this.rightAnchor - this.cameraOffset - buffer,
      maxX: this.width - this.rightAnchor - this.cameraOffset + buffer
    };
  }

  private bind(): void {
    window.addEventListener("resize", this.resize);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerenter", this.onPointerEnter);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("blur", this.onWindowBlur);
    window.addEventListener("keydown", this.onKeyDown);
    this.elements.mute.addEventListener("click", this.onMuteClick);
    this.elements.playback.addEventListener("click", this.onPlaybackClick);
    this.elements.progress.addEventListener("pointerdown", this.onTimelinePointerDown);
    window.addEventListener("pointermove", this.onTimelinePointerMove);
    window.addEventListener("pointerup", this.onTimelinePointerUp);
    this.motionPreference.addEventListener("change", this.onMotionPreferenceChange);
  }

  private onMuteClick = async (): Promise<void> => {
    await this.audio.ensure();
    this.audio.setMuted(!this.audio.muted);
    const label = this.audio.muted ? "启声" : "静音";
    this.elements.mute.setAttribute("aria-pressed", String(this.audio.muted));
    this.elements.mute.setAttribute("aria-label", this.audio.muted ? "开启琵琶声音" : "静音琵琶声音");
    const text = this.elements.mute.querySelector("span");
    if (text) text.textContent = label;
  };

  private onPlaybackClick = async (): Promise<void> => {
    await this.audio.ensure();
    if (this.autoPlaying) {
      this.setAutoPlaying(false);
      return;
    }
    if (this.navigation.atEnd) this.navigation.rewind(true);
    this.setAutoPlaying(true);
  };

  private setAutoPlaying(playing: boolean): void {
    this.autoPlaying = playing;
    this.elements.playback.setAttribute("aria-pressed", String(playing));
    this.elements.playback.setAttribute(
      "aria-label",
      playing ? "暂停自动播放长卷" : "开始自动播放长卷"
    );
    const label = this.elements.playback.querySelector("span");
    if (label) label.textContent = playing ? "暂停" : "播放";
    this.canvas.dataset.autoPlaying = String(playing);
  }

  private onMotionPreferenceChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches ||
      new URLSearchParams(window.location.search).get("motion") === "reduce";
    this.canvas.dataset.reducedMotion = String(this.reducedMotion);
    this.navigation.setReducedMotion(this.reducedMotion);
    if (this.reducedMotion) {
      this.navigation.stopEdge();
      this.renderer.clearRipples();
    }
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    this.navigation.stopEdge();
    this.interaction.pressing = true;
    this.elements.cursor.classList.add("is-pressing");
    void this.audio.ensure();
    this.canvas.setPointerCapture?.(event.pointerId);
    const worldX = this.toWorldX(event.clientX);
    this.grabbed = this.simulation.grabParticle(
      worldX,
      event.clientY,
      this.width < 720 ? 29 : 32
    );
    if (this.grabbed) {
      this.grabbed.pinned = true;
      const columnIndex = this.grabbed.columnIndex;
      const pan = this.panFor(event.clientX);
      this.canvas.dataset.lastInteraction = "phrase";
      this.canvas.dataset.activeColumn = String(columnIndex);
      void this.audio.playPhrase(columnIndex, 0.86, pan).then((played) => {
        this.canvas.dataset.audioScheduled = String(played);
        this.canvas.dataset.audioPhrase = String(columnIndex);
        this.canvas.dataset.melodySource = "qiran-shenmiren-inspired-phrases";
      });
    } else {
      this.canvas.dataset.lastInteraction = "canvas";
    }
    this.lastPointer = { x: event.clientX, y: event.clientY, time: performance.now() };
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled) return;
    const now = performance.now();
    const elapsed = Math.max(8, now - this.lastPointer.time);
    const velocityX = ((event.clientX - this.lastPointer.x) / elapsed) * 16.67;
    const velocityY = ((event.clientY - this.lastPointer.y) / elapsed) * 16.67;
    const speed = Math.hypot(velocityX, velocityY);
    const overUi = event.target instanceof Element && Boolean(event.target.closest("button"));
    const insideViewport = event.clientX >= 0 && event.clientX <= this.width &&
      event.clientY >= 0 && event.clientY <= this.height;

    this.interaction.x = event.clientX;
    this.interaction.y = event.clientY;
    this.interaction.speed = speed;
    this.interaction.directionX = speed > 0.01 ? velocityX / speed : 0;
    this.interaction.directionY = speed > 0.01 ? velocityY / speed : 0;
    this.interaction.active = insideViewport && !overUi;
    this.updateCursor(event.clientX, event.clientY, velocityX, velocityY, speed);

    if (overUi || this.autoPlaying) this.navigation.stopEdge();
    else this.navigation.updateEdge(
      event.clientX,
      this.interaction.pressing || Boolean(this.grabbed)
    );

    const worldX = this.toWorldX(event.clientX);
    if (
      !this.reducedMotion &&
      this.interaction.active &&
      event.clientY > this.height * 0.49 &&
      speed > 1.1 &&
      now - this.lastRippleAt > Math.max(68, 150 - speed * 3)
    ) {
      this.renderer.addRipple(event.clientX, event.clientY, Math.min(1, speed / 15), now);
      this.lastRippleAt = now;
      this.canvas.dataset.lastWaterRipple = String(Math.round(now));
    }

    if (this.grabbed) {
      this.grabbed.position.set(worldX, event.clientY);
      this.grabbed.previous.set(worldX - velocityX, event.clientY - velocityY);
      this.grabbed.energy = 1;
    } else if (this.interaction.active && speed > 0.55) {
      const hit = this.simulation.disturb(
        worldX,
        event.clientY,
        velocityX,
        velocityY,
        this.width < 720 ? 34 : 42,
        Math.min(1.9, 0.24 + speed * 0.075)
      );
      if (hit && speed > 0.7) {
        const columnIndex = hit.column.particles[0]?.columnIndex ?? 0;
        this.canvas.dataset.lastInteraction = velocityX < -0.7
          ? "right-to-left"
          : velocityX > 0.7
            ? "left-to-right"
            : "brush";
        this.canvas.dataset.activeColumn = String(columnIndex);
        this.canvas.dataset.lastStringMidi = String(stringMidiForColumn(columnIndex));
        this.canvas.dataset.lastStringDisplacement = Math.abs(
          hit.particle.position.x - hit.particle.anchor.x
        ).toFixed(2);
        this.canvas.dataset.strokeDirection = velocityX < -0.18
          ? "right-to-left-bright"
          : velocityX > 0.18
            ? "left-to-right-dark"
            : "neutral";
        void this.audio.strike(
          columnIndex,
          Math.min(1, hit.intensity + Math.min(0.3, speed / 48)),
          false,
          this.interaction.directionX,
          this.panFor(event.clientX)
        );
      } else if (!hit) {
        this.audio.releaseColumn();
      }
    }

    this.lastPointer = { x: event.clientX, y: event.clientY, time: now };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.grabbed) {
      this.grabbed.pinned = false;
      this.grabbed = null;
    }
    this.interaction.pressing = false;
    this.elements.cursor.classList.remove("is-pressing");
    if (event.pointerType !== "mouse") this.navigation.stopEdge();
  };

  private onPointerCancel = (): void => {
    this.onWindowBlur();
  };

  private onPointerEnter = (): void => {
    this.interaction.active = true;
    this.elements.cursor.classList.add("is-visible");
  };

  private onPointerLeave = (): void => {
    this.interaction.active = false;
    this.elements.cursor.classList.remove("is-visible", "is-pressing");
    this.navigation.stopEdge();
  };

  private onWindowBlur = (): void => {
    this.interaction.active = false;
    this.interaction.pressing = false;
    if (this.grabbed) {
      this.grabbed.pinned = false;
      this.grabbed = null;
    }
    this.elements.cursor.classList.remove("is-visible", "is-pressing");
    this.navigation.stopEdge();
  };

  private updateCursor(
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    speed: number
  ): void {
    this.elements.cursor.style.setProperty("--cursor-x", `${x}px`);
    this.elements.cursor.style.setProperty("--cursor-y", `${y}px`);
    this.elements.cursor.style.setProperty(
      "--cursor-angle",
      `${Math.atan2(velocityY, velocityX) * 180 / Math.PI + 36}deg`
    );
    this.elements.cursor.style.setProperty("--cursor-speed", String(Math.min(1, speed / 18)));
    this.elements.cursor.style.setProperty(
      "--cursor-ring-scale",
      String(1 + Math.min(1, speed / 18) * 0.8)
    );
    this.elements.cursor.style.setProperty(
      "--cursor-ring-opacity",
      String(0.12 + Math.min(1, speed / 18) * 0.4)
    );
    this.elements.cursor.classList.toggle("is-visible", this.interaction.active);
  }

  private toWorldX(screenX: number): number {
    return screenX - this.rightAnchor - this.cameraOffset;
  }

  private get cameraOffset(): number {
    return this.navigation.viewport.offset - this.introDistance;
  }

  private onTimelinePointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.setAutoPlaying(false);
    void this.audio.ensure();
    this.navigation.beginTimeline();
    this.elements.progress.setPointerCapture?.(event.pointerId);
    this.setTimelinePosition(event.clientX, false);
    this.canvas.dataset.lastInteraction = "timeline";
  };

  private onTimelinePointerMove = (event: PointerEvent): void => {
    if (!this.navigation.timelineDragging) return;
    this.setTimelinePosition(event.clientX, true);
  };

  private onTimelinePointerUp = (): void => {
    this.navigation.endTimeline();
  };

  private setTimelinePosition(clientX: number, immediate: boolean): void {
    const rect = this.elements.progress.getBoundingClientRect();
    const progress = 1 - Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this.navigation.setTimelineProgress(progress, immediate);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (
      target instanceof HTMLButtonElement &&
      target !== this.elements.progress
    ) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    this.setAutoPlaying(false);
    void this.audio.ensure();
    this.canvas.dataset.lastInteraction = "keyboard";
    this.navigation.handleKey(event.key as "ArrowLeft" | "ArrowRight" | "Home" | "End");
  };

  private panFor(screenX: number): number {
    return Math.max(-1, Math.min(1, screenX / Math.max(1, this.width) * 2 - 1));
  }

  private updateUi(): void {
    const progress = this.navigation.viewport.progress;
    this.canvas.dataset.progress = progress.toFixed(4);
    const endingProgress = this.endingProgressFor(this.navigation.viewport.offset);
    this.canvas.dataset.endingTransition = endingProgress.toFixed(3);
    this.ui.update({
      progress,
      offset: this.navigation.viewport.offset,
      introDistance: this.introDistance,
      readingEndOffset: this.readingEndOffset,
      endingDistance: this.endingDistance,
      width: this.width,
      endingProgress,
      columns: this.source,
      reducedMotion: this.reducedMotion
    });

    const introProgress = Math.max(
      0,
      this.navigation.viewport.offset / Math.max(1, this.introDistance)
    );
    if (introProgress > 0.7 && introProgress < 1.08) this.tryPlayOpeningCadence();
    if (introProgress < 0.16) this.openingSoundPlayed = false;

    if (endingProgress > 0.72 && !this.endingSoundPlayed) {
      this.endingSoundPlayed = true;
      this.endingAudioTriggerCount += 1;
      this.canvas.dataset.endingAudioTriggerCount = String(this.endingAudioTriggerCount);
      void this.audio.playEndingCadence().then((played) => {
        this.canvas.dataset.endingAudioScheduled = String(played);
      });
    } else if (endingProgress < 0.18) {
      this.endingSoundPlayed = false;
    }
  }

  private tryPlayOpeningCadence(): void {
    const now = performance.now();
    if (
      this.openingSoundPlayed ||
      this.openingSoundPending ||
      now - this.openingSoundLastAttempt < 700
    ) return;

    this.openingSoundPending = true;
    this.openingSoundLastAttempt = now;
    this.canvas.dataset.openingAudioState = this.audio.state;
    void this.audio.playOpeningCadence().then((played) => {
      this.openingSoundPending = false;
      this.canvas.dataset.openingAudioScheduled = String(played);
      this.canvas.dataset.openingAudioState = this.audio.state;
      if (!played) return;
      this.openingSoundPlayed = true;
      this.openingAudioTriggerCount += 1;
      this.canvas.dataset.openingAudioTriggerCount = String(this.openingAudioTriggerCount);
    });
  }

  private endingProgressFor(offset: number): number {
    return Math.max(
      0,
      Math.min(
        1,
        (offset - this.readingEndOffset) / Math.max(1, this.endingDistance * 0.78)
      )
    );
  }

}
