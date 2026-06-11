import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';
import { of } from 'rxjs';
import { PrincipalStore } from '@forge/auth';
import {
  ForgeCatalog,
  ForgeEnrollment,
  nextEnrollment,
  type MarkLessonCompleteArgs,
} from '@forge/lms-core';
import type { Block, CourseDraft, LessonDraft } from '@forge/shared';
import { PlayerPage, shouldAutoComplete } from './player.page';

// Real Firebase never runs in jsdom: Firestore is a dummy object and the
// lms-core services are stubbed at the DI level.
describe('PlayerPage', () => {
  beforeEach(async () => {
    const paramMap = convertToParamMap({ courseId: 'course-1' });
    await TestBed.configureTestingModule({
      imports: [PlayerPage],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: Firestore, useValue: {} },
        { provide: ActivatedRoute, useValue: { paramMap: of(paramMap), snapshot: { paramMap } } },
        {
          provide: ForgeCatalog,
          useValue: { getPublished: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ForgeEnrollment, useValue: { get: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compileComponents();
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(PlayerPage);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the unavailable notice when signed out / course missing', async () => {
    const fixture = TestBed.createComponent(PlayerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Course unavailable');
  });
});

describe('shouldAutoComplete', () => {
  const checks = (total: number, answered: number) => ({
    total,
    answered,
    correctOnFirstAttempt: 0,
  });

  it('completes when all checks are answered, the end is reached, and not already complete', () => {
    expect(
      shouldAutoComplete({ checks: checks(2, 2), endReached: true, alreadyComplete: false }),
    ).toBe(true);
  });

  it('never completes an already completed lesson', () => {
    expect(
      shouldAutoComplete({ checks: checks(2, 2), endReached: true, alreadyComplete: true }),
    ).toBe(false);
  });

  it('waits for every check to be answered', () => {
    expect(
      shouldAutoComplete({ checks: checks(2, 1), endReached: true, alreadyComplete: false }),
    ).toBe(false);
  });

  it('waits for the end of the lesson to be reached', () => {
    expect(
      shouldAutoComplete({ checks: checks(2, 2), endReached: false, alreadyComplete: false }),
    ).toBe(false);
  });

  it('leaves zero-check lessons (and lessons with no renderer state yet) manual', () => {
    expect(
      shouldAutoComplete({ checks: checks(0, 0), endReached: true, alreadyComplete: false }),
    ).toBe(false);
    expect(
      shouldAutoComplete({ checks: undefined, endReached: true, alreadyComplete: false }),
    ).toBe(false);
  });
});

// jsdom has no IntersectionObserver, so the player treats the lesson end as
// reached immediately — which is exactly the 'short non-scrolling lesson'
// behavior, letting these tests drive auto-completion through answers alone.
describe('PlayerPage auto-completion and scoring', () => {
  function knowledgeCheck(id: string): Block {
    return {
      id,
      kind: 'knowledgeCheck',
      question: `Question ${id}`,
      type: 'mcq',
      options: [
        { id: `${id}-right`, text: 'Right answer', correct: true },
        { id: `${id}-wrong`, text: 'Wrong answer', correct: false },
      ],
      feedbackCorrect: 'Correct!',
      feedbackIncorrect: 'Not quite.',
    };
  }

  function lesson(id: string, blocks: Block[]): LessonDraft {
    return { id, title: `Lesson ${id}`, blocks };
  }

  function paragraphLesson(id: string): LessonDraft {
    return lesson(id, [{ id: `${id}-p`, kind: 'paragraph', html: 'Read this carefully.' }]);
  }

  function courseWith(lessons: LessonDraft[]): CourseDraft {
    return {
      id: 'course-1',
      title: 'Lockout/Tagout',
      description: '',
      status: 'published',
      lessons,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  async function setup(course: CourseDraft) {
    const markLessonComplete = jest.fn((_db: unknown, args: MarkLessonCompleteArgs) =>
      Promise.resolve(nextEnrollment({ ...args, existing: args.existing ?? null })),
    );
    const paramMap = convertToParamMap({ courseId: course.id });
    await TestBed.configureTestingModule({
      imports: [PlayerPage],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: Firestore, useValue: {} },
        { provide: ActivatedRoute, useValue: { paramMap: of(paramMap), snapshot: { paramMap } } },
        { provide: ForgeCatalog, useValue: { getPublished: jest.fn().mockResolvedValue(course) } },
        {
          provide: ForgeEnrollment,
          useValue: { get: jest.fn().mockResolvedValue(undefined), markLessonComplete },
        },
        {
          provide: PrincipalStore,
          useValue: {
            init: jest.fn(),
            status: () => 'signedIn',
            tenantId: () => 'acme',
            uid: () => 'user-1',
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlayerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, markLessonComplete };
  }

  /** Selects option `optionIndex` of check `kcIndex` and clicks 'Check answer'. */
  function answerCheck(
    fixture: ComponentFixture<PlayerPage>,
    kcIndex: number,
    optionIndex: number,
  ): void {
    const element = fixture.nativeElement as HTMLElement;
    const kc = element.querySelectorAll('.block-kc')[kcIndex];
    kc.querySelectorAll<HTMLButtonElement>('.kc-option')[optionIndex].click();
    fixture.detectChanges();
    kc.querySelector<HTMLButtonElement>('.kc-check')?.click();
    fixture.detectChanges();
  }

  function buttonByLabel(element: HTMLElement, label: string): HTMLButtonElement | undefined {
    return Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes(label),
    );
  }

  it('auto-completes a checked lesson once every check is answered and the end is reached', async () => {
    const { fixture, element, markLessonComplete } = await setup(
      courseWith([lesson('l1', [knowledgeCheck('kc1')]), paragraphLesson('l2')]),
    );
    expect(markLessonComplete).not.toHaveBeenCalled();

    answerCheck(fixture, 0, 0); // correct on the first attempt
    await fixture.whenStable();
    fixture.detectChanges();

    expect(markLessonComplete).toHaveBeenCalledTimes(1);
    expect(markLessonComplete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lessonId: 'l1', knowledgeCheckResults: [true] }),
    );
    // Subtle ember toast + rail checkmark + Next pulse on auto-completion.
    expect(element.querySelector('.complete-toast')?.textContent).toContain('Lesson complete');
    expect(element.querySelector('.lesson-rail .check.done')).toBeTruthy();
    expect(element.querySelector('p-button.pulse-next')).toBeTruthy();
  });

  it('scores by first attempt: a wrong first answer stays wrong even after a correct retry', async () => {
    const { fixture, markLessonComplete } = await setup(
      courseWith([
        lesson('l1', [knowledgeCheck('kc1'), knowledgeCheck('kc2')]),
        paragraphLesson('l2'),
      ]),
    );

    answerCheck(fixture, 0, 1); // kc1 wrong first
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.kc-retry')?.click();
    fixture.detectChanges();
    answerCheck(fixture, 0, 0); // kc1 correct on retry — still scored false
    expect(markLessonComplete).not.toHaveBeenCalled(); // kc2 still unanswered

    answerCheck(fixture, 1, 0); // kc2 correct first
    await fixture.whenStable();
    fixture.detectChanges();

    expect(markLessonComplete).toHaveBeenCalledTimes(1);
    expect(markLessonComplete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lessonId: 'l1', knowledgeCheckResults: [false, true] }),
    );
  });

  it('keeps zero-check lessons manual and sends no knowledgeCheckResults for them', async () => {
    const { fixture, element, markLessonComplete } = await setup(
      courseWith([paragraphLesson('l1'), paragraphLesson('l2')]),
    );
    await fixture.whenStable();
    expect(markLessonComplete).not.toHaveBeenCalled(); // end reached, but no checks

    const cta = buttonByLabel(element, 'Mark lesson complete');
    expect(cta).toBeTruthy();
    cta?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(markLessonComplete).toHaveBeenCalledTimes(1);
    const args = markLessonComplete.mock.calls[0][1];
    expect(args.lessonId).toBe('l1');
    expect(args.knowledgeCheckResults).toBeUndefined();
  });

  it('relabels the fallback CTA on checked lessons and shows the ember rail dot until answered', async () => {
    const { fixture, element } = await setup(
      courseWith([
        lesson('l1', [knowledgeCheck('kc1'), knowledgeCheck('kc2')]),
        paragraphLesson('l2'),
      ]),
    );

    // Visited lesson with unanswered checks → ember dot + fallback CTA label.
    expect(element.querySelector('.lesson-rail .ember-dot')).toBeTruthy();
    expect(buttonByLabel(element, 'Mark complete anyway')).toBeTruthy();
    expect(buttonByLabel(element, 'Mark lesson complete')).toBeFalsy();

    answerCheck(fixture, 0, 0);
    answerCheck(fixture, 1, 0); // all answered → auto-complete → dot gone
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('.lesson-rail .ember-dot')).toBeFalsy();
  });

  it('shows the score and a first-try breakdown on the course completion card', async () => {
    const { fixture, element, markLessonComplete } = await setup(
      courseWith([lesson('l1', [knowledgeCheck('kc1'), knowledgeCheck('kc2')])]),
    );

    answerCheck(fixture, 0, 0); // correct
    answerCheck(fixture, 1, 1); // wrong on the first try
    await fixture.whenStable();
    fixture.detectChanges();

    expect(markLessonComplete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lessonId: 'l1', knowledgeCheckResults: [true, false] }),
    );
    const text = element.textContent ?? '';
    expect(text).toContain('Course complete');
    expect(text).toContain('Knowledge-check score: 50%');
    expect(text).toContain('You nailed 1 of 2');
    expect(text).toContain('checks on the first try');
  });
});
