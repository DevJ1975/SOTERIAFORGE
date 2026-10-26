import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { AuthService, TenantService } from '@assurance/auth';
import { MemberRepository } from '@assurance/data-access';
import type { Member } from '@assurance/shared';

/**
 * Signed-in learner's member profile (name, XP, streak, earned badges), shared
 * by the Forge shell (top-bar name + streak pill) and the Home screen so the
 * member doc is read once per session.
 *
 * `MemberRepository` is resolved lazily on the first `load()` so that merely
 * rendering the shell (e.g. on the login page) never touches Firestore.
 */
@Injectable({ providedIn: 'root' })
export class LearnerProfileStore {
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantService);
  private readonly injector = inject(Injector);

  private readonly memberState = signal<Member | null>(null);
  private inflight: Promise<Member | null> | null = null;
  private loadedKey = '';

  /** The member doc, or `null` until loaded / when signed out. */
  readonly member = this.memberState.asReadonly();

  /** Best available display name: member doc, then auth principal. */
  readonly displayName = computed(
    () => this.memberState()?.displayName || this.auth.principal()?.displayName || '',
  );

  /** First name for greetings ("Good morning, Marcus."). */
  readonly firstName = computed(() => this.displayName().trim().split(/\s+/)[0] ?? '');

  /** Current streak; `null` until the member doc is known (hides the pill). */
  readonly streakDays = computed(() => this.memberState()?.streakDays ?? null);

  /** Loads the member doc for the current principal + tenant (deduplicated). */
  load(): Promise<Member | null> {
    const uid = this.auth.principal()?.uid;
    const tenantId = this.tenant.tenantId();
    if (!uid || !tenantId) return Promise.resolve(null);

    const key = `${tenantId}/${uid}`;
    if (this.loadedKey === key && this.inflight) return this.inflight;
    this.loadedKey = key;

    this.inflight = this.injector
      .get(MemberRepository)
      .getById(tenantId, uid)
      .then((m) => {
        this.memberState.set(m ?? null);
        return m ?? null;
      })
      .catch((err: unknown) => {
        console.warn('[LearnerProfileStore] Failed to load member', err);
        this.loadedKey = '';
        this.inflight = null;
        return null;
      });
    return this.inflight;
  }

  /** Clears cached state (call on sign-out). */
  reset(): void {
    this.memberState.set(null);
    this.inflight = null;
    this.loadedKey = '';
  }
}
