import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment, TenantService } from '@assurance/auth';
import { BrandingComponent } from './branding.component';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  apiBaseUrl: 'http://api.test',
};

describe('BrandingComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandingComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function load(branding: unknown = { colors: {} }) {
    const fixture = TestBed.createComponent(BrandingComponent);
    fixture.detectChanges();
    http.expectOne('http://api.test/api/tenant/branding').flush({ id: 'acme', branding });
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return fixture;
  }

  it('renders the heading and the Preview and Save buttons', async () => {
    const fixture = await load();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Branding');
    expect(text).toContain('Preview');
    expect(text).toContain('Save');
  });

  it('loads the current branding into the form', async () => {
    const fixture = await load({
      logoUrl: 'https://cdn.test/logo.png',
      colors: { '--assurance-color-primary': '#123456' },
    });
    const comp = fixture.componentInstance as unknown as {
      form(): { logoUrl: string; colorPrimary: string };
    };
    expect(comp.form().logoUrl).toBe('https://cdn.test/logo.png');
    expect(comp.form().colorPrimary).toBe('#123456');
  });

  it('saves with PUT tenants/{id}/branding', async () => {
    const fixture = await load();
    const comp = fixture.componentInstance as unknown as { save(): Promise<void> };
    const done = comp.save();
    const req = http.expectOne('http://api.test/api/tenants/acme/branding');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.colors['--assurance-color-primary']).toBe('#1d4ed8');
    req.flush({});
    await done;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Branding saved');
  });

  it('leaves a cleared colour out of the PUT body and shows field errors', async () => {
    const fixture = await load();
    const comp = fixture.componentInstance as unknown as {
      patchForm(field: string, value: string): void;
      save(): Promise<void>;
      saveError(): string | null;
    };
    comp.patchForm('colorAccent', '');
    const done = comp.save();
    const req = http.expectOne('http://api.test/api/tenants/acme/branding');
    expect(Object.keys(req.request.body.colors)).not.toContain('--assurance-color-accent');
    req.flush({ logoUrl: ['Use an https:// URL.'] }, { status: 400, statusText: 'Bad Request' });
    await done;
    expect(comp.saveError()).toBe('logoUrl: Use an https:// URL.');
  });
});
