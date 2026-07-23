export interface MelodyNote {
  /** MIDI note number; 69 is A4. */
  midi: number;
  /** Duration in eighth-note units at the theme tempo. */
  eighths: number;
  /** Slight emphasis for the first or structurally important notes. */
  accent?: number;
}

export interface MelodyPhrase {
  notes: readonly MelodyNote[];
}

export const PIPA_XING_TEMPO = 90;

const PENTATONIC_DEGREES = [0, 2, 4, 7, 9] as const;

/**
 * 每一列文字弦的固定自由演奏音高。
 * columnIndex 越大，空间位置越靠左，音高也越高。
 */
export function stringMidiForColumn(columnIndex: number): number {
  const safeIndex = Math.max(0, columnIndex);
  const octave = Math.floor(safeIndex / PENTATONIC_DEGREES.length);
  const degree = PENTATONIC_DEGREES[safeIndex % PENTATONIC_DEGREES.length];
  return 45 + octave * 12 + degree;
}

const n = (midi: number, eighths = 1, accent = 1): MelodyNote => ({
  midi,
  eighths,
  accent
});

/**
 * 《琵琶行》（奇然、沈谧仁版本）正文主旋律的交互化短句。
 *
 * 这里不包含、分发或播放原歌曲/MIDI，只保留根据公开谱面人工整理的
 * 音高与相对节奏事件，再交由本站的 Web Audio 琵琶合成器演奏。
 * 参考：EveryonePiano 公开谱面（1=A, 4/4, 约 90 BPM）；
 * MidiShow 58823（上传说明署名 B 站「女朋友是调音师」）。
 *
 * 每个短句对应长卷中的一列（两句正文），让从右向左拨动时能够连续
 * 拼出同一首歌的主题，而不是从音阶中随机取音。
 */
export const PIPA_XING_PHRASES: readonly MelodyPhrase[] = [
  { notes: [n(78, 1, 1.15), n(73), n(71), n(69), n(71), n(73), n(71), n(69, 2)] },
  { notes: [n(76, 1, 1.12), n(78), n(76), n(71), n(69, 3)] },
  { notes: [n(78, 1, 1.15), n(78), n(71), n(69), n(68), n(69), n(68), n(69, 2)] },
  { notes: [n(78, 1, 1.1), n(69), n(68), n(76), n(78, 3)] },

  { notes: [n(78, 1, 1.14), n(76), n(74), n(76), n(78), n(76), n(71, 2)] },
  { notes: [n(73, 1, 1.1), n(71), n(69), n(76), n(80, 2), n(78, 2)] },
  { notes: [n(78, 1, 1.13), n(69), n(71), n(73), n(71), n(71), n(76, 2)] },
  { notes: [n(76, 1, 1.08), n(78), n(76), n(73), n(71, 3)] },

  { notes: [n(78, 1, 1.14), n(76), n(74), n(76), n(78), n(76), n(71, 2)] },
  { notes: [n(73, 1, 1.1), n(71), n(69), n(76), n(80, 1), n(78), n(76, 2)] },
  { notes: [n(78, 1, 1.15), n(69), n(71), n(73), n(71), n(76), n(78, 2)] },
  { notes: [n(76, 1, 1.1), n(78), n(76), n(71), n(69, 3)] },

  { notes: [n(78, 1, 1.15), n(81), n(76), n(78), n(76), n(74), n(76, 2)] },
  { notes: [n(81, 1, 1.12), n(80), n(78), n(76), n(73), n(71), n(69, 2)] },
  { notes: [n(78, 1, 1.14), n(69), n(71), n(73), n(71), n(76), n(80, 2)] },
  { notes: [n(81, 1, 1.15), n(80), n(78), n(76), n(73), n(71), n(69, 2)] },

  { notes: [n(78, 1, 1.12), n(76), n(78), n(76), n(71), n(73), n(71), n(69, 2)] },
  { notes: [n(76, 1, 1.1), n(78), n(80), n(81), n(80), n(78), n(76, 2)] },
  { notes: [n(78, 1, 1.14), n(81), n(80), n(78), n(76), n(73), n(71, 2)] },
  { notes: [n(69, 1, 1.08), n(71), n(73), n(76), n(73), n(71), n(69, 3)] },

  { notes: [n(78, 1, 1.18), n(78), n(81), n(80), n(78), n(76), n(73, 2)] },
  { notes: [n(71, 1, 1.12), n(73), n(76), n(78), n(76), n(71), n(69, 4, 1.2)] }
];

export function phraseForColumn(columnIndex: number): MelodyPhrase {
  const index = Math.abs(columnIndex) % PIPA_XING_PHRASES.length;
  return PIPA_XING_PHRASES[index];
}
