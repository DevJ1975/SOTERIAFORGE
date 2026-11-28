import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '@assurance/auth';
import { type ApiScoreCard, GamificationApi } from '@assurance/lms-core';

/**
 * The signed-in learner's profile (name, streak), shared by the Forge shell (top-bar
 * name + streak pill) and the Home screen so the score card is read once per session.
 * The name comes from the signed-in principal (`/api/me`); the streak and activity
 * come from `/api/me/progress`.
 */
@Injectable({ providedIn: 'root' })
export class LearnerProfileStore {
  private readonly auth = inject(AuthService);
  private readonly gamification = inject(GamificationApi);

  private readonly cardState = signal<ApiScoreCard | null>(null);
  private inflight: Promise<ApiScoreCard | null> | null = null;
  private loadedFor = '';

  /** The learner's score card, or `null` until loaded / when signed out. */
  readonly scoreCard = this.cardState.asReadonly();

  readonly displayName = computed(() => this.auth.principal()?.displayName ?? '');

  /** First name for greetings ("Good morning, Marcus."). */
  readonly firstName = computed(() => this.displayName().trim().split(/\s+/)[0] ?? '');

  /** Current streak; `null` until the score card is known (hides the pill). */
  readonly streakDays = computed(() => this.cardState()?.streakDays ?? null);

  /** Loads the score card for the current principal (deduplicated). */
  load(): Promise<ApiScoreCard | null> {
    const uid = this.auth.principal()?.uid;
    if (!uid) return Promise.resolve(null);
    if (this.loadedFor === uid && this.inflight) return this.inflight;
    this.loadedFor = uid;

    this.inflight = this.gamification
      .progress()
      .then((card) => {
        this.cardState.set(card);
        return card;
      })
      .catch((err: unknown) => {
        console.warn('[LearnerProfileStore] Failed to load progress', err);
        this.loadedFor = '';
        this.inflight = null;
        return null;
      });
    return this.inflight;
  }

  /** Clears cached state (call on sign-out). */
  reset(): void {
    this.cardState.set(null);
    this.inflight = null;
    this.loadedFor = '';
  }
}
