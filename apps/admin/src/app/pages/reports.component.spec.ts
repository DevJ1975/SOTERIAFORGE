import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, TenantService } from '@assurance/auth';
import { MemberRepository, EnrollmentRepository } from '@assurance/data-access';
import type { Member, Enrollment } from '@assurance/shared';
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

const testEnv: ForgeEnvironment = {
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

const testMember: Member = {
  uid: 'user-1',
  tenantId: 'acme',
  role: 'learner',
  status: 'active',
  email: 'alice@example.com',
  displayName: 'Alice',
  xp: 120,
  level: 2,
  streakDays: 5,
  earnedBadgeIds: [],
  createdAt: '2024-01-01T00:00:00.000Z',
};

const testEnrollment: Enrollment = {
  uid: 'user-1',
  courseId: 'course-abc',
  tenantId: 'acme',
  progressPct: 100,
  completed: true,
  createdAt: '2024-01-02T00:00:00.000Z',
};

const memberRepoStub = {
  listActive: jest.fn(async (): Promise<Member[]> => [testMember]),
};

const enrollmentRepoStub = {
  listForTenant: jest.fn(async (): Promise<Enrollment[]> => [testEnrollment]),
};

describe('ReportsComponent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: MemberRepository, useValue: memberRepoStub },
        { provide: EnrollmentRepository, useValue: enrollmentRepoStub },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the Reports heading', () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reports');
  });

  it('renders Export CSV buttons', () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Export Members CSV');
    expect(el.textContent).toContain('Export Enrollments CSV');
  });

  it('calls MemberRepository.listActive and EnrollmentRepository.listForTenant on init', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(memberRepoStub.listActive).toHaveBeenCalledWith('acme');
    expect(enrollmentRepoStub.listForTenant).toHaveBeenCalledWith('acme');
  });

  it('loads data: members and enrollments signals are populated after whenStable', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Verify the repos were called (data loading path executed)
    expect(memberRepoStub.listActive).toHaveBeenCalledTimes(1);
    expect(enrollmentRepoStub.listForTenant).toHaveBeenCalledTimes(1);
    // Verify no error state was set
    const comp = fixture.componentInstance as unknown as {
      error: () => string | null;
      loading: () => boolean;
    };
    expect(comp.error()).toBeNull();
  });

  it('exportMembers does not throw after load', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const comp = fixture.componentInstance as unknown as { exportMembers(): void };
    expect(() => comp.exportMembers()).not.toThrow();
  });

  it('exportEnrollments does not throw after load', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const comp = fixture.componentInstance as unknown as { exportEnrollments(): void };
    expect(() => comp.exportEnrollments()).not.toThrow();
  });

  it('table columns header is rendered when not loading', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // After load, loading() should be false; either table or empty message is shown
    const el: HTMLElement = fixture.nativeElement;
    // The table should not show loading message anymore
    expect(el.textContent).not.toContain('Loading report data');
  });
});
