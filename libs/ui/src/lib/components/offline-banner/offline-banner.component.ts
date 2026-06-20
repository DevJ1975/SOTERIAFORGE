import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ConnectivityService } from '../../connectivity.service';

/**
 * AssuranceOfflineBannerComponent — a non-blocking connectivity banner (MO-04).
 *
 * Renders only while {@link ConnectivityService} reports offline. It is a polite
 * live region (`role="status"`, `aria-live="polite"`) so screen readers announce
 * the state change without stealing focus, and it never blocks interaction with
 * the page beneath it.
 *
 * An optional `pendingCount` (e.g. the offline xAPI queue size) is surfaced when
 * greater than zero. It is an input rather than an injected dependency so this
 * UI-layer component does not depend on feature libraries (Nx boundaries).
 *
 * @example
 * <assurance-offline-banner [pendingCount]="queue.pendingCount()" />
 */
@Component({
  selector: 'assurance-offline-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (offline()) {
      <div class="assurance-offline-banner" role="status" aria-live="polite">
        <span class="assurance-offline-banner__dot" aria-hidden="true"></span>
        <span class="assurance-offline-banner__text">
          You're offline — showing saved content. Changes will sync when you reconnect.
          @if (pendingCount() > 0) {
            <strong class="assurance-offline-banner__pending">
              ({{ pendingCount() }} update{{ pendingCount() === 1 ? '' : 's' }} pending)
            </strong>
          }
        </span>
      </div>
    }
  `,
  styles: [
    `
      .assurance-offline-banner {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: var(--assurance-warning-bg, #92400e);
        color: #fff;
        font-size: 0.875rem;
        line-height: 1.3;
      }
      .assurance-offline-banner__dot {
        flex: 0 0 auto;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: #fbbf24;
      }
      .assurance-offline-banner__pending {
        margin-left: 0.25rem;
        font-weight: 700;
      }
    `,
  ],
})
export class AssuranceOfflineBannerComponent {
  private readonly connectivity = inject(ConnectivityService);

  /** Optional count of queued offline changes awaiting sync. */
  readonly pendingCount = input<number>(0);

  protected readonly offline = computed(() => !this.connectivity.online());
}
