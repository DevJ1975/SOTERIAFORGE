import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { ReportsComponent } from './reports.component';

// Polyfill URL.createObjectURL / revokeObjectURL for jsdom
if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', {
    value: jest.fn(() => 'blob:mock-url'),
    configurable: true,
  });
}
if (typeof URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: jest.fn(),
    configurable: true,
  });
}

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  apiBaseUrl: 'http://api.test',
};

const member = {
  id: 'm1',
  uid: 'm1',
  tenantId: 'acme',
  email: 'alice@example.com',
  displayName: 'Alice',
  role: 'learner',
  status: 'active',
};

const row = {
  memberId: 'm1',
  memberName: 'Alice',
  email: 'alice@example.com',
  courseId: 'c1',
  courseTitle: 'Forklift Safety',
  progressPct: 100,
  completedAt: '2026-01-02T00:00:00Z',
  dueAt: null,
  lastActivityAt: '2026-01-02T00:00:00Z',
};

describe('ReportsComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: testEnv },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function load() {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    http.expectOne('http://api.test/api/members').flush([member]);
    http.expectOne('http://api.test/api/reports/enrollments').flush([row]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders the heading, export buttons and the enrollment rows', async () => {
    const fixture = await load();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Reports');
    expect(text).toContain('Export Members CSV');
    expect(text).toContain('Export Enrollments CSV');
    expect(text).toContain('Forklift Safety');
    expect(text).not.toContain('Loading report data');
  });

  it('shows an error when the report fails to load', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    http.expectOne('http://api.test/api/members').flush([member]);
    http
      .expectOne('http://api.test/api/reports/enrollments')
      .flush({ detail: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Forbidden');
  });

  it('exports both CSVs without throwing', async () => {
    const fixture = await load();
    const comp = fixture.componentInstance as unknown as {
      exportMembers(): void;
      exportEnrollments(): void;
    };
    expect(() => comp.exportMembers()).not.toThrow();
    expect(() => comp.exportEnrollments()).not.toThrow();
  });
});
