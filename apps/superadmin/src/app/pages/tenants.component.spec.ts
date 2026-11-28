import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { type TenantRow, TenantsService } from '../services/tenants.service';
import { TenantsComponent } from './tenants.component';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  apiBaseUrl: 'https://api.example.com',
};

const acme: TenantRow = {
  id: 'acme',
  name: 'Acme Corp',
  status: 'active',
  plan: 'pro',
  customDomain: '',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const apiStub = {
  list: jest.fn(async (): Promise<TenantRow[]> => []),
  provision: jest.fn(async (): Promise<TenantRow> => acme),
  setStatus: jest.fn(async (): Promise<TenantRow> => acme),
};

interface Internals {
  newTenantId: string;
  newTenantName: string;
  newAdminEmail: string;
  provision(): Promise<void>;
  updateStatus(id: string, status: 'active' | 'suspended' | 'archived'): Promise<void>;
}

describe('TenantsComponent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [TenantsComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: TenantsService, useValue: apiStub },
      ],
    }).compileComponents();
  });

  async function create() {
    const fixture = TestBed.createComponent(TenantsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('lists tenants on init', async () => {
    apiStub.list.mockResolvedValueOnce([acme]);
    const fixture = await create();
    expect(apiStub.list).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Acme Corp');
  });

  it('provisions a tenant with the optional first-admin email, then reloads', async () => {
    const fixture = await create();
    const comp = fixture.componentInstance as unknown as Internals;
    comp.newTenantId = 'globex';
    comp.newTenantName = 'Globex';
    comp.newAdminEmail = 'boss@globex.test';
    await comp.provision();
    expect(apiStub.provision).toHaveBeenCalledWith({
      id: 'globex',
      name: 'Globex',
      plan: undefined,
      adminEmail: 'boss@globex.test',
    });
    expect(apiStub.list).toHaveBeenCalledTimes(2);
    expect(comp.newTenantId).toBe('');
  });

  it('suspends, activates and archives through the status call', async () => {
    const fixture = await create();
    const comp = fixture.componentInstance as unknown as Internals;
    await comp.updateStatus('acme', 'suspended');
    await comp.updateStatus('acme', 'active');
    await comp.updateStatus('acme', 'archived');
    expect(apiStub.setStatus.mock.calls).toEqual([
      ['acme', 'suspended'],
      ['acme', 'active'],
      ['acme', 'archived'],
    ]);
  });

  it('shows a fallback message when loading fails', async () => {
    apiStub.list.mockRejectedValueOnce(new Error('boom'));
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Failed to load tenants');
  });
});
