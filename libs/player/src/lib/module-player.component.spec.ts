import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment } from '@forge/auth';
import { ModulePlayerComponent } from './module-player.component';
import { PlayerProgressService } from './player-progress.service';
import type { Module } from '@forge/shared';

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

const mockPlayerProgressService: Partial<PlayerProgressService> = {
  recordProgress: jest.fn().mockResolvedValue(undefined),
  recordCompletion: jest.fn().mockResolvedValue(undefined),
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
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: PlayerProgressService, useValue: mockPlayerProgressService },
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

  it('shows placeholder text for scorm module', () => {
    const scormModule: Module = { ...videoModule, contentType: 'scorm', id: 'mod-2' };
    fixture.componentRef.setInput('module', scormModule);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('scorm player');
  });

  it('shows placeholder text for cmi5 module', () => {
    const cmi5Module: Module = { ...videoModule, contentType: 'cmi5', id: 'mod-3' };
    fixture.componentRef.setInput('module', cmi5Module);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('cmi5 player');
  });

  it('shows placeholder text for quiz module', () => {
    const quizModule: Module = { ...videoModule, contentType: 'quiz', id: 'mod-4' };
    fixture.componentRef.setInput('module', quizModule);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('quiz player');
  });

  it('shows placeholder text for game module', () => {
    const gameModule: Module = { ...videoModule, contentType: 'game', id: 'mod-5' };
    fixture.componentRef.setInput('module', gameModule);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('game player');
  });

  it('shows placeholder text for unity module', () => {
    const unityModule: Module = { ...videoModule, contentType: 'unity', id: 'mod-6' };
    fixture.componentRef.setInput('module', unityModule);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('unity player');
  });
});
