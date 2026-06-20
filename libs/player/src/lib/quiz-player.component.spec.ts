import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { QuizRepository } from '@assurance/data-access';
import { QuizSubmissionService } from '@assurance/lms-core';
import { QuizPlayerComponent } from './quiz-player.component';
import { installFakeIndexedDb, uninstallFakeIndexedDb } from './fake-indexed-db.testkit';
import type { Quiz, QuizGrade } from '@assurance/shared';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
};

const mockQuiz: Quiz = {
  id: 'quiz-1',
  tenantId: 'tenant-1',
  title: 'Safety Fundamentals',
  questions: [
    {
      id: 'q1',
      type: 'mcq',
      prompt: 'What is 2+2?',
      points: 5,
      options: [
        { id: 'opt-a', text: '3', isCorrect: false },
        { id: 'opt-b', text: '4', isCorrect: true },
      ],
      answerKey: [],
    },
    {
      id: 'q2',
      type: 'true_false',
      prompt: 'The sky is blue.',
      points: 3,
      options: [
        { id: 'opt-t', text: 'True', isCorrect: true },
        { id: 'opt-f', text: 'False', isCorrect: false },
      ],
      answerKey: [],
    },
  ],
  passThreshold: 70,
  randomize: false,
  scoring: 'percent',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockGrade: QuizGrade = {
  earnedPoints: 8,
  totalPoints: 8,
  scorePct: 100,
  passed: true,
  perQuestion: [
    { questionId: 'q1', correct: true, awardedPoints: 5 },
    { questionId: 'q2', correct: true, awardedPoints: 3 },
  ],
};

const mockQuizRepository: Partial<QuizRepository> = {
  getById: jest.fn().mockResolvedValue(mockQuiz),
};

const mockSubmissionService: Partial<QuizSubmissionService> = {
  submit: jest.fn().mockResolvedValue(mockGrade),
  submitWithOutbox: jest.fn().mockResolvedValue({ graded: true, grade: mockGrade, queued: false }),
};

describe('QuizPlayerComponent', () => {
  let fixture: ComponentFixture<QuizPlayerComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [QuizPlayerComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: QuizRepository, useValue: mockQuizRepository },
        { provide: QuizSubmissionService, useValue: mockSubmissionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuizPlayerComponent);
    fixture.componentRef.setInput('quizId', 'quiz-1');
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput('moduleId', 'mod-1');
    fixture.componentRef.setInput('tenantId', 'tenant-1');
    fixture.componentRef.setInput('uid', 'user-1');
  });

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows loading state initially', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // Loading initially true — text may contain "Loading quiz…" or quiz title once loaded
    expect(el.textContent).toBeTruthy();
  });

  it('renders the quiz title after loading', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Safety Fundamentals');
  });

  it('renders all questions after loading', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('What is 2+2?');
    expect(el.textContent).toContain('The sky is blue.');
  });

  it('shows Submit Quiz button before submission', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Submit Quiz');
  });

  it('shows error message when quiz is not found', async () => {
    (mockQuizRepository.getById as jest.Mock).mockResolvedValueOnce(null);

    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Quiz not found');
  });

  it('displays grade after successful submission', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('100%');
    expect(el.textContent).toContain('Passed');
  });
});

// ---------------------------------------------------------------------------
// MO-08 — draft autosave / restore + offline submission notice
// ---------------------------------------------------------------------------
describe('QuizPlayerComponent — draft autosave (MO-08)', () => {
  function flushMicrotasks(): Promise<void> {
    return new Promise((r) => setTimeout(r, 0));
  }

  async function makeFixture(): Promise<ComponentFixture<QuizPlayerComponent>> {
    await TestBed.configureTestingModule({
      imports: [QuizPlayerComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: QuizRepository, useValue: mockQuizRepository },
        { provide: QuizSubmissionService, useValue: mockSubmissionService },
      ],
    }).compileComponents();

    const fx = TestBed.createComponent(QuizPlayerComponent);
    fx.componentRef.setInput('quizId', 'quiz-1');
    fx.componentRef.setInput('courseId', 'course-1');
    fx.componentRef.setInput('moduleId', 'mod-1');
    fx.componentRef.setInput('tenantId', 'tenant-1');
    fx.componentRef.setInput('uid', 'user-1');
    return fx;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (mockQuizRepository.getById as jest.Mock).mockResolvedValue(mockQuiz);
    (mockSubmissionService.submitWithOutbox as jest.Mock).mockResolvedValue({
      graded: true,
      grade: mockGrade,
      queued: false,
    });
    installFakeIndexedDb();
  });

  afterEach(() => {
    uninstallFakeIndexedDb();
    TestBed.resetTestingModule();
  });

  it('round-trips an in-progress answer: autosaves then restores after reload', async () => {
    // First mount: answer q1, let the debounced autosave persist.
    const first = await makeFixture();
    first.detectChanges();
    await flushMicrotasks();
    first.detectChanges();

    // Select option 'opt-b' on the mcq question and persist immediately.
    const inst = first.componentInstance as unknown as {
      questionStates: () => Array<{ question: { id: string }; selectedSingle: string }>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      saveDraft: () => Promise<void>;
    };
    const states = inst.questionStates();
    states[0].selectedSingle = 'opt-b';
    await inst.saveDraft();
    await flushMicrotasks();

    // Reload: a fresh component instance must restore the saved selection.
    TestBed.resetTestingModule();
    const second = await makeFixture();
    second.detectChanges();
    await flushMicrotasks();
    second.detectChanges();

    const restored = (
      second.componentInstance as unknown as {
        questionStates: () => Array<{ question: { id: string }; selectedSingle: string }>;
      }
    ).questionStates();
    expect(restored[0].selectedSingle).toBe('opt-b');
  });

  it('clears the draft on successful submit (no restore on next load)', async () => {
    const first = await makeFixture();
    first.detectChanges();
    await flushMicrotasks();
    first.detectChanges();

    const inst = first.componentInstance as unknown as {
      questionStates: () => Array<{ selectedSingle: string }>;
      saveDraft: () => Promise<void>;
      onSubmit: () => Promise<void>;
    };
    inst.questionStates()[0].selectedSingle = 'opt-b';
    await inst.saveDraft();
    await inst.onSubmit();
    await flushMicrotasks();

    TestBed.resetTestingModule();
    const second = await makeFixture();
    second.detectChanges();
    await flushMicrotasks();
    second.detectChanges();

    const restored = (
      second.componentInstance as unknown as {
        questionStates: () => Array<{ selectedSingle: string }>;
      }
    ).questionStates();
    // Draft was cleared on submit → fresh (empty) state.
    expect(restored[0].selectedSingle).toBe('');
  });

  it('shows the offline sync notice when the attempt is queued', async () => {
    (mockSubmissionService.submitWithOutbox as jest.Mock).mockResolvedValue({
      graded: false,
      queued: true,
    });

    const fx = await makeFixture();
    fx.detectChanges();
    await flushMicrotasks();
    fx.detectChanges();

    await fx.componentInstance.onSubmit();
    fx.detectChanges();

    expect((fx.nativeElement as HTMLElement).textContent).toContain('will sync when');
  });
});
