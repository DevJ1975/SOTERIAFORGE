import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ASSURANCE_ENV, type AssuranceEnvironment, AuthService } from '@assurance/auth';
import { ModuleCompletionService, QuizSubmissionService } from '@assurance/lms-core';
import { OfflineXapiQueue } from '@assurance/standards';
import { AppComponent } from './app.component';

const transloco = () =>
  TranslocoTestingModule.forRoot({
    langs: { en: {} },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });
const authStub = { principal: signal(null), signOutUser: jest.fn() };

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

describe('Learner AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, transloco()],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
  });

  it('creates and renders the brand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Soteria Assurance');
  });
});

// ---------------------------------------------------------------------------
// FIX-6 — offline banner aggregates all three pending counts
// ---------------------------------------------------------------------------
describe('Learner AppComponent — aggregated pending count (FIX-6)', () => {
  const xapiCount = signal(0);
  const quizCount = signal(0);
  const completionCount = signal(0);

  beforeEach(async () => {
    xapiCount.set(0);
    quizCount.set(0);
    completionCount.set(0);
    await TestBed.configureTestingModule({
      imports: [AppComponent, transloco()],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: authStub },
        { provide: OfflineXapiQueue, useValue: { pendingCount: xapiCount.asReadonly() } },
        { provide: QuizSubmissionService, useValue: { pendingCount: quizCount.asReadonly() } },
        {
          provide: ModuleCompletionService,
          useValue: { pendingCount: completionCount.asReadonly() },
        },
      ],
    }).compileComponents();
  });

  it('sums the xAPI, quiz-outbox, and completion-outbox pending counts', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const inst = fixture.componentInstance as unknown as { pendingCount: () => number };

    expect(inst.pendingCount()).toBe(0);

    xapiCount.set(2);
    quizCount.set(3);
    completionCount.set(1);
    expect(inst.pendingCount()).toBe(6);
  });
});
