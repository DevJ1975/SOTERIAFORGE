import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '@assurance/lms-core';
import { DispatchReporter } from './dispatch-reporter.service';

/**
 * Landing page for a course opened from another LMS (platform Phase 6). It starts
 * the reporter, then sends the learner on to the course itself.
 */
@Component({
  selector: 'assurance-dispatch',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="dp">
      @if (error()) {
        <h1>This course link is not available</h1>
        <p role="alert">{{ error() }}</p>
        <button type="button" (click)="start()">Try again</button>
      } @else if (reporter.session(); as session) {
        <h1>{{ session.courseTitle }}</h1>
        @if (session.enrolled) {
          <p>
            @if (session.completed) {
              You have completed this course.
            } @else {
              You are {{ session.progressPct }}% of the way through.
            }
            @if (session.scorePct !== null) {
              Score so far: {{ session.scorePct }}%.
            }
          </p>
          <progress
            max="100"
            [value]="session.progressPct"
            [attr.aria-label]="'Course progress: ' + session.progressPct + '%'"
          ></progress>
        } @else {
          <p role="alert">
            You are not enrolled in this course in Soteria Forge yet. Ask your instructor to enroll
            you, then open the course from your LMS again.
          </p>
        }
        <p class="dp__link" role="status">
          @switch (reporter.link()) {
            @case ('connected') {
              Connected to your LMS. Your progress is sent back as you go. Keep the LMS window open.
            }
            @case ('connecting') {
              Connecting to your LMS…
            }
            @case ('disconnected') {
              Not connected to your LMS. {{ reporter.problem() }}
            }
          }
        </p>
        @if (reporter.link() === 'disconnected' && session.enrolled) {
          <button type="button" [disabled]="retrying()" (click)="retry()">
            Try connecting again
          </button>
        }
        @if (session.enrolled) {
          <a class="dp__go" [routerLink]="['/courses', session.courseId]">
            {{ session.progressPct > 0 && !session.completed ? 'Continue course' : 'Open course' }}
          </a>
        }
      } @else {
        <p role="status">Opening your course…</p>
      }
    </main>
  `,
  styles: [
    `
      .dp {
        max-width: 36rem;
        margin: 4rem auto;
        padding: 0 1.25rem;
      }
      progress {
        width: 100%;
        height: 0.75rem;
      }
      .dp__link {
        margin: 1.25rem 0;
      }
      button,
      .dp__go {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 1.25rem;
        margin: 0 0.75rem 0.75rem 0;
        font: inherit;
        border-radius: 0.5rem;
      }
      .dp__go {
        background: #111827;
        color: #fff;
        text-decoration: none;
        font-weight: 600;
      }
    `,
  ],
})
export class DispatchComponent implements OnInit {
  protected readonly reporter = inject(DispatchReporter);
  /** Route param. */
  readonly id = input.required<string>();
  protected readonly error = signal('');
  protected readonly retrying = signal(false);

  ngOnInit(): void {
    void this.start();
  }

  async start(): Promise<void> {
    this.error.set('');
    try {
      await this.reporter.activate(this.id());
    } catch (error) {
      const gone = error instanceof HttpErrorResponse && error.status === 404;
      this.error.set(
        gone
          ? 'This link has been withdrawn, or the course is not published. Ask your instructor.'
          : apiErrorMessage(error, 'Could not open this course. Check your connection.'),
      );
    }
  }

  async retry(): Promise<void> {
    this.retrying.set(true);
    try {
      await this.reporter.retry();
    } finally {
      this.retrying.set(false);
    }
  }
}
