import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { getDoc } from 'firebase/firestore';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { PrincipalStore } from '@forge/auth';
import { FIRESTORE, liveSessionDoc } from '@forge/data-access';
import type { LiveSession } from '@forge/shared';

/**
 * Join page for a single live session. Reads the learner-readable session doc
 * and surfaces a join affordance keyed off `status`:
 *  - `live` + `joinUrl` -> prominent "Open Zoom" button (opens in a new tab);
 *  - `scheduled`        -> start time + "check back when live";
 *  - `ended` + recordingUrl -> "Watch recording".
 * The host `startUrl` is sensitive and is never on this doc, so it is never
 * referenced here.
 */
@Component({
  selector: 'app-join-session',
  imports: [RouterLink, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <a class="back-link" routerLink="/live-sessions">
        <span class="pi pi-arrow-left" aria-hidden="true"></span>
        All live sessions
      </a>

      @if (loading()) {
        <p class="muted">Loading session…</p>
      } @else if (error()) {
        <div class="forge-card load-error">
          <h2>Couldn't load this session</h2>
          <p class="muted">We couldn't reach the session just now. Please try again.</p>
          <p-button label="Retry" icon="pi pi-refresh" (onClick)="load()" />
        </div>
      } @else if (!session()) {
        <div class="forge-card empty">
          <h2>Session not found</h2>
          <p class="muted">This live session doesn't exist or is no longer available.</p>
          <p-button label="Back to live sessions" routerLink="/live-sessions" />
        </div>
      } @else {
        @let s = session()!;
        <article class="forge-card session-detail">
          <div class="detail-head">
            <h1>{{ s.title }}</h1>
            <p-tag [value]="statusLabel(s)" [severity]="statusSeverity(s)" />
          </div>
          @if (s.description) {
            <p class="desc">{{ s.description }}</p>
          }
          <dl class="meta">
            <div>
              <dt>{{ s.status === 'ended' || s.status === 'canceled' ? 'Held' : 'Starts' }}</dt>
              <dd>{{ formatStart(s.scheduledStart) }}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{{ s.durationMin }} min</dd>
            </div>
          </dl>

          <div class="join-zone" role="status">
            @if (s.status === 'live' && s.joinUrl) {
              <p class="join-note">This session is live now.</p>
              <p-button
                label="Open Zoom"
                icon="pi pi-video"
                size="large"
                (onClick)="openJoin(s.joinUrl)"
              />
              @if (s.passcode) {
                <p class="muted passcode">Passcode: <strong>{{ s.passcode }}</strong></p>
              }
            } @else if (s.status === 'scheduled') {
              <p class="join-note">
                This session is scheduled for {{ formatStart(s.scheduledStart) }}.
              </p>
              <p class="muted">Check back here when it goes live to join.</p>
              <p-button label="Join unavailable until live" [disabled]="true" />
            } @else if ((s.status === 'ended' || s.status === 'canceled') && s.recordingUrl) {
              <p class="join-note">This session has ended.</p>
              <a
                class="p-button p-button-lg recording-link"
                [href]="s.recordingUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="pi pi-play-circle" aria-hidden="true"></span>
                Watch recording
              </a>
            } @else {
              <p class="join-note">This session has ended.</p>
              <p class="muted">No recording is available for this session.</p>
            }
          </div>
        </article>
      }
    </div>
  `,
  styles: `
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--forge-text-subtle);
      text-decoration: none;
      margin-bottom: 16px;
    }
    .back-link:hover {
      color: var(--forge-text);
    }
    .muted {
      color: var(--forge-text-subtle);
    }
    .session-detail {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 680px;
    }
    .detail-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .detail-head h1 {
      margin: 0;
    }
    .desc {
      color: var(--forge-text-subtle);
      margin: 0;
    }
    .meta {
      display: flex;
      gap: 32px;
      margin: 0;
    }
    .meta dt {
      color: var(--forge-text-subtle);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .meta dd {
      margin: 2px 0 0;
      font-weight: 600;
    }
    .join-zone {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
      padding-top: 8px;
      border-top: 1px solid var(--forge-border, var(--forge-text-subtle));
    }
    .join-note {
      margin: 0;
      font-weight: 600;
    }
    .passcode {
      margin: 0;
    }
    .recording-link {
      text-decoration: none;
      gap: 8px;
    }
    .empty,
    .load-error {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    }
    .load-error {
      border: 1px solid var(--forge-negative);
    }
  `,
})
export class JoinSessionPage {
  private readonly db = inject(FIRESTORE);
  private readonly principal = inject(PrincipalStore);
  private readonly route = inject(ActivatedRoute);

  /** Route param `:sessionId`. */
  private readonly sessionId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('sessionId') ?? '')),
    { initialValue: '' },
  );

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  private readonly data = signal<LiveSession | undefined>(undefined);

  protected readonly session = computed(() => this.data());

  constructor() {
    // Re-load whenever the route param resolves/changes.
    effect(() => void this.load(this.sessionId()));
  }

  protected async load(sessionId = this.sessionId()): Promise<void> {
    const tenantId = this.principal.tenantId();
    if (!tenantId || !sessionId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    try {
      const snap = await getDoc(liveSessionDoc(this.db, tenantId, sessionId));
      this.data.set(snap.exists() ? snap.data() : undefined);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected openJoin(joinUrl: string): void {
    window.open(joinUrl, '_blank', 'noopener,noreferrer');
  }

  protected statusLabel(session: LiveSession): string {
    switch (session.status) {
      case 'live':
        return 'Live';
      case 'scheduled':
        return 'Scheduled';
      case 'canceled':
        return 'Canceled';
      default:
        return 'Ended';
    }
  }

  protected statusSeverity(session: LiveSession): 'danger' | 'info' | 'secondary' {
    switch (session.status) {
      case 'live':
        return 'danger';
      case 'scheduled':
        return 'info';
      default:
        return 'secondary';
    }
  }

  protected formatStart(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
