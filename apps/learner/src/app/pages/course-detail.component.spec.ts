import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService, TenantService } from '@assurance/auth';
import { TutorService } from '@assurance/ai-tutor';
import { LearningApi, type ApiCourseOutline } from '@assurance/lms-core';
import { CourseDetailComponent } from './course-detail.component';

function outline(overrides: Partial<ApiCourseOutline> = {}): ApiCourseOutline {
  return {
    id: 'c1',
    title: 'Intro to Safety',
    description: 'Learn the basics',
    status: 'published',
    tags: [],
    availableOffline: false,
    createdAt: '',
    updatedAt: '',
    enrollment: {
      id: 'e1',
      courseId: 'c1',
      memberId: 'm1',
      assigned: false,
      dueAt: null,
      progressPct: 40,
      completedAt: null,
      lastActivityAt: null,
      createdAt: '',
    },
    modules: [
      {
        id: 'm1',
        courseId: 'c1',
        title: 'Foundations',
        label: 'Week 5',
        order: 1,
        lessons: [
          {
            id: 'l1',
            title: 'Hazards',
            order: 1,
            contentType: 'video',
            estimatedMinutes: 10,
            frameworkTags: ['OSHA'],
            hasQuiz: true,
            completed: true,
          },
          {
            id: 'l2',
            title: 'PPE',
            order: 2,
            contentType: 'scorm',
            estimatedMinutes: 5,
            frameworkTags: [],
            hasQuiz: false,
            completed: false,
          },
        ],
      },
    ],
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('CourseDetailComponent', () => {
  let fixture: ComponentFixture<CourseDetailComponent>;
  const api = { course: jest.fn(), enroll: jest.fn() };

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(CourseDetailComponent);
    fixture.componentRef.setInput('id', 'c1');
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [CourseDetailComponent],
      providers: [
        provideRouter([]),
        { provide: LearningApi, useValue: api },
        { provide: AuthService, useValue: { principal: () => null } },
        { provide: TenantService, useValue: { tenantId: () => null } },
        { provide: TutorService, useValue: {} },
      ],
    });
  });

  it('shows a loading state first', () => {
    api.course.mockReturnValue(new Promise(() => undefined));
    fixture = TestBed.createComponent(CourseDetailComponent);
    fixture.componentRef.setInput('id', 'c1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading course');
  });

  it('renders title, progress, total minutes, module label and lessons', async () => {
    api.course.mockResolvedValue(outline());
    const el = await render();
    const text = el.textContent ?? '';
    expect(text).toContain('Intro to Safety');
    expect(text).toContain('40% complete');
    expect(text).toContain('Total: 15 min');
    expect(text).toContain('Week 5');
    expect(text).toContain('Knowledge check');
    expect(text).toContain('OSHA');
    expect(text).toContain('Completed');
    expect(text).toContain('Not completed');
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('a.cd__lesson'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/courses/c1/lessons/l1',
      '/courses/c1/lessons/l2',
    ]);
    expect(api.enroll).not.toHaveBeenCalled();
  });

  it('enrolls a published course with no enrollment, then refreshes', async () => {
    api.course
      .mockResolvedValueOnce(outline({ enrollment: null }))
      .mockResolvedValueOnce(outline());
    api.enroll.mockResolvedValue({});
    const el = await render();
    expect(api.enroll).toHaveBeenCalledWith('c1');
    expect(api.course).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('40% complete');
  });

  it('does not enroll in an unpublished course', async () => {
    api.course.mockResolvedValue(outline({ enrollment: null, status: 'draft' }));
    await render();
    expect(api.enroll).not.toHaveBeenCalled();
  });

  it('shows the API error and retries', async () => {
    api.course.mockImplementationOnce(async () => {
      throw new HttpErrorResponse({ status: 404, error: { detail: 'Course not found.' } });
    });
    const el = await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Course not found.');

    api.course.mockResolvedValue(outline());
    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Intro to Safety');
  });
});
