export interface PoemColumn {
  id: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
}

export interface PoemStageElements {
  progress: HTMLElement;
  progressFill: HTMLElement;
  section: HTMLElement;
  counter: HTMLElement;
  mute: HTMLButtonElement;
  playback: HTMLButtonElement;
  intro: HTMLElement;
  introStrings: HTMLButtonElement;
  ending: HTMLElement;
  cursor: HTMLElement;
}

export interface StageMetrics {
  width: number;
  height: number;
  dpr: number;
  rightAnchor: number;
  charGap: number;
  columnGap: number;
  fontSize: number;
  introDistance: number;
  readingEndOffset: number;
  endingDistance: number;
  worldWidth: number;
}
