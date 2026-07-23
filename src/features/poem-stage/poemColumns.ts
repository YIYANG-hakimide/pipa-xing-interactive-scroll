import type { WorkDefinition } from "../../content/types";
import type { PoemColumn } from "./types";

export interface PoemColumnSet {
  columns: PoemColumn[];
  totalLines: number;
  scrollLines: number;
  endingLines: number;
}

const ENDING_LINE_ID = "reprise-3";

export function buildPoemColumns(work: WorkDefinition): PoemColumnSet {
  const columns: PoemColumn[] = [];
  let totalLines = 0;
  let scrollLines = 0;

  work.sections.forEach((section) => {
    totalLines += section.lines.length;
    const lines = section.lines.filter((line) => line.id !== ENDING_LINE_ID);
    scrollLines += lines.length;

    for (let index = 0; index < lines.length; index += 2) {
      const group = lines.slice(index, index + 2);
      columns.push({
        id: group.map((line) => line.id).join("--"),
        sectionId: section.id,
        sectionTitle: section.title || "正文",
        text: group.map((line) => line.text).join("　")
      });
    }
  });

  return {
    columns,
    totalLines,
    scrollLines,
    endingLines: totalLines - scrollLines
  };
}

