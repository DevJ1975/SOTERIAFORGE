import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { LibraryRepository, TenantRepository } from '@assurance/data-access';
import type { Course, Tenant } from '@assurance/shared';
import { LibraryService, type ShareLibraryCourseResult } from '../services/library.service';
import { LibraryComponent } from './library.component';

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
  id: 'course-lib-1',
  tenantId: 'platform',
  title: 'Library Course One',
  description: 'A library course description',
  status: 'published',
  badgeRefs: [],
  tags: [],
  xpReward: 0,
  availableOffline: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockTenant: Tenant = {
  id: 'acme',
  name: 'Acme Corp',
  status: 'active',
  plan: 'pro',
  branding: { colors: {} },
  createdAt: '2024-01-01T00:00:00.000Z',
};

const libraryRepoStub = {
  list: jest.fn(async (): Promise<Course[]> => []),
  setCourse: jest.fn(async (_c: Course): Promise<void> => undefined),
  getCourse: jest.fn(async (_id: string): Promise<Course | undefined> => undefined),
  listModules: jest.fn(async (_id: string) => []),
  setModule: jest.fn(async () => undefined),
};

const tenantRepoStub = {
  list: jest.fn(async (): Promise<Tenant[]> => []),
};

const libraryServiceStub = {
  share: jest.fn(async (): Promise<ShareLibraryCourseResult> => ({ ok: true, created: 1 })),
};

describe('LibraryComponent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LibraryComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: LibraryRepository, useValue: libraryRepoStub },
        { provide: TenantRepository, useValue: tenantRepoStub },
        { provide: LibraryService, useValue: libraryServiceStub },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('calls LibraryRepository.list on init', async () => {
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(libraryRepoStub.list).toHaveBeenCalledTimes(1);
  });

  it('renders loaded courses in the table', async () => {
    libraryRepoStub.list.mockResolvedValueOnce([mockCourse]);
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Library Course One');
  });

  it('calls LibraryRepository.setCourse with a new course on create', async () => {
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance as unknown as {
      newTitle: string;
      newDescription: string;
      createCourse(): Promise<void>;
    };

    comp.newTitle = 'My New Library Course';
    comp.newDescription = 'Great content';
    await comp.createCourse();

    expect(libraryRepoStub.setCourse).toHaveBeenCalledTimes(1);
    const [calledCourse] = libraryRepoStub.setCourse.mock.calls[0] as [Course];
    expect(calledCourse.title).toBe('My New Library Course');
    expect(calledCourse.tenantId).toBe('platform');
    expect(calledCourse.status).toBe('published');
    expect(calledCourse.xpReward).toBe(0);
    expect(calledCourse.badgeRefs).toEqual([]);
    expect(calledCourse.tags).toEqual([]);
    expect(calledCourse.createdAt).toBeTruthy();
  });

  it('calls LibraryService.share with the selected tenants', async () => {
    libraryRepoStub.list.mockResolvedValueOnce([mockCourse]);
    tenantRepoStub.list.mockResolvedValueOnce([mockTenant]);

    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance as unknown as {
      openShare(c: Course): Promise<void>;
      toggleTenant(id: string, checked: boolean): void;
      share(): Promise<void>;
    };

    await comp.openShare(mockCourse);
    comp.toggleTenant('acme', true);
    await comp.share();

    expect(libraryServiceStub.share).toHaveBeenCalledTimes(1);
    expect(libraryServiceStub.share).toHaveBeenCalledWith({
      libraryCourseId: 'course-lib-1',
      tenantIds: ['acme'],
    });
  });

  it('renders the Global Course Library heading', () => {
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Global Course Library');
  });
});
