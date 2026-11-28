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
import { SfxToggleComponent } from '@assurance/sfx';
import { OfflineXapiQueue } from '@assurance/standards';
import { AssuranceOfflineBannerComponent, SfAppShellComponent } from '@assurance/ui';
import type { ForgeRouteData } from './app.routes';
import { LearnerProfileStore } from './services/learner-profile.store';

@Component({
  selector: 'assurance-learner-root',
  standalone: true,
  imports: [
    RouterOutlet,
    SfAppShellComponent,
    AssuranceOfflineBannerComponent,
    SfxToggleComponent,
    UserMenuComponent,
  ],
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
      <assurance-sfx-toggle sfTopbarEnd />
      <assurance-user-menu sfTopbarEnd variant="compact" redirectTo="/login" />

      <!-- Offline connectivity banner (non-blocking, polite live region) -->
      <assurance-offline-banner [pendingCount]="pendingCount()" />

      <router-outlet />

      <footer class="learner-footer" [class.learner-footer--dark]="shellMode() === 'dark'">
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
      .learner-footer--dark {
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
   * Pending offline work surfaced in the offline banner: the xAPI statement queue.
   */
  protected readonly pendingCount: Signal<number>;

  constructor() {
    // Eagerly inject the offline queue (browser only) so its window `online` listener is
    // registered for the lifetime of the app (automatic flush on reconnect). On the server
    // there is no offline work -> constant 0.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.pendingCount = inject(OfflineXapiQueue).pendingCount;
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
