import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import {
  ASSURANCE_ENV,
  type AssuranceEnvironment,
  AuthService,
  TenantService,
} from '@assurance/auth';
import { ModuleRepository, EnrollmentRepository, CourseRepository } from '@assurance/data-access';
import { EnrollmentService } from '@assurance/lms-core';
import { PlayerProgressService, DownloadService } from '@assurance/player';
import { TutorService, TUTOR_FUNCTIONS } from '@assurance/ai-tutor';
import { CourseDetailComponent } from './course-detail.component';
import type { Course, Enrollment, Module, ChatMessage } from '@assurance/shared';
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
  estimatedMinutes: 5,
  xpReward: 0,
  badgeRefs: [],
  completion: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockModule2: Module = {
  id: 'mod-2',
  courseId: 'course-1',
  tenantId: 'tenant-1',
  title: 'Lesson 2',
  order: 2,
  contentType: 'video',
  externalUrl: 'https://www.youtube.com/watch?v=test2',
  estimatedMinutes: 7,
  xpReward: 0,
  badgeRefs: [],
  completion: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockCourse: Course = {
  id: 'course-1',
  tenantId: 'tenant-1',
  title: 'Test Course',
  description: '',
  status: 'published',
  tags: [],
  badgeRefs: [],
  xpReward: 0,
  availableOffline: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockCourseRepository: Partial<CourseRepository> = {
  getById: jest.fn().mockResolvedValue(mockCourse),
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
  listOrdered: jest.fn().mockResolvedValue([mockModule, mockModule2]),
};

const mockEnrollmentRepository: Partial<EnrollmentRepository> = {
  get: jest.fn().mockResolvedValue(mockEnrollment),
  watch: jest.fn().mockReturnValue(of(mockEnrollment)),
  upsert: jest.fn().mockResolvedValue(undefined),
};

const mockEnrollmentService: Partial<EnrollmentService> = {
  enroll: jest.fn().mockResolvedValue(mockEnrollment),
  markModuleComplete: jest.fn().mockResolvedValue(undefined),
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
        { provide: CourseRepository, useValue: mockCourseRepository },
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

  it('shows the offline download control for an offline-available course (MO-07)', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Download for offline');
  });

  it('flags YouTube/Vimeo modules as "Requires connection" (MO-07)', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const comp = fixture.componentInstance as unknown as {
      requiresConnection(id: string): boolean;
      cacheableCount(): number;
    };
    // mockModule is a YouTube URL → not cacheable.
    expect(comp.requiresConnection('mod-1')).toBe(true);
    expect(comp.cacheableCount()).toBe(0);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Requires connection');
  });

  // ----- MO-14: estimated duration + stepped/focused mode -----

  async function load(): Promise<void> {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }

  it('renders the per-module estimated duration (MO-14)', async () => {
    await load();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('5 min');
    expect(el.textContent).toContain('7 min');
  });

  it('sums module minutes into a course-level total (MO-14)', async () => {
    await load();
    const comp = fixture.componentInstance as unknown as { totalEstimatedMinutes(): number };
    expect(comp.totalEstimatedMinutes()).toBe(12);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Total: 12 min');
  });

  it('toggles into stepped/focused mode showing "1 of M" and large controls (MO-14)', async () => {
    await load();
    const comp = fixture.componentInstance as unknown as {
      toggleStepped(): void;
      stepped(): boolean;
    };
    comp.toggleStepped();
    fixture.detectChanges();

    expect(comp.stepped()).toBe(true);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('1 of 2');
    expect(el.textContent).toContain('Continue');
    expect(el.textContent).toContain('Back');
  });

  it('advances and rewinds steps with Next/Back, keeping selection in sync (MO-14)', async () => {
    await load();
    const comp = fixture.componentInstance as unknown as {
      toggleStepped(): void;
      nextStep(): void;
      prevStep(): void;
      stepIndex(): number;
      isFirstStep(): boolean;
      isLastStep(): boolean;
      selectedModule(): Module | null;
    };
    comp.toggleStepped();
    fixture.detectChanges();
    expect(comp.stepIndex()).toBe(0);
    expect(comp.isFirstStep()).toBe(true);

    comp.nextStep();
    fixture.detectChanges();
    expect(comp.stepIndex()).toBe(1);
    expect(comp.isLastStep()).toBe(true);
    // The player follows the step.
    expect(comp.selectedModule()?.id).toBe('mod-2');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2 of 2');

    comp.prevStep();
    fixture.detectChanges();
    expect(comp.stepIndex()).toBe(0);
    expect(comp.selectedModule()?.id).toBe('mod-1');
  });

  it('does not advance past the last step (MO-14)', async () => {
    await load();
    const comp = fixture.componentInstance as unknown as {
      toggleStepped(): void;
      nextStep(): void;
      stepIndex(): number;
    };
    comp.toggleStepped();
    comp.nextStep();
    comp.nextStep(); // already last — should be a no-op
    fixture.detectChanges();
    expect(comp.stepIndex()).toBe(1);
  });
});
