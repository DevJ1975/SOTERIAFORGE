import {
  ChangeDetectionStrategy,
  Component,
  type Signal,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { type ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '@assurance/auth';
import { UserMenuComponent } from '@assurance/auth-ui';
import { ModuleCompletionService, QuizSubmissionService } from '@assurance/lms-core';
import { OfflineXapiQueue } from '@assurance/standards';
import { AssuranceOfflineBannerComponent, SfAppShellComponent } from '@assurance/ui';
import type { ForgeRouteData } from './app.routes';
import { LearnerProfileStore } from './services/learner-profile.store';

@Component({
  selector: 'assurance-learner-root',
  standalone: true,
  imports: [RouterOutlet, SfAppShellComponent, AssuranceOfflineBannerComponent, UserMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sf-app-shell
      [bare]="shellMode() === 'none'"
      [variant]="shellMode() === 'dark' ? 'dark' : 'light'"
      [crumbs]="routeData().crumbs ?? []"
      [userName]="profile.displayName()"
      [streakDays]="profile.streakDays()"
      (search)="onSearch($event)"
    >
      <assurance-user-menu sfTopbarEnd variant="compact" redirectTo="/login" />

      <!-- Offline connectivity banner (non-blocking, polite live region) -->
      <assurance-offline-banner [pendingCount]="pendingCount()" />

      <router-outlet />

      <footer class="learner-footer">
        <span>© {{ year }} Soteria Forge</span>
        <span>Powered by Trainovation Technologies, LLC</span>
      </footer>
    </sf-app-shell>
  `,
  styles: [
    `
      .learner-footer {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sf-space-1) var(--sf-space-4);
        justify-content: space-between;
        margin-top: var(--sf-space-10);
        padding-top: var(--sf-space-4);
        border-top: 1px solid var(--sf-line);
        color: var(--sf-ink-2);
        font-size: var(--sf-text-xs);
      }
      :host-context(.sf-shell--dark) .learner-footer {
        border-top-color: var(--sf-dark-line);
        color: var(--sf-dark-text);
      }
    `,
  ],
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly profile = inject(LearnerProfileStore);
  protected readonly year = new Date().getFullYear();

  /** `data` of the deepest active route (crumbs + shell mode). */
  protected readonly routeData: Signal<ForgeRouteData> = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.deepestData()),
    ),
    { initialValue: {} as ForgeRouteData },
  );

  /** 'none' (auth pages), 'dark' (Engage) or 'light'. */
  protected readonly shellMode = computed(() => this.routeData().sfShell ?? 'light');

  /**
   * Total pending offline work surfaced in the offline banner: the sum of the
   * xAPI statement queue, the quiz-submission outbox, and the module-completion
   * outbox. Previously only the xAPI count was shown, so queued quiz attempts
   * and completions were invisible to the learner (FIX-6).
   */
  protected readonly pendingCount: Signal<number>;

  constructor() {
    // Eagerly inject the three offline services (browser only) so their window
    // `online` listeners are registered for the lifetime of the app (automatic
    // flush on reconnect) and aggregate their pending counts for the banner. On
    // the server there is no offline work → constant 0.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const xapi = inject(OfflineXapiQueue).pendingCount;
      const quiz = inject(QuizSubmissionService).pendingCount;
      const completion = inject(ModuleCompletionService).pendingCount;
      this.pendingCount = computed(() => xapi() + quiz() + completion());
    } else {
      this.pendingCount = signal(0).asReadonly();
    }

    // Load the learner's member doc (name + streak for the top bar) once signed
    // in; drop it on sign-out so a shared device never shows the last learner.
    effect(() => {
      if (this.auth.principal()) {
        void this.profile.load();
      } else {
        this.profile.reset();
      }
    });
  }

  protected onSearch(q: string): void {
    void this.router.navigate(['/courses'], { queryParams: { q } });
  }

  private deepestData(): ForgeRouteData {
    let snap: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (snap?.firstChild) snap = snap.firstChild;
    return (snap?.data ?? {}) as ForgeRouteData;
  }
}
