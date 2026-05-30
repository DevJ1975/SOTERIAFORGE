import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { TenantRepository } from '@assurance/data-access';
import { TenantAdminService } from '@assurance/tenant';
import { TenantsComponent } from './tenants.component';

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

const tenantRepoStub = {
  list: jest.fn(async () => []),
};

const tenantAdminStub = {
  provisionTenant: jest.fn(),
  setTenantStatus: jest.fn(),
};

describe('TenantsComponent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [TenantsComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: TenantRepository, useValue: tenantRepoStub },
        { provide: TenantAdminService, useValue: tenantAdminStub },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(TenantsComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('calls TenantRepository.list on init', async () => {
    const fixture = TestBed.createComponent(TenantsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(tenantRepoStub.list).toHaveBeenCalledTimes(1);
  });
});
