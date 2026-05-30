import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, TenantService } from '@assurance/auth';
import { TenantRepository } from '@assurance/data-access';
import { BrandingService } from '@assurance/tenant';
import { BrandingComponent } from './branding.component';

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

describe('BrandingComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandingComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        {
          provide: TenantRepository,
          useValue: { getById: async () => ({ branding: { colors: {} } }) },
        },
        { provide: BrandingService, useValue: { updateBranding: jest.fn() } },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(BrandingComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the Branding heading', () => {
    const fixture = TestBed.createComponent(BrandingComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Branding');
  });

  it('renders the Preview button', async () => {
    const fixture = TestBed.createComponent(BrandingComponent);
    fixture.detectChanges();
    // Wait for async ngOnInit to complete
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Preview');
  });

  it('renders the Save button', async () => {
    const fixture = TestBed.createComponent(BrandingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Save');
  });
});
