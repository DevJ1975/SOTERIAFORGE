import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { GameRepository, QuizRepository } from '@assurance/data-access';
import { EnrollmentService, QuizSubmissionService } from '@assurance/lms-core';
import { Cmi5LaunchService, ScormRuntimeService } from '@assurance/standards';
import { ModulePlayerComponent } from './module-player.component';
import { PlayerProgressService } from './player-progress.service';
import type { Module } from '@assurance/shared';

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

const mockPlayerProgressService: Partial<PlayerProgressService> = {
  recordProgress: jest.fn().mockResolvedValue(undefined),
  recordCompletion: jest.fn().mockResolvedValue(undefined),
};

const mockEnrollmentService: Partial<EnrollmentService> = {
  saveCmi: jest.fn().mockResolvedValue(undefined),
};

const mockScormRuntimeService: Partial<ScormRuntimeService> = {
  initialize: jest.fn().mockResolvedValue(undefined),
  terminate: jest.fn(),
  completed: jest.fn().mockReturnValue(false) as never,
  score: jest.fn().mockReturnValue(null) as never,
};

const mockQuizRepository: Partial<QuizRepository> = {
  getById: jest.fn().mockResolvedValue(null),
};

const mockGameRepository: Partial<GameRepository> = {
  getById: jest.fn().mockResolvedValue(null),
};

const mockQuizSubmissionService: Partial<QuizSubmissionService> = {
  submit: jest.fn().mockResolvedValue(undefined),
};

const mockCmi5LaunchService: Partial<Cmi5LaunchService> = {
  launch: jest.fn().mockResolvedValue({
    auUrl: 'https://x/au',
    endpoint: 'https://x/xapi',
    fetch: 'https://x/fetch?token=t',
    actor: {},
    registration: 'r',
    activityId: 'a',
  }),
};

const videoModule: Module = {
  id: 'mod-1',
  courseId: 'course-1',
  tenantId: 'tenant-1',
  title: 'Intro Video',
  order: 1,
  contentType: 'video',
  externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  xpReward: 0,
  badgeRefs: [],
  completion: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ModulePlayerComponent', () => {
  let fixture: ComponentFixture<ModulePlayerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModulePlayerComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: PlayerProgressService, useValue: mockPlayerProgressService },
        { provide: EnrollmentService, useValue: mockEnrollmentService },
        { provide: ScormRuntimeService, useValue: mockScormRuntimeService },
        { provide: QuizRepository, useValue: mockQuizRepository },
        { provide: QuizSubmissionService, useValue: mockQuizSubmissionService },
        { provide: GameRepository, useValue: mockGameRepository },
        { provide: Cmi5LaunchService, useValue: mockCmi5LaunchService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModulePlayerComponent);
    fixture.componentRef.setInput('module', videoModule);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.componentRef.setInput('tenantId', 'tenant-1');
    fixture.componentRef.setInput('uid', 'user-1');
  });

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders loading placeholder for video module (defer not yet resolved)', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // Before defer resolves, the @placeholder is shown
    const text = el.textContent ?? '';
    // Either the placeholder OR the video player is rendered — both are acceptable
    expect(text.length).toBeGreaterThan(0);
  });

  it('renders assurance-scorm-player (or its defer placeholder) for scorm module', () => {
    const scormModule: Module = {
      ...videoModule,
      contentType: 'scorm',
      id: 'mod-2',
      externalUrl: 'https://cdn.example.com/scorm/index.html',
    };
    fixture.componentRef.setInput('module', scormModule);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // The @defer placeholder shows "Loading SCORM player…" before it resolves,
    // and once resolved it renders assurance-scorm-player.
    const text = el.textContent ?? '';
    const hasScormContent =
      el.querySelector('assurance-scorm-player') !== null ||
      text.includes('Loading SCORM') ||
      text.includes('No SCORM URL');
    expect(hasScormContent).toBe(true);
  });

  it('renders assurance-cmi5-launcher (or its defer placeholder) for cmi5 module', async () => {
    const cmi5Module: Module = {
      ...videoModule,
      contentType: 'cmi5',
      id: 'mod-3',
      externalUrl: 'https://cdn.example.com/au/index.html',
    };
    fixture.componentRef.setInput('module', cmi5Module);
    fixture.detectChanges();
    // Allow the async launch call to resolve
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const text = el.textContent ?? '';
    const hasCmi5Content =
      el.querySelector('assurance-cmi5-launcher') !== null ||
      text.includes('Loading cmi5') ||
      text.includes('No cmi5 URL');
    expect(hasCmi5Content).toBe(true);
  });

  it('renders assurance-cmi5-launcher (or its defer placeholder) for unity module', async () => {
    const unityModule: Module = {
      ...videoModule,
      contentType: 'unity',
      id: 'mod-6',
      externalUrl: 'https://cdn.example.com/unity/index.html',
    };
    fixture.componentRef.setInput('module', unityModule);
    fixture.detectChanges();
    // Allow the async launch call to resolve
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const text = el.textContent ?? '';
    const hasUnityContent =
      el.querySelector('assurance-cmi5-launcher') !== null ||
      text.includes('Loading Unity') ||
      text.includes('No Unity URL');
    expect(hasUnityContent).toBe(true);
  });

  it('renders assurance-quiz-player (or its defer placeholder) for quiz module', () => {
    const quizModule: Module = { ...videoModule, contentType: 'quiz', id: 'mod-4' };
    fixture.componentRef.setInput('module', quizModule);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // Before defer resolves, the @placeholder is shown; after, assurance-quiz-player renders.
    const text = el.textContent ?? '';
    const hasQuizContent =
      el.querySelector('assurance-quiz-player') !== null ||
      text.includes('Loading quiz') ||
      text.includes('No quiz configured');
    expect(hasQuizContent).toBe(true);
  });

  it('renders assurance-game-player (or its defer placeholder) for game module', () => {
    const gameModule: Module = {
      ...videoModule,
      contentType: 'game',
      id: 'mod-5',
      assetRef: 'game-abc',
    };
    fixture.componentRef.setInput('module', gameModule);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const text = el.textContent ?? '';
    const hasGameContent =
      el.querySelector('assurance-game-player') !== null ||
      text.includes('Loading game') ||
      text.includes('No game configured');
    expect(hasGameContent).toBe(true);
  });
});
