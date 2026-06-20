import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getDocs } from 'firebase/firestore';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { PrincipalStore } from '@forge/auth';
import { FIRESTORE, liveSessionsCol } from '@forge/data-access';
import type { LiveSession } from '@forge/shared';

/**
 * Live sessions list: every Zoom session for the principal's tenant, grouped
 * into Live now / Upcoming / Past. Mirrors the catalog page idiom (signals +
 * computed, OnPush, PrimeNG, design tokens). The host `startUrl` is never on
 * the learner-readable doc, so it is never referenced here.
 */
@Component({
  selector: 'app-live-sessions',
  imports: [RouterLink, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <header class="page-head">
        <h1>Live sessions</h1>
        <p>Join live Zoom webinars and Q&amp;A, and catch up on past recordings.</p>
      </header>

      @if (loading()) {
        <p class="muted">Loading live sessions…</p>
      } @else if (error()) {
        <div class="forge-card load-error">
          <h2>Couldn't load live sessions</h2>
          <p class="muted">We couldn't reach the live sessions just now. Please try again.</p>
          <p-button label="Retry" icon="pi pi-refresh" (onClick)="load()" />
        </div>
      } @else if (sessions().length === 0) {
        <p class="muted">No live sessions are scheduled yet.</p>
      } @else {
        @if (liveNow().length) {
          <section aria-labelledby="live-now-heading">
            <h2 id="live-now-heading">Live now</h2>
            <div class="card-grid">
              @for (session of liveNow(); track session.id) {
                <article class="forge-card session-card">
                  <div class="session-top">
                    <h3>{{ session.title }}</h3>
                    <p-tag value="Live" severity="danger" />
                  </div>
                  @if (session.description) {
                    <p class="desc">{{ session.description }}</p>
                  }
                  <dl class="meta">
                    <div>
                      <dt>Started</dt>
                      <dd>{{ formatStart(session.scheduledStart) }}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{{ session.durationMin }} min</dd>
                    </div>
                  </dl>
                  <p-button
                    label="Join"
                    icon="pi pi-video"
                    [routerLink]="['/live-sessions', session.id, 'join']"
                    styleClass="w-full"
                  />
                </article>
              }
            </div>
          </section>
        }

        @if (upcoming().length) {
          <section aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading">Upcoming</h2>
            <div class="card-grid">
              @for (session of upcoming(); track session.id) {
                <article class="forge-card session-card">
                  <div class="session-top">
                    <h3>{{ session.title }}</h3>
                    <p-tag value="Scheduled" severity="info" />
                  </div>
                  @if (session.description) {
                    <p class="desc">{{ session.description }}</p>
                  }
                  <dl class="meta">
                    <div>
                      <dt>Starts</dt>
                      <dd>{{ formatStart(session.scheduledStart) }}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{{ session.durationMin }} min</dd>
                    </div>
                  </dl>
                  <p-button
                    label="Join"
                    severity="secondary"
                    icon="pi pi-calendar"
                    [routerLink]="['/live-sessions', session.id, 'join']"
                    styleClass="w-full"
                  />
                </article>
              }
            </div>
          </section>
        }

        @if (past().length) {
          <section aria-labelledby="past-heading">
            <h2 id="past-heading">Past</h2>
            <div class="card-grid">
              @for (session of past(); track session.id) {
                <article class="forge-card session-card past">
                  <div class="session-top">
                    <h3>{{ session.title }}</h3>
                    <p-tag
                      [value]="session.status === 'canceled' ? 'Canceled' : 'Ended'"
                      severity="secondary"
                    />
                  </div>
                  @if (session.description) {
                    <p class="desc">{{ session.description }}</p>
                  }
                  <dl class="meta">
                    <div>
                      <dt>Held</dt>
                      <dd>{{ formatStart(session.scheduledStart) }}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{{ session.durationMin }} min</dd>
                    </div>
                  </dl>
                  @if (session.recordingUrl) {
                    <a
                      class="p-button p-button-secondary recording-link"
                      [href]="session.recordingUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span class="pi pi-play-circle" aria-hidden="true"></span>
                      View recording
                    </a>
                  } @else {
                    <p class="muted no-recording">No recording available.</p>
                  }
                </article>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .page-head {
      margin-bottom: 24px;
    }
    .page-head p,
    .muted {
      color: var(--forge-text-subtle);
      margin: 4px 0 0;
    }
    section {
      margin-bottom: 32px;
    }
    section h2 {
      margin-bottom: 16px;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
    }
    .session-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .session-card.past {
      opacity: 0.92;
    }
    .session-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .session-top h3 {
      margin: 0;
    }
    .desc {
      color: var(--forge-text-subtle);
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .meta {
      display: flex;
      gap: 24px;
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
    .recording-link {
      align-self: flex-start;
      text-decoration: none;
      gap: 8px;
    }
    .no-recording {
      margin: 0;
    }
    .load-error {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
      border: 1px solid var(--forge-negative);
    }
  `,
})
export class LiveSessionsPage {
  private readonly db = inject(FIRESTORE);
  private readonly principal = inject(PrincipalStore);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  private readonly data = signal<LiveSession[]>([]);

  protected readonly sessions = computed(() => this.data());

  /** Scheduled sessions whose start is still in the future, soonest first. */
  protected readonly upcoming = computed(() => {
    const now = Date.now();
    return this.data()
      .filter((s) => s.status === 'scheduled' && Date.parse(s.scheduledStart) > now)
      .sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart));
  });

  /** Sessions currently in progress. */
  protected readonly liveNow = computed(() =>
    this.data()
      .filter((s) => s.status === 'live')
      .sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart)),
  );

  /** Ended or canceled sessions, most recent first. */
  protected readonly past = computed(() =>
    this.data()
      .filter((s) => s.status === 'ended' || s.status === 'canceled')
      .sort((a, b) => Date.parse(b.scheduledStart) - Date.parse(a.scheduledStart)),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    const tenantId = this.principal.tenantId();
    if (!tenantId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    try {
      const snap = await getDocs(liveSessionsCol(this.db, tenantId));
      this.data.set(snap.docs.map((d) => d.data()));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
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
