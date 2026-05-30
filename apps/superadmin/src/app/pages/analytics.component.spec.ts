import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment } from '@forge/auth';
import { AnalyticsService, type PlatformAnalytics } from '../services/analytics.service';
import { AnalyticsComponent } from './analytics.component';

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

const mockAnalytics: PlatformAnalytics = {
  totals: {
    tenants: 3,
    members: 42,
    enrollments: 120,
    completions: 80,
  },
  tenants: [
    {
      tenantId: 'acme',
      name: 'Acme Corp',
      status: 'active',
      plan: 'pro',
      members: 15,
      enrollments: 60,
      completions: 40,
    },
    {
      tenantId: 'globex',
      name: 'Globex Inc',
      status: 'active',
      plan: 'starter',
      members: 27,
      enrollments: 60,
      completions: 40,
    },
  ],
  generatedAt: '2024-06-01T12:00:00.000Z',
};

const analyticsServiceStub = {
  load: jest.fn(async (): Promise<PlatformAnalytics> => mockAnalytics),
};

describe('AnalyticsComponent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: AnalyticsService, useValue: analyticsServiceStub },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the Cross-tenant Analytics heading', () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cross-tenant Analytics');
  });

  it('calls AnalyticsService.load on init', async () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(analyticsServiceStub.load).toHaveBeenCalledTimes(1);
  });

  it('renders totals cards after load', async () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Tenants');
    expect(el.textContent).toContain('Members');
    expect(el.textContent).toContain('Enrollments');
    expect(el.textContent).toContain('Completions');
  });

  it('renders tenant rows in the table', async () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Acme Corp');
    expect(el.textContent).toContain('Globex Inc');
  });

  it('renders totals numeric values', async () => {
    const fixture = TestBed.createComponent(AnalyticsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('42');
    expect(el.textContent).toContain('120');
    expect(el.textContent).toContain('80');
  });

  it('shows error message on failure', async () => {
    analyticsServiceStub.load.mockRejectedValueOnce(new Error('Network error'));
    const fixture = TestBed.createComponent(AnalyticsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Network error');
  });
});
