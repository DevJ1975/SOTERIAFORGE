import { isPlatformBrowser } from '@angular/common';
import { Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import type { SfxId } from './sfx.model';

/** Where the app serves the sounds (see the `assets` globs in the app's project.json). */
export const SFX_BASE_URL = new InjectionToken<string>('SFX_BASE_URL', {
  providedIn: 'root',
  factory: () => 'assets/sfx/',
});

/** Creates the audio element for a sound URL; overridden in tests. */
export const SFX_AUDIO_FACTORY = new InjectionToken<(url: string) => HTMLAudioElement>(
  'SFX_AUDIO_FACTORY',
  { providedIn: 'root', factory: () => (url) => new Audio(url) },
);

const STORAGE_KEY = 'assurance.sfx.muted';
const VOLUME = 0.6;

/**
 * Plays the courseware sound effects. Sound is only ever a supplement to
 * visual/text feedback, never the sole signal, and the learner can mute it.
 *
 * Muted state persists per browser. With no saved choice, sounds start muted
 * for learners who ask for reduced motion, as a conservative default.
 */
@Injectable({ providedIn: 'root' })
export class SfxService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly baseUrl = inject(SFX_BASE_URL);
  private readonly createAudio = inject(SFX_AUDIO_FACTORY);
  private readonly cache = new Map<SfxId, HTMLAudioElement>();

  private readonly mutedState = signal(this.initialMuted());
  /** Whether sounds are currently muted. */
  readonly muted = this.mutedState.asReadonly();

  /** Warms the browser cache so the first play has no network delay. */
  preload(ids: readonly SfxId[]): void {
    if (!this.isBrowser) return;
    for (const id of ids) this.element(id);
  }

  /** Plays a sound. Never throws: autoplay blocks and missing files are ignored. */
  play(id: SfxId): void {
    if (!this.isBrowser || this.mutedState()) return;
    try {
      const audio = this.element(id);
      audio.currentTime = 0;
      void Promise.resolve(audio.play()).catch(() => undefined);
    } catch {
      // Audio is a nicety; a failure must never break the lesson.
    }
  }

  setMuted(muted: boolean): void {
    this.mutedState.set(muted);
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // Storage can be blocked (private mode); the choice then lasts for the session.
    }
  }

  toggle(): void {
    this.setMuted(!this.mutedState());
  }

  private element(id: SfxId): HTMLAudioElement {
    let audio = this.cache.get(id);
    if (!audio) {
      audio = this.createAudio(`${this.baseUrl}${id}.mp3`);
      audio.preload = 'auto';
      audio.volume = VOLUME;
      this.cache.set(id, audio);
    }
    return audio;
  }

  private initialMuted(): boolean {
    if (!this.isBrowser) return true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '1') return true;
      if (saved === '0') return false;
    } catch {
      // fall through to the default
    }
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
