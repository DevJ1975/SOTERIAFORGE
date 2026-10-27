import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LearningApi,
  apiErrorMessage,
  type ApiCompletion,
  type ApiCourseOutline,
  type ApiLesson,
  type ApiLessonSummary,
} from '@assurance/lms-core';
import { SfIconComponent } from '@assurance/ui';
import { KnowledgeCheckComponent } from './knowledge-check.component';

const VIDEO_FILE = /\.(mp4|webm|ogg|m4v)(\?|#|$)/i;
const HTTP_URL = /^https?:\/\//i;

/** Lesson screen: label, framework tags, content, key points and the knowledge check. */
@Component({
  selector: 'assurance-lesson',
  standalone: true,
  imports: [RouterLink, SfIconComponent, KnowledgeCheckComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="ls" aria-labelledby="ls-title">
      <a class="sf-btn sf-btn--ghost sf-btn--sm ls__back" [routerLink]="['/courses', courseId()]">
        Back to course
      </a>

      <div class="ls__status" role="status" aria-live="polite">
        @if (loading()) {
          <p class="sf-sub">Loading lesson…</p>
        }
      </div>

      @if (loading()) {
        <!-- status above announces loading -->
      } @else if (error()) {
        <div class="sf-card" role="alert">
          <p class="ls__error">{{ error() }}</p>
          <button type="button" class="sf-btn sf-btn--secondary" (click)="load()">Retry</button>
        </div>
      } @else if (lesson(); as l) {
        <header class="ls__head">
          <p class="sf-tag sf-tag--ember ls__label">{{ label() }}</p>
          <h1 class="sf-h1" id="ls-title" tabindex="-1">{{ l.title }}</h1>
          <div class="ls__meta">
            @for (t of l.frameworkTags; track t) {
              <span class="sf-chip">{{ t }}</span>
            }
            @if (l.estimatedMinutes) {
              <span class="sf-sub ls__time">
                <sf-icon name="clock" size="sm" /> About {{ l.estimatedMinutes }} min
              </span>
            }
          </div>
        </header>

        <section class="sf-card" aria-label="Lesson content">
          @switch (l.contentType) {
            @case ('quiz') {
              <p class="sf-sub">Complete the quiz below to finish this lesson.</p>
            }
            @case ('video') {
              @if (videoSrc(); as src) {
                @if (isVideoFile()) {
                  <video class="ls__video" controls preload="metadata" [src]="src">
                    Your browser cannot play this video.
                    <a [href]="src" target="_blank" rel="noopener noreferrer">Open the video</a>
                  </video>
                } @else {
                  <a
                    class="sf-btn sf-btn--secondary"
                    [href]="src"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open video
                  </a>
                }
              } @else {
                <p class="sf-sub" role="note">No video is available for this lesson yet.</p>
              }
            }
            @default {
              @if (externalLink(); as href) {
                <a
                  class="sf-btn sf-btn--secondary"
                  [href]="href"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open {{ typeName() }} content
                </a>
                <p class="sf-sub ls__note" role="note">
                  {{ typeName() }} content opens in a new tab. It is not shown inside this app yet;
                  come back and mark the lesson complete when you finish.
                </p>
              } @else {
                <p class="sf-sub" role="note">
                  This {{ typeName() }} lesson cannot be opened in this app yet.
                </p>
              }
            }
          }
        </section>

        @if (l.keyPoints.length > 0) {
          <section class="sf-card" aria-labelledby="ls-kp">
            <h2 class="sf-h3" id="ls-kp">Key points</h2>
            <ul class="ls__points">
              @for (k of l.keyPoints; track $index) {
                <li>
                  <strong>{{ k.title }}</strong>
                  @if (k.body) {
                    <span> {{ k.body }}</span>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (l.quiz; as quiz) {
          <section class="sf-card">
            <assurance-knowledge-check
              [lessonId]="l.id"
              [courseId]="courseId()"
              [quiz]="quiz"
              (completed)="onCompleted($event)"
            />
          </section>
        } @else if (!completion() && !l.progress?.completedAt) {
          <div class="ls__actions">
            @if (completeError()) {
              <p class="ls__error" role="alert">{{ completeError() }}</p>
            }
            <button
              type="button"
              class="sf-btn sf-btn--primary"
              [disabled]="completing()"
              [attr.aria-busy]="completing()"
              (click)="markComplete()"
            >
              {{ completing() ? 'Saving…' : 'Mark as complete' }}
            </button>
          </div>
        }

        <div class="ls__live" role="status" aria-live="polite">
          @if (completion(); as c) {
            <div class="sf-feedback">
              <strong>Lesson complete.</strong> Course progress: {{ c.progressPct }}%.
              @if (c.completed) {
                You finished the course.
              }
            </div>
          } @else if (l.progress?.completedAt) {
            <div class="sf-feedback">You completed this lesson earlier.</div>
          }
        </div>

        <nav class="ls__nav" aria-label="Lesson navigation">
          @if (prev(); as p) {
            <a
              class="sf-btn sf-btn--secondary"
              [routerLink]="['/courses', l.courseId, 'lessons', p.id]"
            >
              Previous: {{ p.title }}
            </a>
          }
          @if (next(); as n) {
            <a
              class="sf-btn"
              [class.sf-btn--primary]="done()"
              [class.sf-btn--secondary]="!done()"
              [routerLink]="['/courses', l.courseId, 'lessons', n.id]"
            >
              Next: {{ n.title }}
              <sf-icon name="arrow-right" size="sm" />
            </a>
          } @else if (done()) {
            <a class="sf-btn sf-btn--primary" [routerLink]="['/courses', l.courseId]">
              Back to course
            </a>
          }
        </nav>
      }
    </article>
  `,
  styles: [
    `
      .ls {
        display: flex;
        flex-direction: column;
        gap: var(--sf-space-5);
        max-width: 52rem;
      }
      .ls__back {
        align-self: flex-start;
        min-height: 44px;
      }
      .ls__head {
        display: flex;
        flex-direction: column;
        gap: var(--sf-space-2);
      }
      .ls__label {
        align-self: flex-start;
        margin: 0;
      }
      .ls__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--sf-space-2);
      }
      .ls__time {
        display: inline-flex;
        align-items: center;
        gap: var(--sf-space-1);
      }
      .ls__video {
        width: 100%;
        max-height: 28rem;
        border-radius: var(--sf-radius-md);
        background: #000;
      }
      .ls__note {
        margin: var(--sf-space-3) 0 0;
      }
      .ls__points {
        margin: var(--sf-space-3) 0 0;
        padding-left: var(--sf-space-5);
        display: flex;
        flex-direction: column;
        gap: var(--sf-space-2);
      }
      .ls__actions,
      .ls__nav {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--sf-space-3);
      }
      .ls__nav .sf-btn,
      .ls__actions .sf-btn {
        min-height: 44px;
      }
      /* Lesson titles can be long: let the label wrap instead of overflowing a fixed height. */
      .ls__nav .sf-btn {
        height: auto;
        padding-block: var(--sf-space-2);
        white-space: normal;
        text-align: left;
      }
      #ls-title:focus-visible {
        outline: 3px solid rgba(220, 72, 27, 0.45);
        outline-offset: 4px;
      }
      .ls__error {
        color: var(--sf-danger);
        font-weight: var(--sf-weight-semibold);
        margin: 0 0 var(--sf-space-3);
      }
    `,
  ],
})
export class LessonComponent {
  private readonly api = inject(LearningApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private hasShownLesson = false;

  /** Route params (withComponentInputBinding). */
  readonly courseId = input.required<string>();
  readonly lessonId = input.required<string>();

  readonly lesson = signal<ApiLesson | null>(null);
  readonly outline = signal<ApiCourseOutline | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly completion = signal<ApiCompletion | null>(null);
  readonly completing = signal(false);
  readonly completeError = signal<string | null>(null);

  private loadSeq = 0;

  constructor() {
    effect(() => {
      this.lessonId();
      this.courseId();
      void this.load();
    });
  }

  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    const lessonId = this.lessonId();
    this.loading.set(true);
    this.error.set(null);
    this.lesson.set(null);
    this.completion.set(null);
    this.completeError.set(null);
    // Fetch lesson and outline together; the outline powers the label, Previous/Next and the
    // enrollment check. A missing outline never blocks the lesson itself.
    const [lessonRes, outlineRes] = await Promise.allSettled([
      this.api.lesson(lessonId),
      this.api.course(this.courseId()),
    ]);
    if (seq !== this.loadSeq) return;
    if (lessonRes.status === 'rejected') {
      this.outline.set(outlineRes.status === 'fulfilled' ? outlineRes.value : null);
      this.error.set(
        apiErrorMessage(lessonRes.reason, 'Could not load this lesson. Please try again.'),
      );
      this.loading.set(false);
      return;
    }
    let outline = outlineRes.status === 'fulfilled' ? outlineRes.value : null;
    // The server rejects progress calls without an enrollment (403), and a deep link can arrive
    // before the learner ever opened the course. Enrolling is idempotent.
    if (outline && outline.enrollment === null && outline.status === 'published') {
      try {
        await this.api.enroll(this.courseId());
        if (seq !== this.loadSeq) return;
        outline = await this.api.course(this.courseId());
      } catch (e) {
        if (seq !== this.loadSeq) return;
        this.completeError.set(
          apiErrorMessage(e, 'Could not enroll you in this course. Progress may not be saved.'),
        );
      }
    }
    if (seq !== this.loadSeq) return;
    this.outline.set(outline);
    this.lesson.set(lessonRes.value);
    this.loading.set(false);
    if (this.hasShownLesson) {
      // Navigating between lessons destroys the clicked link; restore focus to the new title.
      afterNextRender(
        () => this.host.nativeElement.querySelector<HTMLElement>('#ls-title')?.focus(),
        {
          injector: this.injector,
        },
      );
    }
    this.hasShownLesson = true;
  }

  /** Flat, ordered lessons of the course. */
  private readonly flat = computed<ApiLessonSummary[]>(() =>
    (this.outline()?.modules ?? []).flatMap((m) => m.lessons),
  );

  private readonly index = computed(() => this.flat().findIndex((x) => x.id === this.lessonId()));

  readonly prev = computed(() => {
    const i = this.index();
    return i > 0 ? this.flat()[i - 1] : null;
  });

  readonly next = computed(() => {
    const i = this.index();
    return i >= 0 && i < this.flat().length - 1 ? this.flat()[i + 1] : null;
  });

  readonly done = computed(() => !!this.completion() || !!this.lesson()?.progress?.completedAt);

  readonly label = computed(() => {
    const l = this.lesson();
    if (!l) return '';
    const mod = (l.moduleLabel || l.moduleTitle || '').toUpperCase();
    const outlineMod = this.outline()?.modules.find((m) => m.id === l.moduleId);
    const pos = outlineMod ? outlineMod.lessons.findIndex((x) => x.id === l.id) + 1 : 0;
    return outlineMod && pos > 0
      ? `${mod} · LESSON ${pos} OF ${outlineMod.lessons.length}`
      : mod || 'LESSON';
  });

  readonly typeName = computed(() => {
    const t = this.lesson()?.contentType;
    return t === 'scorm' ? 'SCORM' : t === 'cmi5' ? 'cmi5' : t === 'unity' ? 'Unity' : (t ?? '');
  });

  readonly videoSrc = computed(() => {
    const l = this.lesson();
    if (!l) return '';
    if (HTTP_URL.test(l.externalUrl)) return l.externalUrl;
    return HTTP_URL.test(l.assetRef) || l.assetRef.startsWith('/') ? l.assetRef : '';
  });

  readonly isVideoFile = computed(() => {
    const l = this.lesson();
    const src = this.videoSrc();
    return !!l && !!src && (src === l.assetRef || VIDEO_FILE.test(src));
  });

  readonly externalLink = computed(() => {
    const url = this.lesson()?.externalUrl ?? '';
    return HTTP_URL.test(url) ? url : '';
  });

  onCompleted(c: ApiCompletion): void {
    this.completion.set(c);
  }

  async markComplete(): Promise<void> {
    const l = this.lesson();
    if (!l || this.completing()) return;
    this.completing.set(true);
    this.completeError.set(null);
    try {
      this.completion.set(await this.api.complete(l.id));
    } catch (e) {
      this.completeError.set(apiErrorMessage(e, 'Could not save your progress. Please try again.'));
    } finally {
      this.completing.set(false);
    }
  }
}
