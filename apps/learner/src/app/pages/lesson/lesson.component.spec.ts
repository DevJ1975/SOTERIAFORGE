import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LearningApi, type ApiCourseOutline, type ApiLesson } from '@assurance/lms-core';
import { LessonComponent } from './lesson.component';

function lesson(over: Partial<ApiLesson> = {}): ApiLesson {
  return {
    id: 'l2',
    courseId: 'c1',
    moduleId: 'm1',
    moduleTitle: 'Secure',
    moduleLabel: 'Secure I',
    title: 'Prompt injection',
    order: 2,
    contentType: 'cmi5',
    assetRef: '',
    externalUrl: 'https://example.com/launch',
    scormVersion: '',
    estimatedMinutes: 8,
    frameworkTags: ['OWASP LLM01:2025'],
    keyPoints: [{ title: 'Validate input', body: 'Always.' }],
    quiz: null,
    progress: null,
    ...over,
  };
}

const summary = (id: string, title: string) => ({
  id,
  title,
  order: 1,
  contentType: 'video' as const,
  estimatedMinutes: 5,
  frameworkTags: [],
  hasQuiz: false,
  completed: false,
});

const outline = {
  id: 'c1',
  modules: [
    {
      id: 'm1',
      courseId: 'c1',
      title: 'Secure',
      label: 'Secure I',
      order: 1,
      lessons: [
        summary('l1', 'Intro'),
        summary('l2', 'Prompt injection'),
        summary('l3', 'Wrap up'),
      ],
    },
  ],
  enrollment: null,
} as unknown as ApiCourseOutline;

describe('LessonComponent', () => {
  let api: { lesson: jest.Mock; course: jest.Mock; complete: jest.Mock; enroll: jest.Mock };
  let fixture: ComponentFixture<LessonComponent>;
  const el = (): HTMLElement => fixture.nativeElement;

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(LessonComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('lessonId', 'l2');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = {
      lesson: jest.fn(),
      course: jest.fn().mockResolvedValue(outline),
      complete: jest.fn(),
      enroll: jest.fn().mockResolvedValue({}),
    };
    TestBed.configureTestingModule({
      imports: [LessonComponent],
      providers: [provideRouter([]), { provide: LearningApi, useValue: api }],
    });
  });

  it('renders label, tags, key points, open link and prev/next', async () => {
    api.lesson.mockResolvedValue(lesson());
    await create();
    const text = el().textContent ?? '';
    expect(text).toContain('SECURE I · LESSON 2 OF 3');
    expect(text).toContain('OWASP LLM01:2025');
    expect(text).toContain('About 8 min');
    expect(text).toContain('Validate input');
    expect(text).toContain('Open cmi5 content');
    expect(text).toContain('Previous: Intro');
    expect(text).toContain('Next: Wrap up');
  });

  it('marks a quiz-less lesson complete via the API and shows progress', async () => {
    api.lesson.mockResolvedValue(lesson());
    api.complete.mockResolvedValue({ progressPct: 66, completed: false, firstCompletion: true });
    await create();
    const btn = Array.from(el().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark as complete'),
    ) as HTMLButtonElement;
    btn.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.complete).toHaveBeenCalledWith('l2');
    expect(el().textContent).toContain('Course progress: 66%');
  });

  it('hides Mark as complete when the lesson has a quiz', async () => {
    api.lesson.mockResolvedValue(
      lesson({
        quiz: {
          id: 'q',
          title: 'Check',
          mode: 'check',
          passThreshold: 70,
          maxAttempts: null,
          questions: [],
          answered: {},
        },
      }),
    );
    await create();
    expect(el().textContent).not.toContain('Mark as complete');
    expect(el().querySelector('assurance-knowledge-check')).not.toBeNull();
  });

  it('shows an error state with retry when loading fails', async () => {
    api.lesson.mockRejectedValue(new Error('down'));
    await create();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load this lesson',
    );
    api.lesson.mockResolvedValue(lesson());
    (el().querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().textContent).toContain('Prompt injection');
  });

  it('renders a native video element for a video file', async () => {
    api.lesson.mockResolvedValue(
      lesson({ contentType: 'video', externalUrl: 'https://cdn.example.com/a.mp4' }),
    );
    await create();
    expect(el().querySelector('video')?.getAttribute('src')).toBe('https://cdn.example.com/a.mp4');
  });

  it('enrolls the learner on a deep link to a published, un-enrolled course', async () => {
    const published = { ...outline, status: 'published' } as unknown as ApiCourseOutline;
    const enrolled = { ...published, enrollment: { id: 'e1' } } as unknown as ApiCourseOutline;
    api.course.mockResolvedValueOnce(published).mockResolvedValueOnce(enrolled);
    api.lesson.mockResolvedValue(lesson());
    await create();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(api.enroll).toHaveBeenCalledWith('c1');
    expect(api.course).toHaveBeenCalledTimes(2);
    expect(el().textContent).toContain('Prompt injection');
  });

  it('does not enroll when already enrolled or the course is not published', async () => {
    api.lesson.mockResolvedValue(lesson());
    await create(); // outline: enrollment null but status undefined
    expect(api.enroll).not.toHaveBeenCalled();
  });
});
