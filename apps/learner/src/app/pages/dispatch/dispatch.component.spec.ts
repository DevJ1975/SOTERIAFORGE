import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DispatchSession } from '@assurance/standards';
import { DispatchReporter, type DispatchLink } from './dispatch-reporter.service';
import { DispatchComponent } from './dispatch.component';

const session = (over: Partial<DispatchSession> = {}): DispatchSession => ({
  dispatchId: 'd1',
  courseId: 'c1',
  courseTitle: 'Lockout Tagout',
  format: 'scorm12',
  lmsOrigins: ['https://lms.example'],
  enrolled: true,
  progressPct: 40,
  completed: false,
  completedAt: null,
  scorePct: null,
  ...over,
});

describe('DispatchComponent', () => {
  let fixture: ComponentFixture<DispatchComponent>;
  const reporter = {
    session: signal<DispatchSession | null>(null),
    link: signal<DispatchLink>('idle'),
    problem: signal(''),
    activate: jest.fn(),
    retry: jest.fn(),
  };
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [DispatchComponent],
      providers: [provideRouter([]), { provide: DispatchReporter, useValue: reporter }],
    });
    fixture = TestBed.createComponent(DispatchComponent);
    fixture.componentRef.setInput('id', 'd1');
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  beforeEach(() => {
    reporter.session.set(null);
    reporter.link.set('idle');
    reporter.problem.set('');
    reporter.retry.mockReset().mockResolvedValue(undefined);
    reporter.activate.mockReset().mockImplementation(async () => {
      reporter.session.set(session());
      reporter.link.set('connected');
    });
  });

  it('shows the course, progress, the LMS connection and a link into the course', async () => {
    await create();
    expect(reporter.activate).toHaveBeenCalledWith('d1');
    expect(el().querySelector('h1')?.textContent).toBe('Lockout Tagout');
    expect(text()).toContain('40% of the way through');
    expect(text()).toContain('Connected to your LMS');
    const link = el().querySelector<HTMLAnchorElement>('a.dp__go');
    expect(link?.textContent?.trim()).toBe('Continue course');
    expect(link?.getAttribute('href')).toBe('/courses/c1');
    expect(el().querySelector('progress')?.getAttribute('aria-label')).toBe('Course progress: 40%');
  });

  it('explains when the learner is not enrolled', async () => {
    reporter.activate.mockImplementation(async () => {
      reporter.session.set(session({ enrolled: false, progressPct: 0 }));
      reporter.link.set('disconnected');
      reporter.problem.set('You are not enrolled in this course yet.');
    });
    await create();
    expect(text()).toContain('Ask your instructor to enroll');
    expect(el().querySelector('a.dp__go')).toBeNull();
    expect(el().querySelector('button')).toBeNull();
  });

  it('offers a retry when the LMS is not connected', async () => {
    reporter.activate.mockImplementation(async () => {
      reporter.session.set(session());
      reporter.link.set('disconnected');
      reporter.problem.set('Could not reach your LMS.');
    });
    await create();
    expect(text()).toContain('Not connected to your LMS. Could not reach your LMS.');
    el().querySelector('button')?.click();
    expect(reporter.retry).toHaveBeenCalled();
  });

  it('shows a withdrawn link and lets the learner try again', async () => {
    reporter.activate.mockImplementation(async () => {
      throw new HttpErrorResponse({ status: 404, error: { detail: 'Not found.' } });
    });
    await create();
    expect(text()).toContain('has been withdrawn');
    reporter.activate.mockImplementation(async () => {
      reporter.session.set(session({ progressPct: 100, completed: true, scorePct: 90 }));
      reporter.link.set('connected');
    });
    await fixture.componentInstance.start();
    fixture.detectChanges();
    expect(text()).toContain('You have completed this course');
    expect(text()).toContain('Score so far: 90%');
    expect(el().querySelector('a.dp__go')?.textContent?.trim()).toBe('Open course');
  });
});
