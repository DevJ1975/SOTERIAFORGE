import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { FORGE_ENV, type ForgeEnvironment, AuthService, TenantService } from '@assurance/auth';
import { TutorService, TUTOR_FUNCTIONS } from '@assurance/ai-tutor';
import { TutorPageComponent } from './tutor.component';
import type { ChatMessage } from '@assurance/shared';

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

const mockMessages = signal<ChatMessage[]>([]);
const mockPending = signal(false);
const mockError = signal<string | null>(null);

const mockTutorService = {
  messages: mockMessages.asReadonly(),
  pending: mockPending.asReadonly(),
  error: mockError.asReadonly(),
  ask: jest.fn(),
};

const mockAuthService = {
  principal: () => ({
    uid: 'user-1',
    email: 'test@example.com',
    claims: { role: 'learner' as const, tenantId: 'tenant-1', entitlements: [] },
  }),
};

const mockTenantService = {
  tenantId: () => 'tenant-1',
};

describe('TutorPageComponent', () => {
  let fixture: ComponentFixture<TutorPageComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [TutorPageComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: mockAuthService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: TutorService, useValue: mockTutorService },
        // Prevent TutorService factory from trying to inject real Firebase Functions
        { provide: TUTOR_FUNCTIONS, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TutorPageComponent);
  });

  it('creates the component', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the page title', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('AI Tutor');
  });

  it('renders the back link to dashboard', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[routerLink="/"]')).not.toBeNull();
  });

  it('renders forge-tutor-chat when tenantId and uid are available', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('forge-tutor-chat')).not.toBeNull();
  });

  it('does not render forge-tutor-chat when uid is missing', () => {
    const noUidAuthService = { principal: () => null };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TutorPageComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: noUidAuthService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: TutorService, useValue: mockTutorService },
        { provide: TUTOR_FUNCTIONS, useValue: {} },
      ],
    });

    const f = TestBed.createComponent(TutorPageComponent);
    f.detectChanges();

    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('forge-tutor-chat')).toBeNull();
  });
});
