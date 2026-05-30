import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment, TenantService } from '@assurance/auth';
import { QuizRepository } from '@assurance/data-access';
import { QuizEditorComponent } from './quiz-editor.component';

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

describe('QuizEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuizEditorComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        {
          provide: QuizRepository,
          useValue: {
            getById: async () => sampleQuiz,
            set: jest.fn(),
          },
        },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(QuizEditorComponent);
    fixture.componentRef.setInput('id', 'quiz-1');
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the back link to quizzes', async () => {
    const fixture = TestBed.createComponent(QuizEditorComponent);
    fixture.componentRef.setInput('id', 'quiz-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Back to Quizzes');
  });

  it('renders the quiz title after loading', async () => {
    const fixture = TestBed.createComponent(QuizEditorComponent);
    fixture.componentRef.setInput('id', 'quiz-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sample Quiz');
  });

  it('renders the Add Question form', async () => {
    const fixture = TestBed.createComponent(QuizEditorComponent);
    fixture.componentRef.setInput('id', 'quiz-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Add Question');
  });

  it('renders the Save Quiz button', async () => {
    const fixture = TestBed.createComponent(QuizEditorComponent);
    fixture.componentRef.setInput('id', 'quiz-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Save Quiz');
  });
});

describe('QuizEditorComponent — save quiz', () => {
  let setMock: jest.Mock;

  beforeEach(async () => {
    setMock = jest.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [QuizEditorComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        {
          provide: QuizRepository,
          useValue: { getById: async () => sampleQuiz, set: setMock },
        },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('calls QuizRepository.set when saving the quiz', async () => {
    const fixture = TestBed.createComponent(QuizEditorComponent);
    fixture.componentRef.setInput('id', 'quiz-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance['saveQuiz']();

    expect(setMock).toHaveBeenCalledWith('acme', expect.objectContaining({ id: 'quiz-1' }));
  });
});
