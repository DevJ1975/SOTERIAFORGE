import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TenantService } from '@assurance/auth';
import {
  CoachApi,
  CoachDiagramComponent,
  coachError,
  type ReviewItem,
  type ReviewQueue,
  type ReviewStatus,
} from '@assurance/ai-tutor';

type Filter = ReviewStatus | 'all';

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'open', label: 'Needs review' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'all', label: 'All' },
];
const WINDOWS = [7, 14, 30] as const;
const REASON: Record<ReviewItem['reason'], string> = {
  thumbs_down: 'Marked not helpful',
  abstained: 'No answer in the sources',
  blocked: 'Blocked by a guardrail',
};
const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Coach review: the Ask Forge answers that need an instructor's eye (marked not helpful,
 * unanswered, or blocked) and how answers were rated over the period. Learners appear
 * under a pseudonym only.
 */
@Component({
  selector: 'assurance-admin-coach-review',
  standalone: true,
  imports: [FormsModule, CoachDiagramComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cr" aria-labelledby="cr-h">
      <h1 id="cr-h">Coach review</h1>
      <p>
        Ask Forge answers that learners marked not helpful, that the sources could not answer, or
        that a guardrail blocked. Learners are shown under a pseudonym.
      </p>

      <div class="cr__controls">
        <div role="group" aria-label="Show">
          @for (f of filters; track f.id) {
            <button
              type="button"
              class="cr__chip"
              [attr.aria-pressed]="filter() === f.id"
              (click)="filter.set(f.id)"
            >
              {{ f.label }}
            </button>
          }
        </div>
        <label>
          Period
          <select aria-label="Period" [ngModel]="days()" (ngModelChange)="days.set(+$event)">
            @for (d of windows; track d) {
              <option [value]="d">Last {{ d }} days</option>
            }
          </select>
        </label>
      </div>

      @if (error()) {
        <p class="cr__error" role="alert">{{ error() }}</p>
      }

      @if (queue(); as q) {
        <dl class="cr__summary" aria-label="Summary for the period">
          <div>
            <dt>Questions asked</dt>
            <dd>{{ q.summary.asked }}</dd>
          </div>
          <div>
            <dt>Marked helpful</dt>
            <dd>{{ q.summary.helpful }}</dd>
          </div>
          <div>
            <dt>Marked not helpful</dt>
            <dd>{{ q.summary.unhelpful }}</dd>
          </div>
          <div>
            <dt>Not answered</dt>
            <dd>{{ q.summary.abstained }}</dd>
          </div>
          <div>
            <dt>Helpful rate</dt>
            <dd>{{ helpfulRate() }}</dd>
          </div>
        </dl>

        @if (q.items.length === 0) {
          <p>
            {{
              filter() === 'open'
                ? 'Nothing needs review for this period.'
                : 'Nothing to show for this period.'
            }}
          </p>
        } @else {
          <ul class="cr__list">
            @for (item of q.items; track item.id) {
              <li class="cr__item">
                <p class="cr__meta">
                  <strong>{{ reason(item) }}</strong>
                  · {{ item.courseTitle }} · {{ item.learner }} · {{ when(item) }}
                  @if (item.status === 'reviewed') {
                    · <span class="cr__done">Reviewed</span>
                  }
                </p>
                <h2 class="cr__q">{{ item.question }}</h2>
                <p class="cr__a">{{ item.answer }}</p>
                @if (item.diagram; as diagram) {
                  <assurance-coach-diagram [diagram]="diagram" />
                }
                @if (item.citations.length) {
                  <p class="cr__meta">Sources: {{ sources(item) }}</p>
                }
                @if (item.ratingNote) {
                  <p class="cr__note">Learner's note: {{ item.ratingNote }}</p>
                }
                @if (item.status === 'reviewed') {
                  @if (item.reviewNote) {
                    <p class="cr__note">Review note: {{ item.reviewNote }}</p>
                  }
                  <button
                    type="button"
                    [disabled]="busy() === item.id"
                    (click)="mark(item, 'open')"
                  >
                    Reopen
                  </button>
                } @else {
                  <div class="cr__actions">
                    <label>
                      Review note (optional)
                      <input
                        type="text"
                        maxlength="1000"
                        [attr.aria-label]="'Review note for: ' + item.question"
                        [ngModel]="notes()[item.id] ?? ''"
                        (ngModelChange)="setNote(item.id, $event)"
                      />
                    </label>
                    <button
                      type="button"
                      [disabled]="busy() === item.id"
                      (click)="mark(item, 'reviewed')"
                    >
                      Mark reviewed
                    </button>
                  </div>
                }
              </li>
            }
          </ul>
        }
      } @else if (!error()) {
        <p role="status">Loading the review queue…</p>
      }
      <p class="cr__sr" role="status" aria-live="polite">{{ notice() }}</p>
    </section>
  `,
  styles: [
    `
      .cr {
        max-width: 60rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .cr__controls {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
        margin: 1rem 0;
      }
      .cr button,
      .cr select,
      .cr input {
        min-height: 44px;
        font: inherit;
      }
      .cr__chip {
        margin-right: 0.375rem;
        padding: 0 0.875rem;
        border: 1px solid #d1d5db;
        border-radius: 999px;
        background: #fff;
        cursor: pointer;
      }
      .cr__chip[aria-pressed='true'] {
        border: 2px solid #111827;
        font-weight: 700;
      }
      .cr__summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        gap: 0.75rem;
        margin: 0 0 1.5rem;
      }
      .cr__summary div {
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 0.75rem;
        background: #fff;
      }
      .cr__summary dt {
        font-size: 0.8125rem;
        color: #4b5563;
      }
      .cr__summary dd {
        margin: 0.25rem 0 0;
        font-size: 1.5rem;
        font-weight: 700;
      }
      .cr__list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 1rem;
      }
      .cr__item {
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1rem;
        background: #fff;
      }
      .cr__meta {
        margin: 0 0 0.5rem;
        font-size: 0.875rem;
        color: #4b5563;
      }
      .cr__q {
        margin: 0 0 0.5rem;
        font-size: 1.0625rem;
      }
      .cr__a {
        margin: 0 0 0.5rem;
        white-space: pre-wrap;
      }
      .cr__note {
        margin: 0.5rem 0;
        padding: 0.5rem 0.75rem;
        background: #f3f4f6;
        border-radius: 0.375rem;
      }
      .cr__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .cr__actions input {
        display: block;
        min-width: 18rem;
        padding: 0 0.5rem;
      }
      .cr__done {
        color: #166534;
        font-weight: 600;
      }
      .cr__error {
        color: #b00020;
      }
      .cr__sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    `,
  ],
})
export class CoachReviewComponent {
  private readonly api = inject(CoachApi);
  private readonly tenantService = inject(TenantService);

  protected readonly filters = FILTERS;
  protected readonly windows = WINDOWS;
  protected readonly filter = signal<Filter>('open');
  protected readonly days = signal<number>(7);
  protected readonly queue = signal<ReviewQueue | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal('');
  protected readonly notes = signal<Record<string, string>>({});
  protected readonly notice = signal('');
  private context = 0;

  protected readonly helpfulRate = computed(() => {
    const rate = this.queue()?.summary.helpfulRate;
    return rate === null || rate === undefined ? 'No ratings yet' : `${Math.round(rate * 100)}%`;
  });

  constructor() {
    effect(() => {
      const tenant = this.tenantService.tenantId();
      const filter = this.filter();
      const days = this.days();
      const context = ++this.context;
      this.queue.set(null);
      this.error.set(null);
      if (!tenant) {
        this.error.set('Select a tenant to review coach answers.');
        return;
      }
      void this.load(filter, days, context);
    });
  }

  private async load(filter: Filter, days: number, context: number): Promise<void> {
    try {
      const queue = await this.api.review(filter, days);
      if (context === this.context) this.queue.set(queue);
    } catch (err) {
      if (context === this.context) this.error.set(coachError(err));
    }
  }

  protected reason(item: ReviewItem): string {
    return REASON[item.reason] ?? item.reason;
  }

  protected when(item: ReviewItem): string {
    const date = new Date(item.createdAt);
    return Number.isNaN(date.getTime()) ? '' : dateTime.format(date);
  }

  protected sources(item: ReviewItem): string {
    return item.citations.map((c) => c.label).join('; ');
  }

  protected setNote(id: string, note: string): void {
    this.notes.update((all) => ({ ...all, [id]: note }));
  }

  protected async mark(item: ReviewItem, status: ReviewStatus): Promise<void> {
    const context = this.context;
    this.busy.set(item.id);
    this.error.set(null);
    this.notice.set('');
    try {
      const updated = await this.api.updateReview(
        item.id,
        status,
        status === 'reviewed' ? this.notes()[item.id] : undefined,
      );
      if (context !== this.context) return;
      const filter = this.filter();
      this.queue.update((q) =>
        q
          ? {
              ...q,
              // An item that no longer matches the filter leaves the list.
              items:
                filter === 'all' || filter === updated.status
                  ? q.items.map((i) => (i.id === item.id ? updated : i))
                  : q.items.filter((i) => i.id !== item.id),
            }
          : q,
      );
      this.notice.set(status === 'reviewed' ? 'Marked reviewed.' : 'Reopened.');
    } catch (err) {
      if (context === this.context) this.error.set(coachError(err));
    } finally {
      if (context === this.context) this.busy.set('');
    }
  }
}
