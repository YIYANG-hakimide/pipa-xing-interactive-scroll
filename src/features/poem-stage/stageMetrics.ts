import type { PoemColumn, StageMetrics } from "./types";

export function calculateStageMetrics(
  width: number,
  height: number,
  columns: readonly PoemColumn[]
): StageMetrics {
  const mobile = width < 720;
  const maxChars = Math.max(...columns.map((column) => Array.from(column.text).length));
  const charGap = Math.max(
    mobile ? 17.5 : 20,
    Math.min(29, (height * 0.69) / Math.max(1, maxChars - 1))
  );
  const columnGap = mobile ? 82 : 104;
  const introDistance = width * (mobile ? 1.08 : 0.94);
  const rightAnchor = width - (mobile ? 48 : 105);
  const finalColumnReadingX = width * (mobile ? 0.12 : 0.15);
  const readingEndOffset = Math.max(
    introDistance,
    introDistance + (columns.length - 1) * columnGap + finalColumnReadingX - rightAnchor
  );
  const endingDistance = width * (mobile ? 0.48 : 0.38);

  return {
    width,
    height,
    dpr: Math.min(mobile ? 1.25 : 1.5, Math.max(1, window.devicePixelRatio || 1)),
    rightAnchor,
    charGap,
    columnGap,
    fontSize: Math.max(mobile ? 18 : 21, Math.min(mobile ? 23 : 27, charGap * 1.18)),
    introDistance,
    readingEndOffset,
    endingDistance,
    worldWidth: readingEndOffset + endingDistance + width * 0.62
  };
}
