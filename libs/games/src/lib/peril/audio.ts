/**
 * PERIL! sound design — everything synthesized live via WebAudio.
 * No audio files, no network, nothing copyrighted. The Final PERIL! think
 * music is an ORIGINAL 30-second composition (explicitly not the Jeopardy
 * theme). Gracefully no-ops when AudioContext is unavailable (SSR/Jest).
 */

type AnyAudioContextCtor = typeof AudioContext;

function resolveAudioContextCtor(): AnyAudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & { webkitAudioContext?: AnyAudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const midiHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Original gentle think-music loop for Final PERIL!, 16 bars of 3/4 at
 * 96 BPM = 48 beats = exactly 30 seconds. Composed for this game.
 * Tuples: [startBeat, midiNote, durationBeats].
 */
const THINK_MELODY: Array<[number, number, number]> = [
  [0, 64, 2],
  [2, 67, 1],
  [3, 69, 2],
  [5, 67, 1],
  [6, 64, 1],
  [7, 60, 1],
  [8, 62, 1],
  [9, 64, 3],
  [12, 65, 2],
  [14, 69, 1],
  [15, 67, 2],
  [17, 64, 1],
  [18, 62, 1],
  [19, 64, 1],
  [20, 59, 1],
  [21, 60, 3],
  [24, 64, 2],
  [26, 67, 1],
  [27, 69, 2],
  [29, 72, 1],
  [30, 71, 1],
  [31, 69, 1],
  [32, 67, 1],
  [33, 69, 3],
  [36, 65, 2],
  [38, 62, 1],
  [39, 64, 2],
  [41, 60, 1],
  [42, 62, 2],
  [44, 59, 1],
  [45, 60, 3],
];

/** Bass roots, one per bar (whole-bar notes). */
const THINK_BASS: number[] = [48, 53, 55, 48, 53, 48, 55, 48, 48, 53, 55, 57, 53, 48, 55, 48];

const THINK_BPM = 96;
const THINK_BEATS = 48; // 30.0 seconds

export class PerilAudio {
  muted = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private thinkTimer: ReturnType<typeof setTimeout> | null = null;
  private thinkNodes: AudioNode[] = [];

  constructor() {
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  get available(): boolean {
    return this.ctx !== null;
  }

  /** Call from a user gesture; browsers suspend fresh AudioContexts. */
  unlock(): void {
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  dispose(): void {
    this.stopThinkMusic();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
    }
  }

  // ---- One-shots ------------------------------------------------------------

  /** Tiny pitched blip for board fill / category reveals. */
  blip(pitch = 0): void {
    this.tone({ freq: 660 + pitch * 60, dur: 0.07, type: 'square', gain: 0.12 });
  }

  /** Soft click for UI buttons. */
  click(): void {
    this.tone({ freq: 880, dur: 0.04, type: 'triangle', gain: 0.1 });
  }

  /** Buzz-in: punchy saw burst. */
  buzzIn(): void {
    this.tone({ freq: 240, dur: 0.16, type: 'sawtooth', gain: 0.22 });
    this.tone({ freq: 480, dur: 0.08, type: 'square', gain: 0.1, when: 0.01 });
  }

  /** Correct: bright two-note ding. */
  correct(): void {
    this.tone({ freq: 880, dur: 0.12, type: 'sine', gain: 0.2 });
    this.tone({ freq: 1318.5, dur: 0.28, type: 'sine', gain: 0.18, when: 0.11 });
  }

  /** Wrong: low descending razz. */
  wrong(): void {
    this.tone({ freq: 130, dur: 0.35, type: 'sawtooth', gain: 0.2, glideTo: 80 });
    this.tone({ freq: 65, dur: 0.35, type: 'square', gain: 0.12 });
  }

  /** Classic "time's up" beat: three falling beeps. */
  timesUp(): void {
    this.tone({ freq: 660, dur: 0.14, type: 'sine', gain: 0.16 });
    this.tone({ freq: 550, dur: 0.14, type: 'sine', gain: 0.16, when: 0.18 });
    this.tone({ freq: 440, dur: 0.26, type: 'sine', gain: 0.16, when: 0.36 });
  }

  /** Early-buzz lockout zap. */
  lockout(): void {
    this.tone({ freq: 220, dur: 0.08, type: 'square', gain: 0.12, glideTo: 110 });
  }

  /** Daily Double sting: dramatic rising arpeggio with shimmer. */
  dailyDouble(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      this.tone({ freq, dur: 0.5, type: 'sawtooth', gain: 0.12, when: i * 0.09 });
      this.tone({ freq: freq * 2.001, dur: 0.5, type: 'sine', gain: 0.05, when: i * 0.09 });
    });
    this.tone({ freq: 130.8, dur: 1.1, type: 'triangle', gain: 0.16, when: 0 });
  }

  /** Clue reveal swoosh-ish blip. */
  reveal(): void {
    this.tone({ freq: 392, dur: 0.18, type: 'triangle', gain: 0.12, glideTo: 784 });
  }

  /** Filtered-noise applause burst. */
  applause(durationS = 1.6): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 0.6;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.12);
    // Clap flutter: random dips while sustaining.
    for (let i = 0; i < 10; i++) {
      const ft = t + 0.15 + (i * (durationS - 0.4)) / 10;
      gain.gain.linearRampToValueAtTime(0.22 + Math.random() * 0.18, ft);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationS);
    src.connect(band).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + durationS + 0.05);
  }

  /** Big win fanfare (used with applause + confetti). */
  fanfare(): void {
    const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    seq.forEach((freq, i) => {
      this.tone({ freq, dur: i >= 4 ? 0.5 : 0.16, type: 'square', gain: 0.12, when: i * 0.15 });
    });
  }

  // ---- Final PERIL! think music ----------------------------------------------

  /** Starts the original 30s think-music loop. */
  startThinkMusic(): void {
    if (!this.ctx || !this.master || this.thinkTimer) return;
    this.scheduleThinkPass();
  }

  stopThinkMusic(): void {
    if (this.thinkTimer) {
      clearTimeout(this.thinkTimer);
      this.thinkTimer = null;
    }
    for (const node of this.thinkNodes) {
      try {
        (node as OscillatorNode).stop();
      } catch {
        /* already stopped */
      }
      node.disconnect();
    }
    this.thinkNodes = [];
  }

  // ---- Internals --------------------------------------------------------------

  private scheduleThinkPass(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const beat = 60 / THINK_BPM;
    const t0 = ctx.currentTime + 0.05;
    const bus = ctx.createGain();
    bus.gain.value = 0.55;
    bus.connect(this.master);
    this.thinkNodes.push(bus);

    for (const [start, midi, dur] of THINK_MELODY) {
      this.thinkNote(bus, midiHz(midi), t0 + start * beat, dur * beat, 'triangle', 0.14);
    }
    THINK_BASS.forEach((midi, bar) => {
      this.thinkNote(bus, midiHz(midi), t0 + bar * 3 * beat, 2.6 * beat, 'sine', 0.1);
    });

    const loopMs = THINK_BEATS * beat * 1000;
    this.thinkTimer = setTimeout(() => {
      this.thinkTimer = null;
      this.scheduleThinkPass();
    }, loopMs);
  }

  private thinkNote(
    bus: GainNode,
    freq: number,
    when: number,
    dur: number,
    type: OscillatorType,
    peak: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.04);
    gain.gain.setTargetAtTime(peak * 0.7, when + 0.05, dur * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain).connect(bus);
    osc.start(when);
    osc.stop(when + dur + 0.05);
    this.thinkNodes.push(osc, gain);
  }

  private tone(opts: {
    freq: number;
    dur: number;
    type: OscillatorType;
    gain: number;
    when?: number;
    glideTo?: number;
  }): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.when ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.glideTo), t + opts.dur);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(opts.gain, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + opts.dur + 0.05);
  }

  private getNoiseBuffer(): AudioBuffer {
    if (!this.ctx) throw new Error('AudioContext unavailable');
    if (!this.noiseBuffer) {
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }
}
