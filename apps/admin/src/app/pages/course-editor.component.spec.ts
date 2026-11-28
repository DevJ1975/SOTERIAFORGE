import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthoringApi } from '@assurance/lms-core';
import { MemberAdminService } from '@assurance/tenant';
import { CourseEditorComponent } from './course-editor.component';

function outline(status: 'draft' | 'published' = 'draft') {
  return {
    id: 'course-1',
    title: 'Test Course',
    description: 'A test course',
    status,
    tags: [],
    availableOffline: false,
    createdAt: '',
    updatedAt: '',
    enrollment: null,
    modules: [
      {
        id: 'm1',
        courseId: 'course-1',
        title: 'Basics',
        label: 'Week 1',
        order: 0,
        lessons: [lessonSummary('l1', 'Intro video', 0), lessonSummary('l2', 'Check', 1)],
      },
      { id: 'm2', courseId: 'course-1', title: 'Advanced', label: '', order: 1, lessons: [] },
    ],
  };
}

function lessonSummary(id: string, title: string, order: number) {
  return {
    id,
    title,
    order,
    contentType: 'video' as const,
    estimatedMinutes: 5,
    frameworkTags: [],
    hasQuiz: false,
    completed: false,
  };
}

describe('CourseEditorComponent', () => {
  const api = {
    course: jest.fn(),
    quizzes: jest.fn(),
    games: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
    updateCourse: jest.fn(),
    addModule: jest.fn(),
    deleteModule: jest.fn(),
    reorderModules: jest.fn(),
    lesson: jest.fn(),
    addLesson: jest.fn(),
    updateLesson: jest.fn(),
    deleteLesson: jest.fn(),
    reorderLessons: jest.fn(),
    assign: jest.fn(),
  };
  const members = { listMembers: jest.fn() };

  async function render() {
    const fixture = TestBed.createComponent(CourseEditorComponent);
    // Set required signal input before detectChanges to avoid NG0950
    fixture.componentRef.setInput('id', 'course-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    api.course.mockImplementation(async () => outline());
    api.quizzes.mockResolvedValue([{ id: 'q1', title: 'Quiz one' }]);
    api.games.mockResolvedValue([{ id: 'g1', title: 'Game one' }]);
    api.publish.mockResolvedValue({ status: 'published' });
    api.unpublish.mockResolvedValue({ status: 'draft' });
    api.updateCourse.mockResolvedValue({});
    api.addModule.mockResolvedValue({});
    api.deleteModule.mockResolvedValue(undefined);
    api.reorderModules.mockResolvedValue(undefined);
    api.addLesson.mockResolvedValue({});
    api.updateLesson.mockResolvedValue({});
    api.deleteLesson.mockResolvedValue(undefined);
    api.reorderLessons.mockResolvedValue(undefined);
    api.assign.mockResolvedValue({ assigned: 1, skipped: 0 });
    members.listMembers.mockResolvedValue([
      { id: 'u1', email: 'a@x.com', displayName: 'Ann', status: 'active' },
      { id: 'u2', email: 'b@x.com', displayName: 'Bob', status: 'deactivated' },
    ]);
    await TestBed.configureTestingModule({
      imports: [CourseEditorComponent],
      providers: [
        provideRouter([]),
        { provide: AuthoringApi, useValue: api },
        { provide: MemberAdminService, useValue: members },
      ],
    }).compileComponents();
  });

  it('renders the back link, the outline and the total estimated time', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(api.course).toHaveBeenCalledWith('course-1');
    expect(text).toContain('Back to Courses');
    expect(text).toContain('Test Course');
    expect(text).toContain('Basics');
    expect(text).toContain('Intro video');
    expect(text).toContain('Total estimated time: 10 min');
  });

  it('offers only active members for assignment', async () => {
    const fixture = await render();
    expect(fixture.componentInstance['memberOptions']()).toEqual([{ label: 'Ann', value: 'u1' }]);
  });

  it('publishes a draft and unpublishes it again', async () => {
    const fixture = await render();
    await fixture.componentInstance['togglePublish']();
    expect(api.publish).toHaveBeenCalledWith('course-1');
    expect(fixture.componentInstance['course']()?.status).toBe('published');
    await fixture.componentInstance['togglePublish']();
    expect(api.unpublish).toHaveBeenCalledWith('course-1');
  });

  it('adds a module at the end with its label', async () => {
    const fixture = await render();
    fixture.componentInstance['newModuleTitle'] = ' Safety ';
    fixture.componentInstance['newModuleLabel'] = 'Week 3';
    await fixture.componentInstance['addModule']();
    expect(api.addModule).toHaveBeenCalledWith('course-1', {
      title: 'Safety',
      label: 'Week 3',
      order: 2,
    });
    expect(api.course).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance['newModuleTitle']).toBe('');
  });

  it('reorders modules and lessons by swapping neighbours', async () => {
    const fixture = await render();
    await fixture.componentInstance['moveModule'](0, 1);
    expect(api.reorderModules).toHaveBeenCalledWith(['m2', 'm1']);
    await fixture.componentInstance['moveModule'](0, -1);
    expect(api.reorderModules).toHaveBeenCalledTimes(1);

    const module = outline().modules[0];
    await fixture.componentInstance['moveLesson'](module, 1, -1);
    expect(api.reorderLessons).toHaveBeenCalledWith(['l2', 'l1']);
  });

  it('adds a lesson to the end of a module', async () => {
    const fixture = await render();
    const module = outline().modules[0];
    await fixture.componentInstance['saveNew'](module, {
      title: 'Quiz time',
      contentType: 'quiz',
      quizId: 'q1',
    });
    expect(api.addLesson).toHaveBeenCalledWith('m1', {
      title: 'Quiz time',
      contentType: 'quiz',
      quizId: 'q1',
      order: 2,
    });
  });

  it('loads the full lesson to edit it and saves the patch', async () => {
    api.lesson.mockResolvedValue({ id: 'l1', title: 'Intro video' });
    const fixture = await render();
    await fixture.componentInstance['startEdit'](lessonSummary('l1', 'Intro video', 0));
    expect(fixture.componentInstance['editingLesson']()).toMatchObject({ id: 'l1' });
    await fixture.componentInstance['saveEdit']({ title: 'Renamed' });
    expect(api.updateLesson).toHaveBeenCalledWith('l1', { title: 'Renamed' });
    expect(fixture.componentInstance['editingLesson']()).toBeNull();
  });

  it('shows the server message when a delete is refused', async () => {
    const { HttpErrorResponse } = await import('@angular/common/http');
    api.deleteLesson.mockRejectedValue(
      new HttpErrorResponse({ status: 409, error: { detail: 'Learners have progress here.' } }),
    );
    const fixture = await render();
    await fixture.componentInstance['deleteLesson'](lessonSummary('l1', 'Intro video', 0));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Learners have progress here.');
  });

  it('assigns the selected members with an ISO due date', async () => {
    const fixture = await render();
    fixture.componentInstance['selectedMemberIds'] = ['u1'];
    fixture.componentInstance['assignDueDate'] = '2026-12-01';
    await fixture.componentInstance['assign']();
    expect(api.assign).toHaveBeenCalledWith('course-1', {
      memberIds: ['u1'],
      dueAt: new Date('2026-12-01').toISOString(),
    });
    expect(fixture.componentInstance['assignResult']()).toEqual({ assigned: 1, skipped: 0 });
  });

  it('saves the offline toggle and reverts it when the save fails', async () => {
    const fixture = await render();
    fixture.componentInstance['availableOffline'] = true;
    await fixture.componentInstance['saveOfflineSetting']();
    expect(api.updateCourse).toHaveBeenCalledWith('course-1', { availableOffline: true });

    api.updateCourse.mockRejectedValue(new Error('x'));
    fixture.componentInstance['availableOffline'] = false;
    await fixture.componentInstance['saveOfflineSetting']();
    expect(fixture.componentInstance['availableOffline']).toBe(true);
  });

  it('reports a course that fails to load', async () => {
    api.course.mockRejectedValue(new Error('down'));
    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain('Failed to load course');
  });
});
