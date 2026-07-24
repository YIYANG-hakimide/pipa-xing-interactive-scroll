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
import {
  INTRO_EXIT_START,
  INTRO_EXIT_END,
  OPENING_CADENCE_RESET,
  OPENING_CADENCE_TRIGGER,
  OPENING_CADENCE_WINDOW_END,
  clamp01,
  introExitProgress
} from "./stageTransitions";
import { StageUiPresenter } from "./StageUiPresenter";
import { StageNavigation } from "./StageNavigation";
import type { PoemColumn, PoemStageElements } from "./types";

interface OpeningStringMotion {
  displacement: number;
  velocity: number;
  dragging: boolean;
}

const pageFlags = new URLSearchParams(window.location.search);
const forceReducedMotion = pageFlags.get("motion") === "reduce";

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
  private openingSoundPlayed = false;
  private openingSoundPending = false;
  private openingSoundLastAttempt = 0;
  private openingAudioTriggerCount = 0;
  private openingGestureActive = false;
  private openingGestureCompleted = false;
  private openingGesturePointer = -1;
  private openingGestureSuppressedPointer = -1;
  private openingGestureStartX = 0;
  private openingGestureLastX = 0;
  private openingStringCandidate = -1;
  private openingStringsPlayed = new Set<number>();
  private openingStringCenters: number[] = [];
  private openingStringNodes: HTMLElement[] = [];
  private openingStringMotions: OpeningStringMotion[] = [];
  private endingSoundPlayed = false;
  private endingAudioTriggerCount = 0;
  private audioUnlocked = false;
  private initialIntroPlaying = false;
  private initialPlaybackCancelled = false;
  private autoPlaying = false;
  private lastRippleAt = 0;
  private performanceDebug = pageFlags.get("debug") === "perf";
  private frameSamples: number[] = [];
  private source: PoemColumn[];
  private ui: StageUiPresenter;
  private motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  private reducedMotion = this.motionPreference.matches || forceReducedMotion;
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
    this.openingStringNodes = [
      ...elements.introStrings.querySelectorAll<HTMLElement>("[data-string]")
    ];
    this.openingStringMotions = this.openingStringNodes.map(() => ({
      displacement: 0,
      velocity: 0,
      dragging: false
    }));
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
    this.canvas.dataset.audioUnlocked = "false";
    this.simulation = new StringSimulation(this.source, this.simulationOptions());
    this.bind();
    this.resize();
    this.syncPlaybackButton();
    void this.startInitialPlayback();
    this.requestFrame();
  }

  private async startInitialPlayback(): Promise<void> {
    const backgroundLoaded = await this.renderer.backgroundReady;
    this.canvas.dataset.initialBackgroundReady = String(backgroundLoaded);
    this.canvas.dataset.openingAwaitingGesture = String(
      !this.openingGestureCompleted && this.openingGestureReady
    );
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
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("keydown", this.onKeyDown);
    this.elements.mute.removeEventListener("click", this.onMuteClick);
    this.elements.playback.removeEventListener("click", this.onPlaybackClick);
    this.elements.introStrings.removeEventListener("pointerdown", this.onOpeningPointerDown);
    this.elements.introStrings.removeEventListener("pointermove", this.onOpeningPointerMove);
    this.elements.introStrings.removeEventListener("pointerup", this.onOpeningPointerUp);
    this.elements.introStrings.removeEventListener("pointercancel", this.onOpeningPointerUp);
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
    this.raf = 0;
    if (document.hidden) return;
    const dt = Math.min(32, time - this.lastFrame);
    this.lastFrame = time;
    this.recordFrame(dt);
    if (
      (this.initialIntroPlaying || this.autoPlaying) &&
      this.navigation.shouldTakeOverPlayback(time)
    ) {
      this.stopForManualControl(false);
    }
    if (this.initialIntroPlaying) {
      const introTarget = this.initialIntroTarget;
      const duration = this.width < 720 ? 1.85 : 2.15;
      const introSpeed = introTarget / duration;
      this.navigation.viewport.setTarget(
        Math.min(introTarget, this.navigation.viewport.target + introSpeed * dt / 1000),
        this.reducedMotion
      );
    } else if (this.autoPlaying) {
      const speed = this.width < 720 ? 50 : 64;
      const completed = this.navigation.advanceAutomatically(speed * dt / 1000);
      if (completed) this.setAutoPlaying(false);
    }
    this.updateOpeningStringMotion(dt);
    this.navigation.update(dt, time);
    if (
      this.initialIntroPlaying &&
      this.navigation.viewport.target >= this.initialIntroTarget - 0.5 &&
      this.navigation.viewport.offset >= this.initialIntroTarget - 1
    ) {
      this.navigation.viewport.setTarget(this.initialIntroTarget, true);
      this.setInitialIntroPlaying(false);
      this.setAutoPlaying(true);
    }
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
    this.requestFrame();
  };

  private requestFrame(): void {
    if (this.raf || document.hidden) return;
    this.raf = requestAnimationFrame(this.loop);
  }

  private recordFrame(dt: number): void {
    if (!this.performanceDebug || dt <= 0) return;
    this.frameSamples.push(dt);
    if (this.frameSamples.length < 120) return;
    const sorted = [...this.frameSamples].sort((a, b) => a - b);
    const average = this.frameSamples.reduce((sum, value) => sum + value, 0) /
      this.frameSamples.length;
    this.canvas.dataset.averageFps = (1000 / average).toFixed(1);
    this.canvas.dataset.p95FrameMs = sorted[Math.floor(sorted.length * 0.95)].toFixed(2);
    this.frameSamples.length = 0;
  }

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
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("keydown", this.onKeyDown);
    this.elements.mute.addEventListener("click", this.onMuteClick);
    this.elements.playback.addEventListener("click", this.onPlaybackClick);
    this.elements.introStrings.addEventListener("pointerdown", this.onOpeningPointerDown);
    this.elements.introStrings.addEventListener("pointermove", this.onOpeningPointerMove);
    this.elements.introStrings.addEventListener("pointerup", this.onOpeningPointerUp);
    this.elements.introStrings.addEventListener("pointercancel", this.onOpeningPointerUp);
    this.elements.progress.addEventListener("pointerdown", this.onTimelinePointerDown);
    window.addEventListener("pointermove", this.onTimelinePointerMove);
    window.addEventListener("pointerup", this.onTimelinePointerUp);
    this.motionPreference.addEventListener("change", this.onMotionPreferenceChange);
  }

  private onMuteClick = async (): Promise<void> => {
    if (!this.audioUnlocked) {
      await this.ensureAudio();
      return;
    }
    this.audio.setMuted(!this.audio.muted);
    this.syncSoundButton();
  };

  private onPlaybackClick = async (): Promise<void> => {
    if (this.initialIntroPlaying || this.autoPlaying) {
      this.stopForManualControl();
      return;
    }
    await this.ensureAudio();
    if (this.navigation.atEnd) this.navigation.rewind(true);
    this.initialPlaybackCancelled = false;
    if (this.navigation.viewport.offset < this.initialIntroTarget - 1) {
      await this.beginOpeningPlayback("playback-button");
      return;
    }
    this.setAutoPlaying(true);
  };

  private onOpeningPointerDown = (event: PointerEvent): void => {
    if (this.openingGestureCompleted || !this.openingGestureReady) return;
    event.preventDefault();
    event.stopPropagation();
    this.openingGestureActive = true;
    this.openingGesturePointer = event.pointerId;
    this.openingGestureSuppressedPointer = event.pointerId;
    this.openingGestureStartX = event.clientX;
    this.openingGestureLastX = event.clientX;
    this.openingStringsPlayed.clear();
    const buttonRect = this.elements.introStrings.getBoundingClientRect();
    this.openingStringCenters = this.openingStringNodes.map(
      (string) => buttonRect.left + string.offsetLeft + string.offsetWidth / 2
    );
    this.openingStringCandidate = this.openingStringCenters.reduce(
      (nearestIndex, centerX, index) =>
        Math.abs(event.clientX - centerX) <
        Math.abs(event.clientX - this.openingStringCenters[nearestIndex])
          ? index
          : nearestIndex,
      0
    );
    this.openingStringNodes.forEach((string, index) => {
      string.classList.remove("is-plucked");
      const motion = this.openingStringMotions[index];
      motion.dragging = false;
    });
    this.elements.introStrings.setPointerCapture?.(event.pointerId);
    this.canvas.dataset.openingGestureDirection = "pending";
    this.canvas.dataset.openingStringCandidate = String(this.openingStringCandidate);
    void this.ensureAudio();
  };

  private onOpeningPointerMove = (event: PointerEvent): void => {
    if (!this.openingGestureActive || event.pointerId !== this.openingGesturePointer) return;
    event.preventDefault();
    const previousX = this.openingGestureLastX;
    this.openingGestureLastX = event.clientX;
    if (event.clientX >= previousX) {
      this.canvas.dataset.openingGestureDirection = "wrong-way";
      this.releaseOpeningStrings();
      return;
    }

    this.canvas.dataset.openingGestureDirection = "right-to-left";
    const pointerDelta = event.clientX - previousX;
    const gestureDistance = this.openingGestureStartX - event.clientX;
    for (const [index] of this.openingStringNodes.entries()) {
      const centerX = this.openingStringCenters[index];
      const motion = this.openingStringMotions[index];
      const isCandidate = index === this.openingStringCandidate;
      const distance = event.clientX - centerX;
      motion.dragging = !this.openingStringsPlayed.has(index) && (
        isCandidate ? gestureDistance > 0 : Math.abs(distance) < 30
      );
      if (motion.dragging) {
        motion.displacement = isCandidate
          ? Math.max(-44, -gestureDistance * 0.9)
          : Math.max(-36, Math.min(26, distance * 0.9));
        motion.velocity = pointerDelta * 0.9;
      }
      if (this.openingStringsPlayed.has(index)) continue;
      if (isCandidate && gestureDistance >= 10) {
        this.pluckOpeningString(index, pointerDelta, centerX);
        continue;
      }
      if (centerX > previousX + 4 || centerX < event.clientX - 4) continue;
      this.pluckOpeningString(index, pointerDelta, centerX);
    }
    this.canvas.dataset.openingStringsPlayed = String(this.openingStringsPlayed.size);

    if (
      this.openingStringsPlayed.size >= 1 &&
      gestureDistance >= 10
    ) {
      this.finishOpeningGesture(event.pointerId);
      void this.beginOpeningPlayback("string-sweep");
    }
  };

  private onOpeningPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.openingGesturePointer) return;
    this.finishOpeningGesture(event.pointerId);
  };

  private finishOpeningGesture(pointerId: number): void {
    if (!this.openingGestureActive) return;
    this.openingGestureActive = false;
    this.openingGesturePointer = -1;
    this.releaseOpeningStrings();
    if (this.elements.introStrings.hasPointerCapture?.(pointerId)) {
      this.elements.introStrings.releasePointerCapture?.(pointerId);
    }
  }

  private pluckOpeningString(index: number, pointerDelta: number, centerX: number): void {
    if (this.openingStringsPlayed.has(index)) return;
    this.openingStringsPlayed.add(index);
    this.openingStringNodes[index]?.classList.add("is-plucked");
    const motion = this.openingStringMotions[index];
    if (motion) {
      motion.dragging = false;
      motion.displacement = Math.min(-24, motion.displacement);
      motion.velocity = Math.min(-8.5, pointerDelta * 1.55);
    }
    const pan = this.panFor(centerX);
    void this.audio.strike(4 + index * 2, 0.82 + index * 0.05, true, -1, pan);
  }

  private releaseOpeningStrings(): void {
    this.openingStringMotions.forEach((motion) => {
      motion.dragging = false;
    });
  }

  private resetOpeningGesture(): void {
    if (this.openingGestureActive) return;

    this.openingGestureCompleted = false;
    this.openingGesturePointer = -1;
    this.openingGestureSuppressedPointer = -1;
    this.openingStringCandidate = -1;
    this.openingStringsPlayed.clear();

    this.openingStringMotions.forEach((motion) => {
      motion.displacement = 0;
      motion.velocity = 0;
      motion.dragging = false;
    });
    this.openingStringNodes.forEach((string) => {
      string.classList.remove("is-plucked");
      string.style.setProperty("--string-shift", "0px");
      string.style.setProperty("--string-tilt", "0deg");
    });

    this.elements.introStrings.classList.remove("is-complete");
    this.elements.introStrings.disabled = false;
    this.canvas.dataset.openingAwaitingGesture = "true";
    this.canvas.dataset.openingGestureComplete = "false";
    this.canvas.dataset.openingGestureDirection = "pending";
    this.canvas.dataset.openingStringsPlayed = "0";
    this.canvas.dataset.openingStringDisplacement = "0.00";
  }

  private updateOpeningStringMotion(dt: number): void {
    const frameScale = Math.min(1.8, Math.max(0.45, dt / 16.67));
    let maximumDisplacement = 0;

    this.openingStringNodes.forEach((string, index) => {
      const motion = this.openingStringMotions[index];
      if (!motion.dragging) {
        motion.velocity += -motion.displacement * 0.072 * frameScale;
        motion.velocity *= Math.pow(0.875, frameScale);
        motion.displacement += motion.velocity * frameScale;
        if (Math.abs(motion.displacement) < 0.04 && Math.abs(motion.velocity) < 0.04) {
          motion.displacement = 0;
          motion.velocity = 0;
        }
      }

      maximumDisplacement = Math.max(maximumDisplacement, Math.abs(motion.displacement));
      string.style.setProperty("--string-shift", `${motion.displacement.toFixed(2)}px`);
      string.style.setProperty(
        "--string-tilt",
        `${(motion.displacement * 0.115).toFixed(2)}deg`
      );
    });

    this.canvas.dataset.openingStringDisplacement = maximumDisplacement.toFixed(2);
  }

  private async beginOpeningPlayback(source: "playback-button" | "string-sweep"): Promise<void> {
    if (this.openingGestureCompleted && this.initialIntroPlaying) return;
    this.openingGestureCompleted = true;
    this.initialPlaybackCancelled = false;
    this.elements.introStrings.classList.add("is-complete");
    this.elements.introStrings.disabled = true;
    this.canvas.dataset.openingAwaitingGesture = "false";
    this.canvas.dataset.openingGestureComplete = "true";
    this.canvas.dataset.openingGestureSource = source;
    void this.ensureAudio();
    await this.renderer.backgroundReady;
    if (this.initialPlaybackCancelled) return;
    if (this.reducedMotion) {
      this.navigation.viewport.setTarget(this.initialIntroTarget, true);
      this.setAutoPlaying(true);
      return;
    }
    this.setInitialIntroPlaying(true);
  }

  private setAutoPlaying(playing: boolean): void {
    this.autoPlaying = playing;
    this.syncPlaybackButton();
  }

  private setInitialIntroPlaying(playing: boolean): void {
    this.initialIntroPlaying = playing;
    this.canvas.dataset.initialIntroPlaying = String(playing);
    this.syncPlaybackButton();
  }

  private stopForManualControl(stopEdge = true): void {
    this.initialPlaybackCancelled = true;
    this.initialIntroPlaying = false;
    this.autoPlaying = false;
    if (stopEdge) this.navigation.stopEdge();
    this.canvas.dataset.initialIntroPlaying = "false";
    this.canvas.dataset.manualPlaybackStop = "true";
    this.syncPlaybackButton();
  }

  private syncPlaybackButton(): void {
    const playing = this.initialIntroPlaying || this.autoPlaying;
    this.elements.playback.setAttribute("aria-pressed", String(playing));
    this.elements.playback.setAttribute(
      "aria-label",
      playing ? "暂停自动播放长卷" : "开始自动播放长卷"
    );
    const label = this.elements.playback.querySelector("span");
    if (label) label.textContent = playing ? "暂停" : "播放";
    this.canvas.dataset.autoPlaying = String(this.autoPlaying);
    this.canvas.dataset.playbackActive = String(playing);
  }

  private async ensureAudio(): Promise<boolean> {
    try {
      await this.audio.ensure();
    } catch {
      this.canvas.dataset.audioUnlocked = "false";
      return false;
    }
    this.audioUnlocked = this.audio.state === "running";
    this.canvas.dataset.audioUnlocked = String(this.audioUnlocked);
    this.syncSoundButton();
    return this.audioUnlocked;
  }

  private syncSoundButton(): void {
    const needsSoundPermission = !this.audioUnlocked;
    const label = needsSoundPermission || this.audio.muted ? "启声" : "静音";
    this.elements.mute.setAttribute("aria-pressed", String(this.audio.muted));
    this.elements.mute.setAttribute(
      "aria-label",
      needsSoundPermission || this.audio.muted ? "开启琵琶声音" : "静音琵琶声音"
    );
    const text = this.elements.mute.querySelector("span");
    if (text) text.textContent = label;
  }

  private onMotionPreferenceChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches || forceReducedMotion;
    this.canvas.dataset.reducedMotion = String(this.reducedMotion);
    this.navigation.setReducedMotion(this.reducedMotion);
    if (this.reducedMotion) {
      if (this.initialIntroPlaying || this.autoPlaying) this.stopForManualControl();
      this.navigation.stopEdge();
      this.renderer.clearRipples();
    }
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.interaction.pressing = true;
    this.elements.cursor.classList.add("is-pressing");
    void this.ensureAudio();
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
    if (event.pointerId === this.openingGestureSuppressedPointer) return;
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

    const openingEdgeLocked = !this.openingGestureCompleted &&
      this.navigation.viewport.offset < this.initialIntroTarget - 1;
    this.canvas.dataset.openingEdgeLocked = String(openingEdgeLocked);
    if (overUi || openingEdgeLocked) {
      this.navigation.stopEdge();
    } else {
      this.navigation.updateEdge(
        event.clientX,
        this.interaction.pressing || Boolean(this.grabbed)
      );
    }

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
    if (event.pointerId === this.openingGestureSuppressedPointer) {
      this.openingGestureSuppressedPointer = -1;
      return;
    }
    this.releaseGrabbedString();
    this.interaction.pressing = false;
    this.elements.cursor.classList.remove("is-pressing");
    if (event.pointerType !== "mouse") this.navigation.stopEdge();
  };

  private onPointerCancel = (): void => {
    this.openingGestureSuppressedPointer = -1;
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
    this.openingGestureSuppressedPointer = -1;
    this.interaction.active = false;
    this.interaction.pressing = false;
    this.releaseGrabbedString();
    this.elements.cursor.classList.remove("is-visible", "is-pressing");
    this.navigation.stopEdge();
  };

  private releaseGrabbedString(): void {
    if (!this.grabbed) return;
    this.grabbed.pinned = false;
    this.grabbed = null;
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.canvas.dataset.renderSuspended = "true";
      return;
    }
    this.lastFrame = performance.now();
    this.canvas.dataset.renderSuspended = "false";
    this.requestFrame();
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
    this.stopForManualControl();
    void this.ensureAudio();
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
    this.stopForManualControl();
    void this.ensureAudio();
    this.canvas.dataset.lastInteraction = "keyboard";
    this.navigation.handleKey(event.key as "ArrowLeft" | "ArrowRight" | "Home" | "End");
  };

  private panFor(screenX: number): number {
    return Math.max(-1, Math.min(1, screenX / Math.max(1, this.width) * 2 - 1));
  }

  private updateUi(): void {
    const progress = this.navigation.viewport.progress;
    this.canvas.dataset.awakeStrings = String(this.simulation.awakeCount);
    this.canvas.dataset.progress = progress.toFixed(4);
    this.canvas.dataset.cameraOffset = this.cameraOffset.toFixed(2);
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

    const introProgress = clamp01(
      this.navigation.viewport.offset / Math.max(1, this.introDistance)
    );
    const introTransition = introExitProgress(introProgress);
    this.canvas.dataset.introTransition = introTransition.toFixed(3);
    if (
      this.openingGestureReady &&
      this.openingGestureCompleted &&
      !this.initialIntroPlaying &&
      !this.autoPlaying
    ) {
      this.resetOpeningGesture();
    }
    if (
      introProgress >= OPENING_CADENCE_TRIGGER &&
      introProgress < OPENING_CADENCE_WINDOW_END
    ) {
      this.tryPlayOpeningCadence();
    }
    if (introProgress < OPENING_CADENCE_RESET) this.openingSoundPlayed = false;

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

  private get initialIntroTarget(): number {
    return this.introDistance * INTRO_EXIT_END;
  }

  private get openingGestureReady(): boolean {
    return this.navigation.viewport.target <= this.introDistance * INTRO_EXIT_START;
  }

}
