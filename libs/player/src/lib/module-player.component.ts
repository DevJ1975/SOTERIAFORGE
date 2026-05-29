import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Module } from '@forge/shared';
import { EnrollmentService } from '@forge/lms-core';
import { ScormPlayerComponent, Cmi5LauncherComponent } from '@forge/standards';
import { PlayerProgressService, type PlayerContext } from './player-progress.service';
import { VideoPlayerComponent } from './video-player.component';
import { QuizPlayerComponent } from './quiz-player.component';
import { GamePlayerComponent } from './game-player.component';

const HOME_PAGE = 'https://soteriaforge.com';

/**
 * Generate a UUID v4 using `crypto.randomUUID` when available (browser /
 * Node ≥ 14.17), falling back to a time + Math.random composite for
 * environments such as jsdom that do not expose the Web Crypto API.
 */
function _generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: RFC 4122 section 4.4 — time-seeded random UUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Component({
  selector: 'forge-module-player',
  standalone: true,
  imports: [
    VideoPlayerComponent,
    ScormPlayerComponent,
    Cmi5LauncherComponent,
    QuizPlayerComponent,
    GamePlayerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (module().contentType) {
      @case ('video') {
        @defer {
          @if (videoUrl(); as vurl) {
            <forge-video-player
              [url]="vurl"
              [title]="module().title"
              (progress)="onProgress($event)"
              (completed)="onCompleted()"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No video URL configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading video player…</div>
        }
      }
      @case ('scorm') {
        @defer {
          @if (contentUrl(); as url) {
            <forge-scorm-player
              [launchUrl]="url"
              [scormVersion]="'2004'"
              (commit)="onScormCommit($event)"
              (completed)="onScormCompleted($event)"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No SCORM URL configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading SCORM player…</div>
        }
      }
      @case ('cmi5') {
        @defer {
          @if (contentUrl(); as url) {
            <forge-cmi5-launcher
              [auUrl]="url"
              [endpoint]="''"
              [fetch]="''"
              [actor]="cmi5Actor()"
              [registration]="cmi5Registration()"
              [activityId]="cmi5ActivityId()"
              (completed)="onCmi5Completed($event)"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No cmi5 URL configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading cmi5 player…</div>
        }
      }
      @case ('unity') {
        @defer {
          @if (contentUrl(); as url) {
            <forge-cmi5-launcher
              [auUrl]="url"
              [endpoint]="''"
              [fetch]="''"
              [actor]="cmi5Actor()"
              [registration]="cmi5Registration()"
              [activityId]="cmi5ActivityId()"
              (completed)="onCmi5Completed($event)"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No Unity URL configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading Unity player…</div>
        }
      }
      @case ('quiz') {
        @defer {
          @if (module().assetRef; as quizId) {
            <forge-quiz-player
              [quizId]="quizId"
              [courseId]="courseId()"
              [moduleId]="module().id"
              [tenantId]="tenantId()"
              [uid]="uid()"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No quiz configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading quiz player…</div>
        }
      }
      @case ('game') {
        @defer {
          @if (module().assetRef; as gameId) {
            <forge-game-player
              [gameId]="gameId"
              [courseId]="courseId()"
              [moduleId]="module().id"
              [tenantId]="tenantId()"
              [uid]="uid()"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No game configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading game player…</div>
        }
      }
      @default {
        <div class="forge-module-player__placeholder">
          <p>Unknown content type: {{ module().contentType }}</p>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .forge-module-player__placeholder,
      .forge-module-player__loading,
      .forge-module-player__no-url {
        padding: 2rem;
        border: 2px dashed var(--forge-border, #ccc);
        border-radius: 0.5rem;
        text-align: center;
        color: var(--forge-text-muted, #666);
      }
    `,
  ],
})
export class ModulePlayerComponent {
  readonly module = input.required<Module>();
  readonly courseId = input.required<string>();
  readonly tenantId = input.required<string>();
  readonly uid = input.required<string>();

  private readonly playerProgress = inject(PlayerProgressService);
  private readonly enrollmentService = inject(EnrollmentService);

  /** URL for video modules. */
  readonly videoUrl = computed(() => this.module().externalUrl ?? this.module().assetRef);

  /** URL for SCORM / cmi5 / Unity modules. */
  readonly contentUrl = computed(() => this.module().externalUrl ?? this.module().assetRef);

  /** JSON-serialised xAPI Actor for cmi5 / Unity launches. */
  readonly cmi5Actor = computed(() =>
    JSON.stringify({
      objectType: 'Agent',
      account: { homePage: HOME_PAGE, name: this.uid() },
    }),
  );

  /**
   * A stable registration UUID per module session.
   * Generated once per component instance so the value is stable for the
   * lifetime of the player. Falls back to a timestamp-based pseudo-UUID when
   * `crypto.randomUUID` is unavailable (e.g. jsdom test environment).
   */
  private readonly _registration: string = _generateUUID();
  readonly cmi5Registration = computed(() => this._registration);

  /** Activity IRI for cmi5 / Unity AUs — identifies this module globally. */
  readonly cmi5ActivityId = computed(
    () =>
      `${HOME_PAGE}/tenants/${this.tenantId()}/courses/${this.courseId()}/modules/${this.module().id}`,
  );

  private get ctx(): PlayerContext {
    return {
      tenantId: this.tenantId(),
      courseId: this.courseId(),
      module: this.module(),
      uid: this.uid(),
    };
  }

  // ---------------------------------------------------------------------------
  // Video event handlers
  // ---------------------------------------------------------------------------

  onProgress(pct: number): void {
    void this.playerProgress.recordProgress(this.ctx, pct);
  }

  onCompleted(): void {
    void this.playerProgress.recordCompletion(this.ctx);
  }

  // ---------------------------------------------------------------------------
  // SCORM event handlers
  // ---------------------------------------------------------------------------

  onScormCommit(cmi: Record<string, unknown>): void {
    void this.enrollmentService.saveCmi(
      this.tenantId(),
      this.courseId(),
      this.uid(),
      this.module().id,
      cmi,
    );
  }

  onScormCompleted(event: { completed: boolean; score?: number }): void {
    if (event.completed) {
      void this.playerProgress.recordCompletion(this.ctx, event.score);
    }
  }

  // ---------------------------------------------------------------------------
  // cmi5 / Unity event handlers
  // ---------------------------------------------------------------------------

  onCmi5Completed(event: { completed: boolean }): void {
    if (event.completed) {
      void this.playerProgress.recordCompletion(this.ctx);
    }
  }
}
