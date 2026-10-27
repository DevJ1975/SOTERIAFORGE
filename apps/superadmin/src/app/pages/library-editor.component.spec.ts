import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import type { ApiCourseOutline } from '@assurance/lms-core';
import { LibraryService } from '../services/library.service';
import { LibraryEditorComponent } from './library-editor.component';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  apiBaseUrl: 'https://api.example.com',
};

const outline: ApiCourseOutline = {
  id: 'c1',
  title: 'Lockout Basics',
  description: 'Intro',
  status: 'draft',
  tags: [],
  availableOffline: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  enrollment: null,
  modules: [
    {
      id: 'm1',
      courseId: 'c1',
      title: 'Module One',
      label: '',
      order: 0,
      lessons: [
        {
          id: 'l1',
          title: 'Watch this',
          order: 0,
          contentType: 'video',
          estimatedMinutes: 5,
          frameworkTags: [],
          hasQuiz: false,
          completed: false,
        },
      ],
    },
  ],
};

const libraryStub = {
  course: jest.fn(async (): Promise<ApiCourseOutline> => outline),
  updateCourse: jest.fn(async () => outline),
  addModule: jest.fn(async () => ({})),
  deleteModule: jest.fn(async () => undefined),
  addLesson: jest.fn(async () => ({})),
  deleteLesson: jest.fn(async () => undefined),
};

interface Internals {
  title: string;
  status: string;
  newModuleTitle: string;
  saveDetails(): Promise<boolean>;
  addModule(): Promise<void>;
  setDraft(moduleId: string, key: string, value: string): void;
  addLesson(moduleId: string): Promise<void>;
  deleteLesson(id: string): Promise<boolean>;
  saveError(): string | null;
}

describe('LibraryEditorComponent', () => {
  async function create() {
    const fixture = TestBed.createComponent(LibraryEditorComponent);
    fixture.componentRef.setInput('id', 'c1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LibraryEditorComponent],
      providers: [
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: LibraryService, useValue: libraryStub },
      ],
    }).compileComponents();
  });

  it('loads the outline and renders modules and lessons', async () => {
    const fixture = await create();
    expect(libraryStub.course).toHaveBeenCalledWith('c1');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Lockout Basics');
    expect(text).toContain('Module One');
    expect(text).toContain('Watch this');
  });

  it('saves course details including the publish status', async () => {
    const fixture = await create();
    const comp = fixture.componentInstance as unknown as Internals;
    comp.title = 'Renamed';
    comp.status = 'published';
    await comp.saveDetails();
    expect(libraryStub.updateCourse).toHaveBeenCalledWith('c1', {
      title: 'Renamed',
      description: 'Intro',
      status: 'published',
    });
  });

  it('adds a module and a lesson, reloading the outline each time', async () => {
    const fixture = await create();
    const comp = fixture.componentInstance as unknown as Internals;
    comp.newModuleTitle = 'Module Two';
    await comp.addModule();
    expect(libraryStub.addModule).toHaveBeenCalledWith('c1', {
      title: 'Module Two',
      label: undefined,
    });

    comp.setDraft('m1', 'title', 'Read this');
    comp.setDraft('m1', 'contentType', 'video');
    comp.setDraft('m1', 'assetRef', 'asset:abc');
    await comp.addLesson('m1');
    expect(libraryStub.addLesson).toHaveBeenCalledWith('m1', {
      title: 'Read this',
      contentType: 'video',
      assetRef: 'asset:abc',
    });
    expect(libraryStub.course).toHaveBeenCalledTimes(3);
  });

  it('surfaces a failure when a write fails', async () => {
    libraryStub.deleteLesson.mockRejectedValueOnce(new Error('nope'));
    const fixture = await create();
    const comp = fixture.componentInstance as unknown as Internals;
    expect(await comp.deleteLesson('l1')).toBe(false);
    expect(comp.saveError()).toBe('Failed to delete lesson');
  });
});
