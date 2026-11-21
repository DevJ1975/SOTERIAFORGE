import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TenantService } from '@assurance/auth';
import { CoachApi, type ReviewItem, type ReviewQueue } from '@assurance/ai-tutor';
import { CoachReviewComponent } from './coach-review.component';

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  id: 'e1',
  createdAt: '2026-11-20T15:00:00Z',
  courseId: 'c1',
  courseTitle: 'Lockout Tagout',
  moduleId: null,
  agent: 'general',
  learner: 'Learner 3f2a',
  question: 'Who removes the lock?',
  answer: 'The person who applied it.',
  abstained: false,
  blocked: false,
  rating: 'down',
  ratingNote: 'Cites the wrong page',
  citations: [{ label: 'LOTO guide (page 2)' }],
  reason: 'thumbs_down',
  status: 'open',
  reviewNote: '',
  diagram: null,
  ...over,
});
const queue = (items: ReviewItem[]): ReviewQueue => ({
  summary: { days: 7, asked: 40, helpful: 17, unhelpful: 3, abstained: 5, helpfulRate: 0.85 },
  items,
});

describe('CoachReviewComponent', () => {
  let fixture: ComponentFixture<CoachReviewComponent>;
  const tenant = signal<string | null>('acme');
  const review = jest.fn();
  const updateReview = jest.fn();
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    tenant.set('acme');
    review.mockReset().mockResolvedValue(queue([item()]));
    updateReview.mockReset();
    TestBed.configureTestingModule({
      imports: [CoachReviewComponent],
      providers: [
        { provide: TenantService, useValue: { tenantId: tenant } },
        { provide: CoachApi, useValue: { review, updateReview } },
      ],
    });
    fixture = TestBed.createComponent(CoachReviewComponent);
    await settle();
  });

  it('loads the open queue for the last week and shows the totals', () => {
    expect(review).toHaveBeenCalledWith('open', 7);
    const summary = el().querySelector('.cr__summary')?.textContent ?? '';
    expect(summary).toContain('40');
    expect(summary).toContain('85%');
  });

  it('shows why an answer is queued, under a pseudonym, with the learner’s note', () => {
    const text = el().querySelector('.cr__item')?.textContent ?? '';
    expect(text).toContain('Marked not helpful');
    expect(text).toContain('Learner 3f2a');
    expect(text).toContain('Who removes the lock?');
    expect(text).toContain('LOTO guide (page 2)');
    expect(text).toContain('Cites the wrong page');
  });

  it('marks an item reviewed with the optional note and drops it from the open list', async () => {
    updateReview.mockResolvedValue(item({ status: 'reviewed', reviewNote: 'Fixed the source' }));
    const note = el().querySelector('.cr__actions input') as HTMLInputElement;
    note.value = 'Fixed the source';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Mark reviewed')?.click();
    await settle();
    expect(updateReview).toHaveBeenCalledWith('e1', 'reviewed', 'Fixed the source');
    expect(el().querySelectorAll('.cr__item')).toHaveLength(0);
    expect(el().textContent).toContain('Nothing needs review');
    expect(el().querySelector('[aria-live="polite"]')?.textContent).toContain('Marked reviewed.');
  });

  it('refetches when the filter or period changes, and can reopen a reviewed item', async () => {
    review.mockResolvedValue(queue([item({ status: 'reviewed', reviewNote: 'Fixed' })]));
    button('Reviewed')?.click();
    await settle();
    expect(review).toHaveBeenLastCalledWith('reviewed', 7);
    expect(button('Reviewed')?.getAttribute('aria-pressed')).toBe('true');
    expect(el().textContent).toContain('Review note: Fixed');

    updateReview.mockResolvedValue(item());
    button('Reopen')?.click();
    await settle();
    expect(updateReview).toHaveBeenCalledWith('e1', 'open', undefined);

    const period = el().querySelector('[aria-label="Period"]') as HTMLSelectElement;
    period.value = '30';
    period.dispatchEvent(new Event('change'));
    await settle();
    expect(review).toHaveBeenLastCalledWith('reviewed', 30);
  });

  it('says there are no ratings yet instead of showing a rate', async () => {
    review.mockResolvedValue({
      summary: { days: 7, asked: 0, helpful: 0, unhelpful: 0, abstained: 0, helpfulRate: null },
      items: [],
    });
    button('All')?.click();
    await settle();
    expect(el().textContent).toContain('No ratings yet');
    expect(el().textContent).toContain('Nothing to show');
  });

  it('shows an alert when the queue cannot be loaded or updated', async () => {
    updateReview.mockImplementation(async () => {
      throw new Error('Could not save');
    });
    button('Mark reviewed')?.click();
    await settle();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Could not save');
    expect(el().querySelectorAll('.cr__item')).toHaveLength(1);

    review.mockImplementation(async () => {
      throw new Error('Offline');
    });
    button('All')?.click();
    await settle();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Offline');
  });
});
