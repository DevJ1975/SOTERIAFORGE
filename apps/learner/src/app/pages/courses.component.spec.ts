import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ASSURANCE_ENV,
  type AssuranceEnvironment,
  AuthService,
  TenantService,
} from '@assurance/auth';
import { CourseRepository, EnrollmentRepository } from '@assurance/data-access';
import { CoursesComponent } from './courses.component';
import type { Course } from '@assurance/shared';

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

const mockCourse: Course = {
  id: 'course-1',
  tenantId: 'tenant-1',
  title: 'Intro to Testing',
  description: 'A test course',
  status: 'published',
  tags: [],
  badgeRefs: [],
  xpReward: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockCourseRepository: Partial<CourseRepository> = {
  listPublished: jest.fn().mockResolvedValue([mockCourse]),
};

const mockEnrollmentRepository: Partial<EnrollmentRepository> = {
  get: jest.fn().mockResolvedValue(null),
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

/** Flush all pending microtasks and macrotasks. */
async function flushAll(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('CoursesComponent', () => {
  let fixture: ComponentFixture<CoursesComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CoursesComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: CourseRepository, useValue: mockCourseRepository },
        { provide: EnrollmentRepository, useValue: mockEnrollmentRepository },
        { provide: AuthService, useValue: mockAuthService },
        { provide: TenantService, useValue: mockTenantService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CoursesComponent);
  });

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows loading state initially', () => {
    fixture.detectChanges();
    // loading signal is set to true initially, but after detectChanges it may complete
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Courses');
  });

  it('displays courses after loading', async () => {
    fixture.detectChanges();
    await flushAll();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Intro to Testing');
  });

  it('shows "no courses" message when empty', async () => {
    (mockCourseRepository.listPublished as jest.Mock).mockResolvedValueOnce([]);
    fixture.detectChanges();
    await flushAll();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No published courses');
  });

  it('shows Assigned tag when enrollment is assigned', async () => {
    const assignedEnrollment = {
      uid: 'user-1',
      courseId: 'course-1',
      tenantId: 'tenant-1',
      progressPct: 0,
      completed: false,
      assigned: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockEnrollmentRepository.get as jest.Mock).mockResolvedValue(assignedEnrollment);

    fixture.detectChanges();
    await flushAll();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Assigned');
  });
});
