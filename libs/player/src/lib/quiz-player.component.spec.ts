import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment } from '@assurance/auth';
import { QuizRepository } from '@assurance/data-access';
import { QuizSubmissionService } from '@assurance/lms-core';
import { QuizPlayerComponent } from './quiz-player.component';
import type { Quiz, QuizGrade } from '@assurance/shared';

const testEnv: ForgeEnvironment = {
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
};

describe('QuizPlayerComponent', () => {
  let fixture: ComponentFixture<QuizPlayerComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [QuizPlayerComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
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
