import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthoringApi } from '@assurance/lms-core';
import { CoursesComponent } from './courses.component';

const draft = { id: 'c1', title: 'Safety 101', description: '', status: 'draft', tags: [] };

describe('CoursesComponent', () => {
  const api = {
    courses: jest.fn(),
    createCourse: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
  };

  async function render() {
    const fixture = TestBed.createComponent(CoursesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    api.courses.mockResolvedValue([draft]);
    api.createCourse.mockResolvedValue({ ...draft, id: 'c2' });
    api.publish.mockResolvedValue({ ...draft, status: 'published' });
    api.unpublish.mockResolvedValue(draft);
    await TestBed.configureTestingModule({
      imports: [CoursesComponent],
      providers: [provideRouter([]), { provide: AuthoringApi, useValue: api }],
    }).compileComponents();
  });

  it('lists courses from the API with the New Course form', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Courses');
    expect(text).toContain('New Course');
    expect(text).toContain('Create Course');
    expect(text).toContain('Safety 101');
  });

  it('creates a course and reloads the list', async () => {
    const fixture = await render();
    const cmp = fixture.componentInstance as unknown as {
      newTitle: string;
      newDescription: string;
      createCourse(): Promise<void>;
    };
    cmp.newTitle = '  New one ';
    cmp.newDescription = '';
    await cmp.createCourse();
    expect(api.createCourse).toHaveBeenCalledWith({ title: 'New one', description: undefined });
    expect(api.courses).toHaveBeenCalledTimes(2);
  });

  it('publishes a draft and unpublishes a published course', async () => {
    const fixture = await render();
    const cmp = fixture.componentInstance as unknown as {
      publish(c: typeof draft): Promise<void>;
      unpublish(c: typeof draft): Promise<void>;
    };
    await cmp.publish(draft);
    expect(api.publish).toHaveBeenCalledWith('c1');
    await cmp.unpublish(draft);
    expect(api.unpublish).toHaveBeenCalledWith('c1');
  });

  it('shows the API error when the list fails to load', async () => {
    api.courses.mockRejectedValue(new Error('down'));
    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain('Failed to load courses');
  });
});
