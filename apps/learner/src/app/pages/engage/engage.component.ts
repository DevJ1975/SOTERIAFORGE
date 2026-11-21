import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ForgeSession } from '@assurance/auth';
import { type ApiCohort, GamificationAdminApi } from '@assurance/lms-core';
import { ClassroomTrackComponent } from './classroom-track.component';
import { crewFirst, debriefStage, huddleStage, pageCount, pageOf } from './engage-session.model';
import { EngageSessionStore } from './engage-session.store';
import { EngageService } from './engage.service';
import { SessionActivityComponent } from './session-activity.component';
import { SessionBlockBarComponent } from './session-block-bar.component';
import { SessionCrewComponent } from './session-crew.component';
import { SessionHeatmapComponent } from './session-heatmap.component';
import { SessionHostComponent } from './session-host.component';
import { SessionHuddleComponent } from './session-huddle.component';

@Component({
  selector: 'assurance-engage',
  standalone: true,
  imports: [
    FormsModule,
    ClassroomTrackComponent,
    SessionActivityComponent,
    SessionBlockBarComponent,
    SessionCrewComponent,
    SessionHeatmapComponent,
    SessionHostComponent,
    SessionHuddleComponent,
  ],
  providers: [EngageService, EngageSessionStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="engage" aria-labelledby="engage-heading">
      <header>
        <h1 id="engage-heading">Forge Engage</h1>
        <p>Live video classrooms for your organization.</p>
      </header>
      @if (classroom.error()) {
        <p role="alert" class="error">{{ classroom.error() }}</p>
      }
      @if (notice()) {
        <p role="alert" class="error">{{ notice() }}</p>
      }
      @if (classroom.activeClassroom(); as active) {
        <div class="bar">
          <h2>{{ active.title }}</h2>
          @if (live.live()) {
            <span class="live">Live</span>
          }
          <span class="count">{{ people() }} in room</span>
          <p role="status" class="status">Connection: {{ classroom.state() }}</p>
        </div>
        @if (live.error()) {
          <p role="alert" class="error">{{ live.error() }}</p>
        }
        <div class="controls" role="group" aria-label="Classroom controls">
          <button
            type="button"
            (click)="classroom.toggle('microphone')"
            [disabled]="classroom.busy() || classroom.state() !== 'connected'"
            [attr.aria-pressed]="classroom.microphoneEnabled()"
          >
            {{ classroom.microphoneEnabled() ? 'Mute microphone' : 'Enable microphone' }}
          </button>
          <button
            type="button"
            (click)="classroom.toggle('camera')"
            [disabled]="classroom.busy() || classroom.state() !== 'connected'"
            [attr.aria-pressed]="classroom.cameraEnabled()"
          >
            {{ classroom.cameraEnabled() ? 'Turn camera off' : 'Enable camera' }}
          </button>
          @if (classroom.canScreenShare() && classroom.supportsScreenShare) {
            <button
              type="button"
              (click)="classroom.toggle('screen')"
              [disabled]="classroom.busy() || classroom.state() !== 'connected'"
              [attr.aria-pressed]="classroom.screenShareEnabled()"
            >
              {{ classroom.screenShareEnabled() ? 'Stop sharing' : 'Share screen' }}
            </button>
          }
          @if (live.live() && live.state(); as s) {
            <button
              type="button"
              (click)="live.setHand(!s.me.handRaised)"
              [attr.aria-pressed]="s.me.handRaised"
            >
              {{ s.me.handRaised ? 'Lower hand' : 'Raise hand' }}
            </button>
          }
          @if (classroom.needsAudioStart()) {
            <button type="button" (click)="classroom.startAudio()">Enable classroom audio</button>
          }
          <button type="button" class="leave" (click)="classroom.leave()">Leave classroom</button>
        </div>
        <p>Your camera and microphone are off when you join. Enable them when you are ready.</p>
        @if (classroom.canScreenShare() && !classroom.supportsScreenShare) {
          <p>Screen sharing is unavailable in this browser. Use desktop Chrome over HTTPS.</p>
        }

        <div class="room" [class.room--session]="!!live.state() || session.canAuthor()">
          <div class="main">
            <div class="grid" aria-label="Classroom participants">
              @for (tile of pageTiles(); track tile.id) {
                <article
                  class="tile"
                  [class.is-speaking]="speaking(tile.participantId)"
                  [attr.aria-label]="tile.name"
                >
                  <div class="video">
                    @if (tile.video) {
                      <assurance-classroom-track [track]="tile.video" [muted]="true" />
                    } @else {
                      <span>Camera off</span>
                    }
                  </div>
                  @if (tile.audio) {
                    <assurance-classroom-track [track]="tile.audio" />
                  }
                  <p>
                    {{ tile.name }}
                    @if (tile.staff && !tile.screen) {
                      <span class="tag">Host</span>
                    }
                    @if (speaking(tile.participantId)) {
                      <span class="tag">Speaking</span>
                    }
                  </p>
                </article>
              }
            </div>
            <!-- Tiles on other pages keep their audio: only their video is paged out. -->
            @for (tile of offPageAudio(); track tile.id) {
              <assurance-classroom-track [track]="tile.audio" />
            }
            @if (pages() > 1) {
              <nav class="pager" aria-label="Participant pages">
                <button type="button" [disabled]="page() <= 1" (click)="turn(-1)">
                  Previous page
                </button>
                <span role="status">Page {{ page() }} of {{ pages() }}</span>
                <button type="button" [disabled]="page() >= pages()" (click)="turn(1)">
                  Next page
                </button>
              </nav>
              <p class="hint">Hosts are shown first, then your crew, then the rest of the class.</p>
            }

            @if (live.state(); as s) {
              @if (s.status === 'ended') {
                <p class="pane" role="status">This session has ended. You can stay to talk.</p>
              }
              @if (s.activity; as activity) {
                <assurance-session-activity
                  [activity]="activity"
                  [now]="live.now()"
                  [busy]="live.busy()"
                  (respond)="live.respond(activity.id, $event)"
                />
              }
              @if (s.status === 'live' && s.huddle && showHuddle()) {
                <assurance-session-huddle [huddle]="s.huddle" (save)="live.saveHuddle($event)" />
              }
              @if (showHeatmap()) {
                @if (live.heatmap(); as heat) {
                  <assurance-session-heatmap [heatmap]="heat" />
                }
              }
            }
          </div>

          @if (live.state() || session.canAuthor()) {
            <aside class="side" aria-label="Live session">
              @if (live.state(); as s) {
                @if (s.status === 'live') {
                  <assurance-session-block-bar [state]="s" [now]="live.now()" />
                }
                @if (s.crew; as crew) {
                  <assurance-session-crew [crew]="crew" />
                }
              }
              @if (session.canAuthor() || live.isHost()) {
                @if (live.state()) {
                  <button
                    type="button"
                    [attr.aria-pressed]="hostHeatmap()"
                    (click)="hostHeatmap.set(!hostHeatmap())"
                  >
                    {{ hostHeatmap() ? 'Hide heat map' : 'Show heat map' }}
                  </button>
                }
                <assurance-session-host />
              }
            </aside>
          }
        </div>
      } @else {
        @if (session.canAuthor()) {
          <form (ngSubmit)="create()" class="create">
            <label for="classroom-title">New classroom title</label>
            <input
              id="classroom-title"
              name="title"
              [(ngModel)]="title"
              required
              maxlength="120"
              [disabled]="classroom.busy()"
            />
            @if (cohorts(); as list) {
              <label for="classroom-cohort">Who can join</label>
              <select id="classroom-cohort" name="cohort" [(ngModel)]="cohortId">
                <option value="">Everyone in this organization</option>
                @for (cohort of list; track cohort.id) {
                  <option [value]="cohort.id">{{ cohort.name }} only</option>
                }
              </select>
            } @else {
              <button type="button" (click)="loadCohorts()" [disabled]="cohortsLoading()">
                Limit to a cohort…
              </button>
            }
            <button type="submit" [disabled]="classroom.busy() || !title().trim()">
              Create classroom
            </button>
          </form>
          @if (cohortsError()) {
            <p role="alert" class="error">{{ cohortsError() }}</p>
          }
        }
        <p>
          Classrooms are open to active members of this organization unless they are limited to a
          cohort. Up to 21 participants per room.
        </p>
        <p>Optimized for desktop Chrome. Allow camera and microphone access when prompted.</p>
        <button
          type="button"
          (click)="classroom.load()"
          [disabled]="classroom.loading() || classroom.busy()"
        >
          Refresh classrooms
        </button>
        @if (classroom.loading()) {
          <p role="status">Loading classrooms...</p>
        } @else {
          <ul class="rooms">
            @for (room of classroom.classrooms(); track room.id) {
              <li>
                <h2>
                  {{ room.title }}
                  @if (room.liveSessionId) {
                    <span class="live">Live</span>
                  }
                </h2>
                <p class="hint">
                  {{
                    room.cohortName ? room.cohortName + ' cohort' : 'Everyone in this organization'
                  }}
                </p>
                <button type="button" (click)="join(room)" [disabled]="classroom.busy()">
                  Join {{ room.title }}
                </button>
              </li>
            } @empty {
              <li>No classrooms yet. Your instructor can create one here.</li>
            }
          </ul>
        }
        @if (classroom.state() === 'connecting') {
          <p role="status">Connecting to classroom...</p>
          <button type="button" (click)="classroom.leave()">Cancel connection</button>
        }
      }
    </section>
  `,
  styles: [
    `
      .engage {
        color: var(--sf-dark-text, #c9ced6);
        max-width: 96rem;
        margin: auto;
      }
      h1,
      h2 {
        color: #fff;
      }
      header,
      .create,
      .controls,
      .rooms {
        margin-bottom: 1.5rem;
      }
      .controls,
      .create,
      .bar,
      .pager {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
      }
      .bar h2,
      .bar .status {
        margin: 0;
      }
      .bar {
        margin-bottom: 1rem;
      }
      .live {
        padding: 3px 9px;
        border-radius: 6px;
        background: var(--sf-danger, #c0392b);
        color: #fff;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        vertical-align: middle;
      }
      .count,
      .tag {
        padding: 3px 9px;
        border-radius: 6px;
        border: 1px solid var(--sf-dark-line, #2b2f36);
        font-size: 0.75rem;
      }
      .tag {
        margin-left: 6px;
        color: #fff;
      }
      .hint {
        margin: 0.5rem 0;
        font-size: 0.85rem;
      }
      button,
      input,
      select {
        font: inherit;
        min-height: 44px;
        padding: 0.65rem 0.9rem;
        border-radius: var(--sf-radius-md, 12px);
      }
      button {
        cursor: pointer;
        border: 1px solid var(--sf-dark-line, #2b2f36);
        color: #fff;
        background: var(--sf-dark-pane, #1f2228);
        font-weight: 600;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      button[aria-pressed='true'] {
        border-color: var(--sf-success, #1f8a5b);
        box-shadow: inset 0 0 0 1px var(--sf-success, #1f8a5b);
      }
      button[type='submit'] {
        background: var(--sf-ember, #dc481b);
        border-color: var(--sf-ember, #dc481b);
      }
      button.leave {
        background: var(--sf-danger, #c0392b);
        border-color: var(--sf-danger, #c0392b);
      }
      input,
      select {
        min-width: 0;
        border: 1px solid var(--sf-dark-line, #2b2f36);
        background: var(--sf-dark-inset, #15171b);
        color: #fff;
      }
      .rooms {
        list-style: none;
        padding: 0;
        display: grid;
        gap: 1rem;
      }
      .rooms li,
      .tile,
      .pane {
        border: 1px solid var(--sf-dark-line, #2b2f36);
        border-radius: var(--sf-radius-lg, 14px);
        background: var(--sf-dark-pane, #1f2228);
        padding: 1rem;
      }
      .room {
        display: grid;
        gap: 1rem;
      }
      .room--session {
        grid-template-columns: minmax(0, 1.9fr) minmax(18rem, 1fr);
        align-items: start;
      }
      .main,
      .side {
        display: grid;
        gap: 1rem;
        min-width: 0;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
        gap: 1rem;
      }
      .tile.is-speaking {
        box-shadow: 0 0 0 3px var(--sf-success, #1f8a5b);
      }
      .video {
        aspect-ratio: 16 / 9;
        background: var(--sf-dark-inset, #15171b);
        display: grid;
        place-items: center;
      }
      .tile p {
        margin-bottom: 0;
        color: #fff;
      }
      .error {
        border-left: 4px solid var(--sf-danger, #c0392b);
        border-radius: 6px;
        padding: 1rem;
        background: var(--sf-dark-inset, #15171b);
        color: #fff;
      }
      :is(button, input, select):focus-visible {
        outline: 3px solid rgba(220, 72, 27, 0.75);
        outline-offset: 3px;
      }
      @media (max-width: 64rem) {
        .room--session {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class EngageComponent implements OnInit {
  protected readonly classroom = inject(EngageService);
  protected readonly live = inject(EngageSessionStore);
  protected readonly session = inject(ForgeSession);
  private readonly cohortApi = inject(GamificationAdminApi);
  // A signal, not a plain field: clearing it after an async create must repaint this OnPush view.
  protected readonly title = signal('');
  protected readonly cohortId = signal('');
  protected readonly cohorts = signal<ApiCohort[] | null>(null);
  protected readonly cohortsLoading = signal(false);
  protected readonly cohortsError = signal('');
  /** Why the learner is back at the list (e.g. removed by the host). */
  protected readonly notice = signal('');
  protected readonly page = signal(1);
  protected readonly hostHeatmap = signal(false);
  private attachedTo = '';

  /** Hosts first, then my crew, then everyone else; speaking never reorders. */
  private readonly ordered = computed(() =>
    crewFirst(this.classroom.tiles(), this.live.state()?.crewMemberIds ?? []),
  );
  protected readonly pages = computed(() => pageCount(this.ordered().length));
  protected readonly pageTiles = computed(() => pageOf(this.ordered(), this.page()));
  protected readonly offPageAudio = computed(() => {
    const shown = new Set(this.pageTiles().map((tile) => tile.id));
    return this.ordered().filter((tile) => tile.audio && !shown.has(tile.id));
  });
  protected readonly people = computed(
    () => this.classroom.tiles().filter((tile) => !tile.screen).length,
  );

  protected readonly showHuddle = computed(() => {
    const state = this.live.state();
    return !!state && huddleStage(state);
  });
  protected readonly showHeatmap = computed(() => {
    const state = this.live.state();
    if (!state) return false;
    return state.status === 'ended' || debriefStage(state) || this.hostHeatmap();
  });

  constructor() {
    // Follow the session of the classroom we are connected to; stop when we leave.
    effect(() => {
      const active = this.classroom.activeClassroom();
      const connected = this.classroom.state() === 'connected';
      untracked(() => {
        if (!active) {
          if (this.attachedTo) this.live.detach();
          this.attachedTo = '';
          this.page.set(1);
          this.hostHeatmap.set(false);
        } else if (connected && this.attachedTo !== active.id) {
          this.attachedTo = active.id;
          this.live.attach(active.id, this.classroom.sessionId());
        }
      });
    });
    effect(() => {
      const ping = this.classroom.sessionPing();
      if (ping) untracked(() => this.live.ping(ping));
    });
    // Removed by the host: drop the media connection too, and say why.
    effect(() => {
      if (this.live.state()?.me.removed) {
        untracked(() => {
          this.notice.set('The host removed you from this session.');
          void this.classroom.leave();
        });
      }
    });
    // Results are fetched when they become visible, and again when the state moves on.
    effect(() => {
      const wanted = this.showHeatmap();
      const version = this.live.state()?.version;
      if (wanted && version !== undefined) untracked(() => void this.live.loadHeatmap());
    });
    // Fewer tiles (someone left) can leave the current page empty.
    effect(() => {
      const pages = this.pages();
      untracked(() => {
        if (this.page() > pages) this.page.set(pages);
      });
    });
  }

  ngOnInit(): void {
    void this.classroom.load();
  }

  protected speaking(participantId: string): boolean {
    return this.classroom.speakingIds().has(participantId);
  }

  protected turn(by: number): void {
    this.page.update((page) => Math.min(this.pages(), Math.max(1, page + by)));
  }

  protected join(room: Parameters<EngageService['join']>[0]): void {
    this.notice.set('');
    void this.classroom.join(room);
  }

  protected async loadCohorts(): Promise<void> {
    this.cohortsLoading.set(true);
    this.cohortsError.set('');
    try {
      this.cohorts.set(await this.cohortApi.cohorts());
    } catch {
      this.cohortsError.set('Cohorts could not be loaded. The classroom will be open to everyone.');
    } finally {
      this.cohortsLoading.set(false);
    }
  }

  protected async create(): Promise<void> {
    await this.classroom.create(this.title(), this.cohortId() || null);
    if (!this.classroom.error()) {
      this.title.set('');
      this.cohortId.set('');
    }
  }
}
