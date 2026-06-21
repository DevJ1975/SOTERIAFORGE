import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { LibraryRepository } from '@assurance/data-access';
import type { Course, Module } from '@assurance/shared';
import { LibraryEditorComponent } from './library-editor.component';

// Polyfill crypto.randomUUID for jsdom
if (!('randomUUID' in crypto)) {
  Object.defineProperty(crypto, 'randomUUID', {
    value: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }),
    configurable: true,
  });
}

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
  id: 'lib-course-1',
  tenantId: 'platform',
  title: 'Library Editor Course',
  description: 'Description for editor test',
  status: 'published',
  badgeRefs: [],
  tags: [],
  xpReward: 0,
  availableOffline: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockModule: Module = {
  id: 'mod-1',
  courseId: 'lib-course-1',
  tenantId: 'platform',
  title: 'Intro Video',
  order: 0,
  contentType: 'video',
  xpReward: 0,
  badgeRefs: [],
  completion: {},
  createdAt: '2024-01-01T00:00:00.000Z',
};

const libraryRepoStub = {
  getCourse: jest.fn(async (_id: string): Promise<Course | undefined> => mockCourse),
  listModules: jest.fn(async (_id: string): Promise<Module[]> => []),
  setCourse: jest.fn(async (_c: Course): Promise<void> => undefined),
  setModule: jest.fn(async (_courseId: string, _m: Module): Promise<void> => undefined),
  list: jest.fn(async (): Promise<Course[]> => []),
};

describe('LibraryEditorComponent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LibraryEditorComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: LibraryRepository, useValue: libraryRepoStub },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(LibraryEditorComponent);
    // Set required signal input before detectChanges to avoid NG0950
    fixture.componentRef.setInput('id', 'lib-course-1');
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('calls LibraryRepository.getCourse and listModules on init', async () => {
    const fixture = TestBed.createComponent(LibraryEditorComponent);
    fixture.componentRef.setInput('id', 'lib-course-1');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(libraryRepoStub.getCourse).toHaveBeenCalledWith('lib-course-1');
    expect(libraryRepoStub.listModules).toHaveBeenCalledWith('lib-course-1');
  });

  it('renders the course title after load', async () => {
    const fixture = TestBed.createComponent(LibraryEditorComponent);
    fixture.componentRef.setInput('id', 'lib-course-1');
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Library Editor Course');
  });

  it('renders modules in the table', async () => {
    libraryRepoStub.listModules.mockResolvedValueOnce([mockModule]);
    const fixture = TestBed.createComponent(LibraryEditorComponent);
    fixture.componentRef.setInput('id', 'lib-course-1');
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Intro Video');
  });

  it('calls LibraryRepository.setModule with a new module on addModule', async () => {
    const fixture = TestBed.createComponent(LibraryEditorComponent);
    fixture.componentRef.setInput('id', 'lib-course-1');
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();

    const comp = fixture.componentInstance as unknown as {
      newModuleTitle: string;
      newContentType: string;
      newExternalUrl: string;
      newAssetRef: string;
      addModule(): Promise<void>;
    };

    comp.newModuleTitle = 'Test Video Module';
    comp.newContentType = 'video';
    comp.newExternalUrl = 'https://example.com/video.mp4';
    comp.newAssetRef = '';
    await comp.addModule();

    expect(libraryRepoStub.setModule).toHaveBeenCalledTimes(1);
    const [calledCourseId, calledModule] = libraryRepoStub.setModule.mock.calls[0] as [
      string,
      Module,
    ];
    expect(calledCourseId).toBe('lib-course-1');
    expect(calledModule.title).toBe('Test Video Module');
    expect(calledModule.contentType).toBe('video');
    expect(calledModule.externalUrl).toBe('https://example.com/video.mp4');
    expect(calledModule.order).toBe(0);
    expect(calledModule.tenantId).toBe('platform');
    expect(calledModule.createdAt).toBeTruthy();
  });
});
