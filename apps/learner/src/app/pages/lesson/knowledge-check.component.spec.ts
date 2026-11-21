import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { LearningApi, type ApiLessonQuiz, type ApiQuestion } from '@assurance/lms-core';
import { KnowledgeCheckComponent } from './knowledge-check.component';

const q1 = {
  id: 'q1',
  type: 'mcq' as const,
  prompt: 'Pick one',
  points: 1,
  options: [
    { id: 'a', text: 'Alpha' },
    { id: 'b', text: 'Beta' },
  ],
};
const q2 = { ...q1, id: 'q2', type: 'fill_in' as const, prompt: 'Type it', options: [] };
/** A type a newer server could send that this app does not know. */
const q3 = {
  ...q1,
  id: 'q3',
  type: 'hotspot' as unknown as ApiQuestion['type'],
  prompt: 'Tap it',
  options: [],
};
const ordering = {
  ...q1,
  id: 'ord',
  type: 'ordering' as const,
  prompt: 'Order the steps',
  options: [
    { id: 's2', text: 'Shut down' },
    { id: 's1', text: 'Notify' },
    { id: 's3', text: 'Isolate' },
  ],
};
const matching = {
  ...q1,
  id: 'mat',
  type: 'matching' as const,
  prompt: 'Match',
  options: [],
  matching: { left: ['Spring', 'Battery'], right: ['Electrical', 'Mechanical'] },
};

function quiz(over: Partial<ApiLessonQuiz> = {}): ApiLessonQuiz {
  return {
    id: 'quiz',
    title: 'Check',
    mode: 'check',
    passThreshold: 70,
    maxAttempts: null,
    questions: [q1, q2],
    answered: {},
    ...over,
  };
}

