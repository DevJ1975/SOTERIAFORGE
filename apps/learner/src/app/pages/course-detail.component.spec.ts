import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import {
  ASSURANCE_ENV,
  type AssuranceEnvironment,
  AuthService,
  TenantService,
} from '@assurance/auth';
import { ModuleRepository, EnrollmentRepository } from '@assurance/data-access';
import { EnrollmentService } from '@assurance/lms-core';
import { PlayerProgressService } from '@assurance/player';
import { TutorService, TUTOR_FUNCTIONS } from '@assurance/ai-tutor';
import { CourseDetailComponent } from './course-detail.component';
import type { Enrollment, Module, ChatMessage } from '@assurance/shared';
import { of } from 'rxjs';

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

const mockModule: Module = {
  id: 'mod-1',
  courseId: 'course-1',
  tenantId: 'tenant-1',
  title: 'Lesson 1',
  order: 1,
  contentType: 'video',
  externalUrl: 'https://www.youtube.com/watch?v=test',
  xpReward: 0,
  badgeRefs: [],
  completion: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockEnrollment: Enrollment = {
  uid: 'user-1',
  courseId: 'course-1',
  tenantId: 'tenant-1',
  progressPct: 0,
  completed: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockModuleRepository: Partial<ModuleRepository> = {
  listOrdered: jest.fn().mockResolvedValue([mockModule]),
};

const mockEnrollmentRepository: Partial<EnrollmentRepository> = {
  get: jest.fn().mockResolvedValue(mockEnrollment),
  watch: jest.fn().mockReturnValue(of(mockEnrollment)),
  upsert: jest.fn().mockResolvedValue(undefined),
};

const mockEnrollmentService: Partial<EnrollmentService> = {
  enroll: jest.fn().mockResolvedValue(mockEnrollment),
};

const mockAuthService = {
  principal: () => ({
    uid: 'user-1',
    email: 'test@example.com',
    claims: { role: 'learner', tenantId: 'tenant-1' },
  }),
};

const mockTenantService = {
  tenantId: () => 'tenant-1',
};

const mockPlayerProgressService: Partial<PlayerProgressService> = {
  recordProgress: jest.fn().mockResolvedValue(undefined),
  recordCompletion: jest.fn().mockResolvedValue(undefined),
};

const mockTutorMessages = signal<ChatMessage[]>([]);
const mockTutorPending = signal(false);
const mockTutorError = signal<string | null>(null);

const mockTutorService = {
  messages: mockTutorMessages.asReadonly(),
  pending: mockTutorPending.asReadonly(),
  error: mockTutorError.asReadonly(),
  ask: jest.fn(),
};

describe('CourseDetailComponent', () => {
  let fixture: ComponentFixture<CourseDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: ModuleRepository, useValue: mockModuleRepository },
        { provide: EnrollmentRepository, useValue: mockEnrollmentRepository },
        { provide: EnrollmentService, useValue: mockEnrollmentService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: PlayerProgressService, useValue: mockPlayerProgressService },
        { provide: TutorService, useValue: mockTutorService },
        { provide: TUTOR_FUNCTIONS, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CourseDetailComponent);
    fixture.componentRef.setInput('id', 'course-1');
  });

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders loading state then module list', async () => {
    fixture.detectChanges();
    // Wait for all microtasks (Promise chains from ngOnInit)
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Course: course-1');
  });

  it('shows module title after loading', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Lesson 1');
  });

  it('auto-enrolls when no enrollment exists', async () => {
    (mockEnrollmentRepository.get as jest.Mock).mockResolvedValueOnce(null);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(mockEnrollmentService.enroll).toHaveBeenCalledWith('tenant-1', 'course-1', 'user-1');
  });

  it('does not enroll again when enrollment already exists', async () => {
    jest.clearAllMocks();
    (mockEnrollmentRepository.get as jest.Mock).mockResolvedValueOnce(mockEnrollment);
    (mockEnrollmentRepository.watch as jest.Mock).mockReturnValue(of(mockEnrollment));

    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(mockEnrollmentService.enroll).not.toHaveBeenCalled();
  });
});
