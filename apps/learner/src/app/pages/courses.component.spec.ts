import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, TenantService } from '@forge/auth';
import { CourseRepository } from '@forge/data-access';
import { CoursesComponent } from './courses.component';
import type { Course } from '@forge/shared';

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

const mockTenantService = {
  tenantId: () => 'tenant-1',
};

describe('CoursesComponent', () => {
  let fixture: ComponentFixture<CoursesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoursesComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: CourseRepository, useValue: mockCourseRepository },
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
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Intro to Testing');
  });

  it('shows "no courses" message when empty', async () => {
    (mockCourseRepository.listPublished as jest.Mock).mockResolvedValueOnce([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No published courses');
  });
});
