import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import type { ApiCourse } from '@assurance/lms-core';
import { LibraryService } from '../services/library.service';
import { type TenantRow, TenantsService } from '../services/tenants.service';
import { LibraryComponent } from './library.component';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  apiBaseUrl: 'https://api.example.com',
};

const mockCourse: ApiCourse = {
  id: 'course-lib-1',
  title: 'Library Course One',
  description: 'A library course description',
  status: 'published',
  tags: [],
  availableOffline: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const acme: TenantRow = {
  id: 'acme',
  name: 'Acme Corp',
  status: 'active',
  plan: 'pro',
  customDomain: '',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const libraryStub = {
  list: jest.fn(async (): Promise<ApiCourse[]> => []),
  createCourse: jest.fn(async (): Promise<ApiCourse> => mockCourse),
  share: jest.fn(async () => ({ created: [{ tenantId: 'acme', courseId: 'new-1' }] })),
};
const tenantsStub = { list: jest.fn(async (): Promise<TenantRow[]> => []) };

describe('LibraryComponent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LibraryComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: LibraryService, useValue: libraryStub },
        { provide: TenantsService, useValue: tenantsStub },
      ],
    }).compileComponents();
  });

  it('renders the heading and loads the library on init', async () => {
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(libraryStub.list).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Global Course Library');
  });

  it('renders loaded courses in the table', async () => {
    libraryStub.list.mockResolvedValueOnce([mockCourse]);
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Library Course One');
  });

  it('creates a course through the API and reloads', async () => {
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
    expect(libraryStub.createCourse).toHaveBeenCalledWith({
      title: 'My New Library Course',
      description: 'Great content',
    });
    expect(libraryStub.list).toHaveBeenCalledTimes(2);
  });

  it('shares the course to the selected tenants', async () => {
    libraryStub.list.mockResolvedValueOnce([mockCourse]);
    tenantsStub.list.mockResolvedValueOnce([acme]);
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const comp = fixture.componentInstance as unknown as {
      openShare(c: ApiCourse): Promise<void>;
      toggleTenant(id: string, checked: boolean): void;
      share(): Promise<void>;
      shareResult(): { created: number } | null;
    };
    await comp.openShare(mockCourse);
    comp.toggleTenant('acme', true);
    await comp.share();
    expect(libraryStub.share).toHaveBeenCalledWith('course-lib-1', ['acme']);
    expect(comp.shareResult()).toEqual({ created: 1 });
  });
});
