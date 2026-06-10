/**
 * Hazard Hunter — WebAudio sound synthesis. No asset files, no network.
 * Gracefully degrades to silence when AudioContext is unavailable (jsdom, SSR).
 */

type CtxCtor = typeof AudioContext;

function resolveAudioContext(): CtxCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: CtxCtor;
    webkitAudioContext?: CtxCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  constructor() {
    const Ctor = resolveAudioContext();
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

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  /** Browsers suspend contexts until a user gesture — call this on first interaction. */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  dispose(): void {
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
    this.master = null;
  }

  /** Soft UI tick. */
  click(): void {
    this.tone({ freq: 660, dur: 0.06, type: 'triangle', gain: 0.25 });
    this.tone({ freq: 1320, dur: 0.04, type: 'sine', gain: 0.1, delay: 0.01 });
  }

  /** Bright ascending arpeggio — hazard found. */
  success(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) =>
      this.tone({
        freq,
        dur: 0.22,
        type: 'triangle',
        gain: 0.28,
        delay: i * 0.07,
      }),
    );
    this.tone({ freq: 1568, dur: 0.4, type: 'sine', gain: 0.12, delay: 0.3 });
  }

  /** Dull double buzz — wrong inspection. */
  error(): void {
    this.tone({ freq: 165, dur: 0.12, type: 'sawtooth', gain: 0.22 });
    this.tone({
      freq: 124,
      dur: 0.18,
      type: 'sawtooth',
      gain: 0.22,
      delay: 0.14,
    });
  }

  /** Two-tone industrial alarm — incident report. */
  alarm(): void {
    for (let i = 0; i < 3; i++) {
      this.tone({
        freq: 740,
        dur: 0.16,
        type: 'square',
        gain: 0.14,
        delay: i * 0.36,
      });
      this.tone({
        freq: 554,
        dur: 0.16,
        type: 'square',
        gain: 0.14,
        delay: i * 0.36 + 0.18,
      });
    }
  }

  /** Level-clear fanfare. */
  fanfare(): void {
    const seq: Array<[number, number, number]> = [
      [392, 0, 0.18], // G4
      [523.25, 0.16, 0.18], // C5
      [659.25, 0.32, 0.18], // E5
      [783.99, 0.48, 0.42], // G5
      [659.25, 0.78, 0.14], // E5
      [783.99, 0.92, 0.65], // G5
    ];
    for (const [freq, delay, dur] of seq) {
      this.tone({ freq, dur, type: 'triangle', gain: 0.3, delay });
      this.tone({ freq: freq / 2, dur, type: 'sine', gain: 0.16, delay });
    }
  }

  private tone(opts: {
    freq: number;
    dur: number;
    type: OscillatorType;
    gain: number;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + (opts.delay ?? 0);
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = opts.type;
      osc.frequency.setValueAtTime(opts.freq, t0);
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(opts.gain, t0 + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
      osc.connect(env);
      env.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + opts.dur + 0.05);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    } catch {
      // Audio is decorative — never let it break the game.
    }
  }
}
