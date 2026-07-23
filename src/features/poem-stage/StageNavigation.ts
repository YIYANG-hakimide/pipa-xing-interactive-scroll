import { ScrollViewport } from "../../core/viewport/ScrollViewport";

export class StageNavigation {
  readonly viewport = new ScrollViewport();
  timelineDragging = false;

  private width = 0;
  private readingEndOffset = 0;
  private endingDistance = 0;
  private reducedMotion = false;
  private edgeScrollSpeed = 0;
  private edgeIntent: -1 | 0 | 1 = 0;
  private edgeIntentSince = 0;
  private edgeAutoTicks = 0;
  private endingUnlocked = false;
  private endingNeedsRelease = false;
  private endingGateArmed = false;

  constructor(private dataset: DOMStringMap) {}

  configure(options: {
    width: number;
    worldWidth: number;
    readingEndOffset: number;
    endingDistance: number;
    reducedMotion: boolean;
  }): void {
    const progress = this.viewport.progress;
    this.width = options.width;
    this.readingEndOffset = options.readingEndOffset;
    this.endingDistance = options.endingDistance;
    this.reducedMotion = options.reducedMotion;
    this.viewport.resize(options.worldWidth, options.width);
    this.viewport.setProgress(progress);
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    if (reducedMotion) this.stopEdge();
  }

  update(dt: number, time: number): void {
    this.updateEdgeMotion(dt, time);
    if (Math.abs(this.edgeScrollSpeed) > 0.1) {
      const nextTarget = this.viewport.target + this.edgeScrollSpeed * dt / 1000;
      if (
        this.edgeScrollSpeed > 0 &&
        !this.endingUnlocked &&
        nextTarget >= this.readingEndOffset
      ) {
        this.viewport.setTarget(this.readingEndOffset);
        this.endingNeedsRelease = true;
      } else {
        this.viewport.setTarget(nextTarget);
      }
      this.edgeAutoTicks += 1;
      this.dataset.edgeAutoTicks = String(this.edgeAutoTicks);
    }

    if (this.viewport.target < this.readingEndOffset - 28) this.resetEndingGate();
    this.viewport.update(dt);
  }

  updateEdge(clientX: number, interactionBusy: boolean): void {
    if (this.timelineDragging || interactionBusy) {
      this.stopEdge();
      return;
    }
    const edgeZone = this.width < 720 ? 58 : 82;
    let nextIntent: -1 | 0 | 1 = 0;
    if (clientX < edgeZone) nextIntent = 1;
    else if (clientX > this.width - edgeZone) nextIntent = -1;

    if (nextIntent !== this.edgeIntent) {
      const previousIntent = this.edgeIntent;
      if (nextIntent === 0 && this.endingNeedsRelease) {
        this.endingGateArmed = true;
        this.endingNeedsRelease = false;
      }
      const startsBeyondLastString = nextIntent === 1 && previousIntent !== 1 &&
        this.viewport.target >= this.readingEndOffset - 2 && !this.endingNeedsRelease;
      if (
        nextIntent === 1 &&
        previousIntent !== 1 &&
        (this.endingGateArmed || startsBeyondLastString)
      ) this.unlockEnding();
      this.edgeIntent = nextIntent;
      this.edgeIntentSince = performance.now();
    }

    const label = nextIntent === 1 ? "left" : nextIntent === -1 ? "right" : "none";
    this.dataset.edgeScroll = label;
    if (label !== "none") this.dataset.lastEdgeScroll = label;
  }

  stopEdge(): void {
    if (this.edgeIntent !== 0 && this.endingNeedsRelease) {
      this.endingGateArmed = true;
      this.endingNeedsRelease = false;
    }
    this.edgeIntent = 0;
    this.dataset.edgeScroll = "none";
  }

  beginTimeline(): void {
    this.timelineDragging = true;
    this.stopEdge();
  }

  endTimeline(): void {
    this.timelineDragging = false;
  }

  setTimelineProgress(progress: number, immediate: boolean): void {
    const target = progress * this.viewport.maxOffset;
    if (target > this.readingEndOffset + 2) this.unlockEnding();
    this.viewport.setProgress(progress, immediate || this.reducedMotion);
  }

  advanceAutomatically(delta: number): boolean {
    if (this.viewport.target >= this.viewport.maxOffset - 1) return true;
    const nextTarget = Math.min(this.viewport.maxOffset, this.viewport.target + delta);
    if (nextTarget > this.readingEndOffset) this.unlockEnding();
    this.viewport.setTarget(nextTarget, this.reducedMotion);
    return nextTarget >= this.viewport.maxOffset - 1;
  }

  rewind(immediate = false): void {
    this.resetEndingGate();
    this.viewport.setTarget(0, immediate || this.reducedMotion);
  }

  get atEnd(): boolean {
    return this.viewport.target >= this.viewport.maxOffset - 1;
  }

  handleKey(key: "ArrowLeft" | "ArrowRight" | "Home" | "End"): void {
    this.stopEdge();
    const step = Math.max(88, Math.min(180, this.width * 0.12));
    if (key === "Home") {
      this.resetEndingGate();
      this.viewport.setTarget(0, this.reducedMotion);
      return;
    }
    if (key === "End") {
      if (this.viewport.target < this.readingEndOffset - 2) {
        this.viewport.setTarget(this.readingEndOffset, this.reducedMotion);
      } else if (!this.endingUnlocked) {
        this.unlockEnding();
        this.viewport.setTarget(
          this.readingEndOffset + this.endingDistance * 0.48,
          this.reducedMotion
        );
      } else {
        this.viewport.setTarget(this.viewport.maxOffset, this.reducedMotion);
      }
      return;
    }
    if (key === "ArrowRight") {
      this.viewport.setTarget(this.viewport.target - step, this.reducedMotion);
      return;
    }
    if (this.viewport.target >= this.readingEndOffset - 2 && !this.endingUnlocked) {
      this.unlockEnding();
      this.viewport.setTarget(this.readingEndOffset + step, this.reducedMotion);
    } else if (!this.endingUnlocked && this.viewport.target + step >= this.readingEndOffset) {
      this.viewport.setTarget(this.readingEndOffset, this.reducedMotion);
    } else {
      this.viewport.setTarget(this.viewport.target + step, this.reducedMotion);
    }
  }

  private updateEdgeMotion(dt: number, time: number): void {
    const delayedIntent = this.edgeIntent !== 0 && time - this.edgeIntentSince >= 180
      ? this.edgeIntent
      : 0;
    const cruisingSpeed = this.reducedMotion ? 138 : this.width < 720 ? 168 : 220;
    const desired = delayedIntent * cruisingSpeed;
    const accelerating = Math.abs(desired) > Math.abs(this.edgeScrollSpeed);
    const blend = 1 - Math.exp(-dt / (accelerating ? 105 : 145));
    this.edgeScrollSpeed += (desired - this.edgeScrollSpeed) * blend;
    if (Math.abs(this.edgeScrollSpeed) < 0.35 && desired === 0) this.edgeScrollSpeed = 0;
    this.dataset.edgeSpeed = this.edgeScrollSpeed.toFixed(2);
  }

  private unlockEnding(): void {
    this.endingUnlocked = true;
    this.endingGateArmed = false;
    this.endingNeedsRelease = false;
    this.dataset.endingUnlocked = "true";
  }

  private resetEndingGate(): void {
    this.endingUnlocked = false;
    this.endingGateArmed = false;
    this.endingNeedsRelease = false;
    this.dataset.endingUnlocked = "false";
  }
}
