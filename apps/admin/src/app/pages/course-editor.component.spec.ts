import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, TenantService } from '@forge/auth';
import {
  CourseRepository,
  GameRepository,
  ModuleRepository,
  QuizRepository,
} from '@forge/data-access';
import { CourseAuthoringService } from '@forge/lms-core';
import { CourseEditorComponent } from './course-editor.component';

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

describe('CourseEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseEditorComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        {
          provide: CourseRepository,
          useValue: {
            getById: async () => ({
              id: 'course-1',
              tenantId: 'acme',
              title: 'Test Course',
              description: 'A test course',
              status: 'draft',
              tags: [],
              badgeRefs: [],
              xpReward: 0,
              createdAt: new Date().toISOString(),
            }),
          },
        },
        {
          provide: ModuleRepository,
          useValue: { listOrdered: async () => [] },
        },
        {
          provide: CourseAuthoringService,
          useValue: { addModule: jest.fn() },
        },
        { provide: QuizRepository, useValue: { list: async () => [] } },
        { provide: GameRepository, useValue: { list: async () => [] } },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(CourseEditorComponent);
    // Set required signal input before detectChanges to avoid NG0950
    fixture.componentRef.setInput('id', 'course-1');
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the back link', async () => {
    const fixture = TestBed.createComponent(CourseEditorComponent);
    fixture.componentRef.setInput('id', 'course-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Back to Courses');
  });
});
