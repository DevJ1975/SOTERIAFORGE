import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV, TenantService } from '@assurance/auth';
import { ThemeService } from '@assurance/ui';
import { provideTenantTheme } from './tenant-theme.bootstrap';

const theme = { applyBranding: jest.fn(), reset: jest.fn() };

function setup(opts: { tenant?: string | null; api?: string | undefined; platform?: string } = {}) {
  TestBed.resetTestingModule();
  theme.applyBranding.mockClear();
  theme.reset.mockClear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTenantTheme(),
      { provide: PLATFORM_ID, useValue: opts.platform ?? 'browser' },
      {
        provide: ASSURANCE_ENV,
        useValue: { apiBaseUrl: 'api' in opts ? opts.api : 'https://api.test' },
      },
      {
        provide: TenantService,
        useValue: { tenantId: () => ('tenant' in opts ? opts.tenant : 'acme') },
      },
      { provide: ThemeService, useValue: theme },
    ],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    done: () => TestBed.inject(ApplicationInitStatus).donePromise,
  };
}

const tick = () => new Promise<void>((r) => setTimeout(r));

describe('provideTenantTheme', () => {
  it('applies the tenant branding from the Forge API', async () => {
    const { http, done } = setup();
    await tick();
    const req = http.expectOne('https://api.test/api/tenant/branding');
    expect(req.request.headers.get('X-Forge-Tenant')).toBe('acme');
    req.flush({ id: 'acme', name: 'Acme', branding: { primaryColor: '#0b5fff' } });
    await done();
    expect(theme.applyBranding).toHaveBeenCalledWith({ primaryColor: '#0b5fff' });
  });

  it('keeps the default theme when the tenant has no branding set', async () => {
    const { http, done } = setup();
    await tick();
    http.expectOne('https://api.test/api/tenant/branding').flush({ id: 'acme', branding: {} });
    await done();
    expect(theme.applyBranding).not.toHaveBeenCalled();
  });

  it('resets to the default theme when the API call fails', async () => {
    const { http, done } = setup();
    await tick();
    http
      .expectOne('https://api.test/api/tenant/branding')
      .flush({}, { status: 404, statusText: 'Not Found' });
    await done();
    expect(theme.reset).toHaveBeenCalled();
  });

  it.each([
    ['no tenant on the host', { tenant: null }],
    ['no API configured', { api: undefined }],
    ['server-side rendering', { platform: 'server' }],
  ])('does nothing with %s', async (_name, opts) => {
    const { http, done } = setup(opts);
    await done();
    http.expectNone('https://api.test/api/tenant/branding');
    expect(theme.applyBranding).not.toHaveBeenCalled();
  });
});
