import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LearningApi } from '@assurance/lms-core';
import type { ApiCourse, ApiMyEnrollment } from '@assurance/lms-core';
import { CoursesComponent } from './courses.component';

const course = (id: string, title: string): ApiCourse => ({
  id,
  title,
  description: `About ${title}`,
  status: 'published',
  tags: [],
  availableOffline: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const enrollment = (courseId: string, over: Partial<ApiMyEnrollment> = {}): ApiMyEnrollment => ({
  id: `e-${courseId}`,
  courseId,
  memberId: 'm1',
  assigned: false,
  dueAt: null,
  progressPct: 0,
  completedAt: null,
  lastActivityAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  course: { id: courseId, title: 'x' },
  nextLesson: null,
  ...over,
});

async function flush(fixture: ComponentFixture<CoursesComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('CoursesComponent', () => {
  const api = { courses: jest.fn(), myEnrollments: jest.fn() };
  let fixture: ComponentFixture<CoursesComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();
    api.courses.mockResolvedValue([course('c1', 'Intro to Testing')]);
    api.myEnrollments.mockResolvedValue([]);
    await TestBed.configureTestingModule({
      imports: [CoursesComponent],
      providers: [provideRouter([]), { provide: LearningApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(CoursesComponent);
  });

  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('shows a loading state first', () => {
    fixture.detectChanges();
    expect(text()).toContain('Loading courses');
  });

  it('lists courses with a link to the course', async () => {
    await flush(fixture);
    expect(text()).toContain('Intro to Testing');
    const a = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(a?.getAttribute('href')).toBe('/courses/c1');
  });

  it('shows empty message when there are no courses', async () => {
    api.courses.mockResolvedValue([]);
    await flush(fixture);
    expect(text()).toContain('No published courses');
  });

  it('shows Assigned tag, due date and progress for an assigned enrollment', async () => {
    api.myEnrollments.mockResolvedValue([
      enrollment('c1', { assigned: true, dueAt: '2026-12-31T00:00:00Z', progressPct: 40 }),
    ]);
    await flush(fixture);
    expect(text()).toContain('Assigned');
    expect(text()).toContain('Due: 2026-12-31');
    expect(text()).toContain('Progress: 40%');
  });

  it('does not show Assigned for an unassigned enrollment', async () => {
    api.myEnrollments.mockResolvedValue([enrollment('c1')]);
    await flush(fixture);
    expect(text()).not.toContain('Assigned');
  });

  it('shows an error with retry when loading fails', async () => {
    api.courses.mockRejectedValueOnce(new Error('boom'));
    await flush(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not load courses');
    (el.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await flush(fixture);
    expect(text()).toContain('Intro to Testing');
  });
});
