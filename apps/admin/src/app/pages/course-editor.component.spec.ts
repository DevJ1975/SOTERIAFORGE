import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment, TenantService } from '@assurance/auth';
import {
  CourseRepository,
  GameRepository,
  MemberRepository,
  ModuleRepository,
  QuizRepository,
} from '@assurance/data-access';
import { AssignmentService, CourseAuthoringService } from '@assurance/lms-core';
import { CourseEditorComponent } from './course-editor.component';

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

describe('CourseEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseEditorComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
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
        { provide: MemberRepository, useValue: { listActive: async () => [] } },
        {
          provide: AssignmentService,
          useValue: { assign: jest.fn(async () => ({ assigned: 1, skipped: 0 })) },
        },
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