describe('KnowledgeCheckComponent', () => {
  let api: { check: jest.Mock; submitQuiz: jest.Mock };
  let fixture: ComponentFixture<KnowledgeCheckComponent>;

  const el = (): HTMLElement => fixture.nativeElement;
  const click = (sel: string, i = 0): void => {
    (el().querySelectorAll(sel)[i] as HTMLElement).click();
    fixture.detectChanges();
  };
  const flush = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  function create(q: ApiLessonQuiz): void {
    fixture = TestBed.createComponent(KnowledgeCheckComponent);
    fixture.componentRef.setInput('lessonId', 'les-1');
    fixture.componentRef.setInput('quiz', q);
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = { check: jest.fn(), submitQuiz: jest.fn() };
    TestBed.configureTestingModule({
      imports: [KnowledgeCheckComponent],
      providers: [provideRouter([]), { provide: LearningApi, useValue: api }],
    });
  });

  it('shows one question and gives retry wording until solved', async () => {
    create(quiz());
    expect(el().textContent).toContain('Question 1 of 2');
    expect(el().textContent).not.toContain('Type it');

    api.check.mockResolvedValueOnce({
      questionId: 'q1',
      correct: false,
      firstTry: true,
      solved: false,
      feedback: 'Think again',
      completion: null,
    });
    click('.sf-option', 1);
    click('.kc__actions button');
    await flush();
    expect(api.check).toHaveBeenCalledWith('les-1', { questionId: 'q1', selectedOptionIds: ['b'] });
    expect(el().textContent).toContain('Not quite');
    expect(el().textContent).toContain('Think again');
    expect(el().querySelector('.kc__actions button')?.textContent).toContain('Try again');

    api.check.mockResolvedValueOnce({
      questionId: 'q1',
      correct: true,
      firstTry: false,
      solved: true,
      feedback: null,
      completion: null,
    });
    click('.sf-option', 0);
    click('.kc__actions button');
    await flush();
    expect(el().textContent).toContain('Correct. This was a retry.');
    click('.kc__actions button'); // Next question
    expect(el().textContent).toContain('Question 2 of 2');
  });

  it('emits completion and restores answered questions', async () => {
    create(quiz({ answered: { q1: { firstCorrect: true, solved: true } } }));
    expect(el().textContent).toContain('Type it');
    const done = jest.fn();
    fixture.componentInstance.completed.subscribe(done);
    api.check.mockResolvedValue({
      questionId: 'q2',
      correct: true,
      firstTry: true,
      solved: true,
      feedback: null,
      completion: { progressPct: 100, completed: true, firstCompletion: true },
    });
    const input = el().querySelector('input') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('.kc__actions button');
    await flush();
    expect(api.check).toHaveBeenCalledWith('les-1', { questionId: 'q2', text: 'hello' });
    expect(done).toHaveBeenCalledWith({ progressPct: 100, completed: true, firstCompletion: true });
    expect(el().textContent).toContain('first try');
  });

  it('check mode: an unsupported question shows a blocking message with a course link', () => {
    create(quiz({ questions: [q3] }));
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.detectChanges();
    expect(el().textContent).toContain('not supported yet');
    expect(el().querySelector('.kc__actions button')).toBeNull();
    expect(el().querySelector('.kc__actions a')?.getAttribute('href')).toBe('/courses/c1');
    expect(api.check).not.toHaveBeenCalled();
  });

  it('graded mode: an unsupported question disables Submit so no attempt is spent', () => {
    create(quiz({ mode: 'graded', questions: [q1, q3] }));
    click('.sf-option', 0);
    const submit = el().querySelector('.kc__actions button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(el().textContent).toContain('cannot be completed here');
    submit.click();
    expect(api.submitQuiz).not.toHaveBeenCalled();
  });

  it('radio options use a roving tabindex and arrow keys select', () => {
    create(quiz());
    const opts = Array.from(el().querySelectorAll<HTMLElement>('.sf-option'));
    expect(opts.map((o) => o.getAttribute('tabindex'))).toEqual(['0', '-1']);
    opts[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(opts.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(opts.map((o) => o.getAttribute('tabindex'))).toEqual(['-1', '0']);
    expect(document.activeElement).toBe(opts[1]);
  });

  it('moves focus to Next question after a solved check', async () => {
    create(quiz());
    document.body.appendChild(fixture.nativeElement);
    api.check.mockResolvedValue({
      questionId: 'q1',
      correct: true,
      firstTry: true,
      solved: true,
      feedback: null,
      completion: null,
    });
    click('.sf-option', 0);
    click('.kc__actions button');
    await flush();
    await flush();
    expect(document.activeElement).toBe(el().querySelector('.kc__after'));
    fixture.nativeElement.remove();
  });

  it('shows an error when the check fails', async () => {
    create(quiz());
    api.check.mockRejectedValue(new Error('boom'));
    click('.sf-option', 0);
    click('.kc__actions button');
    await flush();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Could not check');
  });

  it('graded mode submits once and shows server results', async () => {
    create(quiz({ mode: 'graded' }));
    expect(el().querySelectorAll('.sf-option').length).toBe(2);
    const submit = el().querySelector('.kc__actions button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    click('.sf-option', 0);
    const input = el().querySelector('input') as HTMLInputElement;
    input.value = 'x';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    api.submitQuiz.mockResolvedValue({
      earnedPoints: 1,
      totalPoints: 2,
      scorePct: 50,
      passed: false,
      perQuestion: [
        { questionId: 'q1', correct: true, awardedPoints: 1 },
        { questionId: 'q2', correct: false, awardedPoints: 0 },
      ],
      attemptsUsed: 1,
      attemptsRemaining: 2,
      completion: null,
    });
    click('.kc__actions button');
    await flush();
    expect(api.submitQuiz).toHaveBeenCalledWith(
      'les-1',
      [
        { questionId: 'q1', selectedOptionIds: ['a'] },
        { questionId: 'q2', text: 'x' },
      ],
      expect.any(String),
    );
    const text = el().textContent ?? '';
    expect(text).toContain('Not passed');
    expect(text).toContain('50%');
    expect(text).toContain('remaining: 2');
    expect(text).toContain('Correct');
    expect(text).toContain('Incorrect');
  });

  it('surfaces the 409 attempts-exhausted message', async () => {
    create(quiz({ mode: 'graded', questions: [q1] }));
    click('.sf-option', 0);
    api.submitQuiz.mockRejectedValue(
      new HttpErrorResponse({ status: 409, error: { detail: 'No quiz attempts remaining.' } }),
    );
    click('.kc__actions button');
    await flush();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'No quiz attempts remaining.',
    );
  });

  const graded = {
    earnedPoints: 1,
    totalPoints: 1,
    scorePct: 100,
    passed: true,
    perQuestion: [],
    attemptsUsed: 1,
    attemptsRemaining: 1,
    completion: null,
  };

  it('ordering: Move up / Move down rearrange the items and submit their order', async () => {
    create(quiz({ mode: 'graded', questions: [ordering] }));
    document.body.appendChild(fixture.nativeElement);
    const items = (): string[] =>
      Array.from(el().querySelectorAll('.kc__order-text')).map((x) => x.textContent?.trim() ?? '');
    expect(items()).toEqual(['Shut down', 'Notify', 'Isolate']);
    const moves = (): HTMLButtonElement[] =>
      Array.from(el().querySelectorAll<HTMLButtonElement>('.kc__order-moves button'));
    expect(moves()[0].disabled).toBe(true); // first item cannot move up
    moves()[2].click(); // "Notify": Move up
    fixture.detectChanges();
    await flush();
    expect(items()).toEqual(['Notify', 'Shut down', 'Isolate']);
    expect(el().textContent).toContain('Notify moved to position 1 of 3.');
    // Move up is now disabled at the top, so focus lands on that item's Move down.
    expect(document.activeElement).toBe(moves()[1]);
    api.submitQuiz.mockResolvedValue(graded);
    click('.kc__actions button');
    await flush();
    expect(api.submitQuiz).toHaveBeenCalledWith(
      'les-1',
      [{ questionId: 'ord', order: ['s1', 's2', 's3'] }],
      expect.any(String),
    );
    fixture.nativeElement.remove();
  });

  it('matching: every left item needs a choice, answered as "left:right" pairs', async () => {
    create(quiz({ mode: 'graded', questions: [matching] }));
    const selects = Array.from(el().querySelectorAll<HTMLSelectElement>('select'));
    expect(selects.map((x) => x.labels?.[0]?.textContent?.trim())).toEqual(['Spring', 'Battery']);
    const submit = (): HTMLButtonElement =>
      el().querySelector('.kc__actions button') as HTMLButtonElement;
    const choose = (i: number, value: string): void => {
      selects[i].value = value;
      selects[i].dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    choose(0, 'Mechanical');
    expect(submit().disabled).toBe(true);
    choose(1, 'Electrical');
    expect(submit().disabled).toBe(false);
    api.submitQuiz.mockResolvedValue(graded);
    submit().click();
    await flush();
    expect(api.submitQuiz).toHaveBeenCalledWith(
      'les-1',
      [{ questionId: 'mat', selectedOptionIds: ['Spring:Mechanical', 'Battery:Electrical'] }],
      expect.any(String),
    );
  });

  it('check mode: an ordering question can be checked', async () => {
    create(quiz({ questions: [ordering] }));
    api.check.mockResolvedValue({
      questionId: 'ord',
      correct: false,
      firstTry: true,
      solved: false,
      feedback: null,
      completion: null,
    });
    click('.kc__actions button');
    await flush();
    expect(api.check).toHaveBeenCalledWith('les-1', {
      questionId: 'ord',
      order: ['s2', 's1', 's3'],
    });
    expect(el().querySelectorAll('.kc__order-item.is-wrong').length).toBe(3);
  });

  async function submitAfterFailure(status: number): Promise<string[]> {
    create(quiz({ mode: 'graded', questions: [q1] }));
    click('.sf-option', 0);
    api.submitQuiz.mockImplementationOnce(() => Promise.reject(new HttpErrorResponse({ status })));
    click('.kc__actions button');
    await flush();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Could not submit');
    api.submitQuiz.mockResolvedValueOnce(graded);
    click('.kc__actions button');
    await flush();
    return api.submitQuiz.mock.calls.map((c) => c[2]);
  }

  it('a resend after a lost response reuses the Idempotency-Key', async () => {
    const [first, resend] = await submitAfterFailure(0);
    expect(resend).toBe(first);
  });

  it('a resend after a 4xx answer uses a new Idempotency-Key', async () => {
    const [first, resend] = await submitAfterFailure(400);
    expect(resend).not.toBe(first);
  });
});
