export interface TextLine {
  id: string;
  text: string;
}

export interface TextBlock {
  id: string;
  lines: TextLine[];
}

export interface WorkSection {
  id: string;
  title?: string;
  lines: TextLine[];
  mood?: string;
  audioCue?: string;
}

export interface Annotation {
  lineId: string;
  note: string;
}

export interface WorkDefinition {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  sourceEdition: string;
  preface?: TextBlock[];
  sections: WorkSection[];
  annotations?: Annotation[];
}

