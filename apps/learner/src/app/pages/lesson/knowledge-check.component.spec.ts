import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { LearningApi, type ApiLessonQuiz } from '@assurance/lms-core';
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
const q3 = { ...q1, id: 'q3', type: 'ordering' as const, prompt: 'Order', options: [] };

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
    expect(api.submitQuiz).toHaveBeenCalledWith('les-1', [
      { questionId: 'q1', selectedOptionIds: ['a'] },
      { questionId: 'q2', text: 'x' },
    ]);
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
});
