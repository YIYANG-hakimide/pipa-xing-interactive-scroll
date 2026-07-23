import {
  PIPA_XING_TEMPO,
  phraseForColumn,
  stringMidiForColumn,
  type MelodyNote
} from "../../themes/pipa-xing/melody";

export class PipaEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private phraseSources = new Set<AudioBufferSourceNode>();
  private lastStrike = 0;
  private lastColumn = -1;
  muted = false;

  get state(): AudioContextState | "uninitialized" {
    return this.context?.state ?? "uninitialized";
  }

  async ensure(): Promise<boolean> {
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext;
      this.context = new AudioContextConstructor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.34;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 5;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
    return true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopPhrase();
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.34, this.context.currentTime, 0.03);
    }
  }

  async strike(
    columnIndex: number,
    intensity: number,
    force = false,
    gestureX = 0,
    pan = 0
  ): Promise<void> {
    if (this.muted) return;
    const now = performance.now();
    if (!force && now - this.lastStrike < 72) return;
    if (!force && this.lastColumn === columnIndex) return;
    await this.ensure();
    if (!this.context || !this.master) return;

    this.lastStrike = now;
    this.lastColumn = columnIndex;
    const rightToLeft = gestureX < -0.18;
    const leftToRight = gestureX > 0.18;
    const note: MelodyNote = {
      midi: stringMidiForColumn(columnIndex),
      eighths: 1,
      accent: rightToLeft ? 1.08 : leftToRight ? 0.92 : 1
    };
    const nowAudio = this.context.currentTime;
    this.pluck(
      note,
      nowAudio,
      intensity * 0.78,
      false,
      pan,
      rightToLeft ? "bright" : leftToRight ? "dark" : "neutral"
    );
    if (rightToLeft && intensity > 0.58) {
      this.pluck(
        { ...note, midi: note.midi + 7, accent: 0.45 },
        nowAudio + 0.034,
        intensity * 0.3,
        false,
        Math.max(-1, Math.min(1, pan - 0.06)),
        "bright"
      );
    } else if (leftToRight && intensity > 0.66) {
      this.pluck(
        { ...note, midi: note.midi - 12, accent: 0.32 },
        nowAudio + 0.018,
        intensity * 0.22,
        false,
        Math.max(-1, Math.min(1, pan + 0.05)),
        "dark"
      );
    }
  }

  async playPhrase(columnIndex: number, intensity: number, pan = 0): Promise<boolean> {
    if (this.muted) return false;
    await this.ensure();
    if (!this.context || !this.master || this.context.state !== "running") return false;

    this.stopPhrase();
    this.lastStrike = performance.now();
    this.lastColumn = columnIndex;

    const phrase = phraseForColumn(columnIndex);
    const eighthSeconds = 30 / PIPA_XING_TEMPO;
    let cursor = this.context.currentTime + 0.025;
    phrase.notes.forEach((note, index) => {
      this.pluck(note, cursor, intensity, true, pan);
      // A very quiet octave reinforcement gives the synthetic string a pipa-like body.
      if (index === 0 || (note.accent ?? 1) > 1.1) {
        this.pluck(
          { ...note, midi: note.midi - 12 },
          cursor + 0.012,
          intensity * 0.2,
          true,
          pan
        );
      }
      cursor += note.eighths * eighthSeconds;
    });
    return phrase.notes.length > 0;
  }

  async playOpeningCadence(): Promise<boolean> {
    if (this.muted) return false;
    await this.ensure();
    if (!this.context || !this.master || this.context.state !== "running") return false;

    this.stopPhrase();
    const eighthSeconds = 30 / PIPA_XING_TEMPO;
    const notes: MelodyNote[] = [
      { midi: 57, eighths: 1.5, accent: 0.48 },
      { midi: 64, eighths: 1, accent: 0.58 },
      { midi: 69, eighths: 1, accent: 0.72 },
      { midi: 71, eighths: 0.75, accent: 0.82 },
      { midi: 73, eighths: 0.75, accent: 0.92 },
      { midi: 76, eighths: 2.5, accent: 1.04 }
    ];
    let cursor = this.context.currentTime + 0.025;
    notes.forEach((note, index) => {
      const intensity = 0.44 + index * 0.045;
      this.pluck(note, cursor, intensity, true, -0.18 + index * 0.07, "bright");
      if (index === notes.length - 1) {
        this.pluck(
          { ...note, midi: note.midi - 12, accent: 0.32 },
          cursor + 0.02,
          0.2,
          true,
          0.2,
          "neutral"
        );
      }
      cursor += note.eighths * eighthSeconds;
    });
    return true;
  }

  async playEndingCadence(): Promise<boolean> {
    if (this.muted) return false;
    await this.ensure();
    if (!this.context || !this.master || this.context.state !== "running") return false;

    this.stopPhrase();
    const eighthSeconds = 30 / PIPA_XING_TEMPO;
    const notes: MelodyNote[] = [
      { midi: 76, eighths: 1, accent: 0.92 },
      { midi: 73, eighths: 1, accent: 0.82 },
      { midi: 71, eighths: 1.5, accent: 0.72 },
      { midi: 69, eighths: 2, accent: 0.62 },
      { midi: 64, eighths: 2.5, accent: 0.5 },
      { midi: 57, eighths: 5, accent: 0.42 }
    ];
    let cursor = this.context.currentTime + 0.035;
    notes.forEach((note, index) => {
      const intensity = Math.max(0.24, 0.66 - index * 0.075);
      this.pluck(note, cursor, intensity, true, 0);
      if (index === notes.length - 1) {
        this.pluck(
          { ...note, midi: note.midi + 12, accent: 0.28 },
          cursor + 0.045,
          0.2,
          true,
          0
        );
      }
      cursor += note.eighths * eighthSeconds;
    });
    return true;
  }

  releaseColumn(): void {
    this.lastColumn = -1;
  }

  private stopPhrase(): void {
    this.phraseSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // A source may already have ended between the gesture and this cleanup.
      }
    });
    this.phraseSources.clear();
  }

  private pluck(
    note: MelodyNote,
    time: number,
    intensity: number,
    phrase: boolean,
    pan = 0,
    articulation: "bright" | "dark" | "neutral" = "neutral"
  ): void {
    if (!this.context || !this.master) return;
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
    const buffer = this.getPluckBuffer(frequency);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.992 + Math.random() * 0.016;

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    const brightness = articulation === "bright" ? 1.22 : articulation === "dark" ? 0.72 : 1;
    filter.frequency.value = (2250 + intensity * 2850) * brightness;
    filter.Q.value = 1.7;

    const body = this.context.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 690;
    body.Q.value = 1.8;
    body.gain.value = 4.6;

    const gain = this.context.createGain();
    const peak = (0.09 + intensity * 0.19) * (note.accent ?? 1);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), time + 0.006);
    const decay = articulation === "dark" ? 1.12 : articulation === "bright" ? 0.84 : 1;
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      time + (0.72 + intensity * 0.28) * decay
    );

    source.connect(filter);
    filter.connect(body);
    body.connect(gain);
    if (typeof this.context.createStereoPanner === "function") {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      panner.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    source.start(time);
    source.stop(time + 1.12);
    if (phrase) {
      this.phraseSources.add(source);
      source.addEventListener("ended", () => this.phraseSources.delete(source), { once: true });
    }
  }

  private getPluckBuffer(frequency: number): AudioBuffer {
    const cached = this.buffers.get(frequency);
    if (cached) return cached;
    if (!this.context) throw new Error("AudioContext is not initialized");

    const sampleRate = this.context.sampleRate;
    const duration = 1.8;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    const period = Math.max(2, Math.round(sampleRate / frequency));

    for (let i = 0; i < period; i += 1) {
      const pick = i < period * 0.16 ? 1.25 : 0.8;
      data[i] = (Math.random() * 2 - 1) * pick;
    }
    for (let i = period; i < length; i += 1) {
      const previous = data[i - period];
      const adjacent = data[Math.max(0, i - period - 1)];
      const brightness = i < sampleRate * 0.08 ? 0.992 : 0.9965;
      data[i] = (previous * 0.58 + adjacent * 0.42) * brightness;
    }

    this.buffers.set(frequency, buffer);
    return buffer;
  }
}
