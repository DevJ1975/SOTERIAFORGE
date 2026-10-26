import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
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
    expect(fixture.nativeElement.textContent).toContain('Soteria Forge');
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

// ---------------------------------------------------------------------------
// Soteria Forge shell — route data drives crumbs, bare (auth) and dark (Engage)
// ---------------------------------------------------------------------------
describe('Learner AppComponent — Forge shell route hooks', () => {
  @Component({ standalone: true, template: '<h1>Page</h1>' })
  class StubPage {}

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, transloco()],
      providers: [
        provideRouter([
          { path: '', component: StubPage, data: { crumbs: [{ label: 'Home' }] } },
          { path: 'login', component: StubPage, data: { sfShell: 'none' } },
          { path: 'engage', component: StubPage, data: { sfShell: 'dark', crumbs: [{ label: 'Engage' }] } },
        ]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
  });

  async function go(url: string) {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the rail + breadcrumb from route data', async () => {
    const el = await go('/');
    expect(el.querySelectorAll('nav.sf-rail .sf-rail__item').length).toBe(6);
    expect(el.querySelector('nav[aria-label="Breadcrumb"] [aria-current="page"]')?.textContent).toBe(
      'Home',
    );
  });

  it('drops the chrome on auth pages (sfShell: none)', async () => {
    const el = await go('/login');
    expect(el.querySelector('nav.sf-rail')).toBeNull();
    expect(el.querySelector('main#main-content h1')).not.toBeNull();
  });

  it('switches to the dark Engage variant (sfShell: dark)', async () => {
    const el = await go('/engage');
    expect(el.querySelector('sf-app-shell')?.classList).toContain('sf-shell--dark');
  });
});
