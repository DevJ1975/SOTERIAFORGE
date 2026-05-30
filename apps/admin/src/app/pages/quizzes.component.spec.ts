import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment, TenantService } from '@assurance/auth';
import { QuizRepository } from '@assurance/data-access';
import { QuizzesComponent } from './quizzes.component';

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

const sampleQuiz = {
  id: 'quiz-1',
  tenantId: 'acme',
  title: 'Sample Quiz',
  questions: [],
  passThreshold: 70,
  randomize: false,
  scoring: 'percent' as const,
  createdAt: new Date().toISOString(),
};

describe('QuizzesComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuizzesComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: QuizRepository, useValue: { list: async () => [sampleQuiz], set: jest.fn() } },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(QuizzesComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the Quizzes heading', () => {
    const fixture = TestBed.createComponent(QuizzesComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Quizzes');
  });

  it('renders the New Quiz form', async () => {
    const fixture = TestBed.createComponent(QuizzesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('New Quiz');
  });

  it('renders the Create Quiz button', async () => {
    const fixture = TestBed.createComponent(QuizzesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Create Quiz');
  });

  it('loads and displays quizzes from the repository', async () => {
    const fixture = TestBed.createComponent(QuizzesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sample Quiz');
  });
});

describe('QuizzesComponent — create quiz', () => {
  let setMock: jest.Mock;

  beforeEach(async () => {
    // jsdom does not expose crypto.randomUUID — polyfill for this test suite
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => 'test-uuid-quiz' },
      configurable: true,
    });
    setMock = jest.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [QuizzesComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: QuizRepository, useValue: { list: async () => [], set: setMock } },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('calls QuizRepository.set when creating a new quiz', async () => {
    const fixture = TestBed.createComponent(QuizzesComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    // Access protected members via bracket notation for test-only assertion
    const ci = fixture.componentInstance as unknown as Record<string, unknown>;
    ci['newTitle'] = 'My Test Quiz';
    ci['newPassThreshold'] = 80;
    await (ci['createQuiz'] as () => Promise<void>).call(fixture.componentInstance);

    expect(setMock).toHaveBeenCalledWith(
      'acme',
      expect.objectContaining({ title: 'My Test Quiz', tenantId: 'acme' }),
    );
  });
});
