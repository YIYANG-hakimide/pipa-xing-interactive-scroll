import type { PoemColumn, PoemStageElements } from "./types";
import {
  INTRO_EXIT_END,
  clamp01,
  easeOutCubic,
  introExitProgress
} from "./stageTransitions";

interface StageUiState {
  progress: number;
  offset: number;
  introDistance: number;
  readingEndOffset: number;
  endingDistance: number;
  width: number;
  endingProgress: number;
  columns: readonly PoemColumn[];
  reducedMotion: boolean;
}

export class StageUiPresenter {
  private currentSectionId = "";
  private experience: HTMLElement;

  constructor(private elements: PoemStageElements, canvas: HTMLCanvasElement) {
    this.experience = canvas.parentElement ?? canvas;
  }

  update(state: StageUiState): void {
    const introProgress = clamp01(state.offset / Math.max(1, state.introDistance));
    const introExit = introExitProgress(introProgress);
    const easedIntroExit = easeOutCubic(introExit);
    const introShift = state.reducedMotion ? 0 : easedIntroExit * state.width * 0.075;
    this.elements.intro.style.setProperty("--intro-x", `${introShift}px`);
    this.elements.intro.style.setProperty(
      "--intro-alpha",
      String(1 - easedIntroExit)
    );
    this.elements.intro.style.setProperty(
      "--intro-blur",
      `${state.reducedMotion ? 0 : easedIntroExit * 1.8}px`
    );
    this.elements.intro.style.setProperty("--intro-copy-alpha", String(1 - introExit));
    this.elements.intro.style.setProperty(
      "--intro-composition-x",
      `${state.reducedMotion ? 0 : easedIntroExit * 24}px`
    );
    this.elements.intro.style.setProperty(
      "--intro-title-y",
      `${state.reducedMotion ? 0 : easedIntroExit * -28}px`
    );
    this.elements.intro.style.visibility = introExit > 0.995 ? "hidden" : "visible";

    const progressLabel = this.progressLabel(state);
    const progressPercent = Math.round(state.progress * 100);
    this.elements.progressFill.style.transform = `scaleX(${Math.max(0.005, state.progress)})`;
    this.elements.progress.style.setProperty("--progress", String(state.progress));
    this.elements.progress.setAttribute("aria-valuenow", String(progressPercent));
    this.elements.progress.setAttribute("aria-valuetext", progressLabel);
    this.elements.counter.textContent = progressLabel;

    const endingShift = state.reducedMotion ? 0 : (1 - state.endingProgress) * -state.width * 0.075;
    this.elements.ending.style.setProperty("--ending-opacity", String(state.endingProgress));
    this.elements.ending.style.setProperty("--ending-x", `${endingShift}px`);
    this.elements.ending.style.setProperty(
      "--ending-blur",
      `${state.reducedMotion ? 0 : (1 - state.endingProgress) * 1.8}px`
    );
    const copyAlpha = Math.max(0, Math.min(1, (state.endingProgress - 0.18) / 0.68));
    this.elements.ending.style.setProperty("--ending-copy-alpha", String(copyAlpha));
    this.elements.ending.style.setProperty("--ending-first-alpha", String(copyAlpha));
    this.elements.ending.style.setProperty(
      "--ending-composition-x",
      `${state.reducedMotion ? 0 : (1 - copyAlpha) * 24}px`
    );
    this.elements.ending.style.setProperty(
      "--ending-title-y",
      `${state.reducedMotion ? 0 : (1 - copyAlpha) * 28}px`
    );
    this.elements.ending.style.setProperty(
      "--ending-line-y",
      `${state.reducedMotion ? 0 : (1 - copyAlpha) * 38}px`
    );
    this.elements.ending.style.setProperty(
      "--ending-first-y",
      `${state.reducedMotion ? 0 : (1 - copyAlpha) * 56}px`
    );

    const endingVisible = state.endingProgress > 0;
    this.elements.ending.classList.toggle("is-visible", endingVisible);
    this.elements.ending.setAttribute("aria-hidden", String(!endingVisible));
    this.experience.classList.toggle("is-reading", introExit > 0.78);
    this.experience.classList.toggle("is-ending", state.endingProgress > 0.02);
    this.experience.classList.toggle("is-reduced-motion", state.reducedMotion);
    this.experience.style.setProperty("--reading-progress", String(state.progress));
    this.experience.style.setProperty("--ending-progress", String(state.endingProgress));

    this.updateSection(state);
  }

  private progressLabel(state: StageUiState): string {
    if (state.offset < state.introDistance * INTRO_EXIT_END) return "卷首";
    if (state.offset > state.readingEndOffset + state.endingDistance * 0.45) return "曲终";
    const readingProgress = Math.max(
      0,
      Math.min(
        1,
        (state.offset - state.introDistance) /
          Math.max(1, state.readingEndOffset - state.introDistance)
      )
    );
    const numerals = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const tenth = Math.max(1, Math.min(9, Math.floor(readingProgress * 10)));
    return `阅至${numerals[tenth - 1]}成`;
  }

  private updateSection(state: StageUiState): void {
    if (state.endingProgress > 0.35) {
      this.setSection("ending", "曲终", state.reducedMotion);
      return;
    }
    if (state.offset < state.introDistance * INTRO_EXIT_END) {
      this.setSection("intro", "卷首", state.reducedMotion);
      return;
    }
    const readingProgress = Math.max(
      0,
      Math.min(
        1,
        (state.offset - state.introDistance) /
          Math.max(1, state.readingEndOffset - state.introDistance)
      )
    );
    const index = Math.max(
      0,
      Math.min(state.columns.length - 1, Math.round(readingProgress * (state.columns.length - 1)))
    );
    const section = state.columns[index];
    if (section) this.setSection(section.sectionId, section.sectionTitle, state.reducedMotion);
  }

  private setSection(id: string, label: string, reducedMotion: boolean): void {
    if (id === this.currentSectionId) return;
    this.currentSectionId = id;
    this.elements.section.textContent = label;
    if (reducedMotion) return;
    this.elements.section.animate(
      [
        { opacity: 0, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }
}
