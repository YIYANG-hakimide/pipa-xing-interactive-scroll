export const INTRO_EXIT_START = 0.025;
export const INTRO_EXIT_END = 0.21;
export const OPENING_CADENCE_TRIGGER = 0.075;
export const OPENING_CADENCE_WINDOW_END = 0.46;
export const OPENING_CADENCE_RESET = 0.012;

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function progressBetween(value: number, start: number, end: number): number {
  return clamp01((value - start) / Math.max(0.0001, end - start));
}

export function easeOutCubic(value: number): number {
  const remaining = 1 - clamp01(value);
  return 1 - remaining * remaining * remaining;
}

export function introExitProgress(introProgress: number): number {
  return progressBetween(introProgress, INTRO_EXIT_START, INTRO_EXIT_END);
}
