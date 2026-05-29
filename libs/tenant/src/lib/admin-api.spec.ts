// Stub @angular/fire/functions so importing it under jsdom doesn't pull in
// Firebase's Node entry, and so we can assert the callable invocations.
const callableImpl = jest.fn();
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: (_fns: unknown, name: string) => {
    return (data: unknown) => callableImpl(name, data);
  },
}));

import { TestBed } from '@angular/core/testing';
import { Functions } from '@angular/fire/functions';
import { MemberAdminService, TenantAdminService } from './admin-api';

describe('tenant admin API wrappers', () => {
  beforeEach(() => {
    callableImpl.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: Functions, useValue: {} }],
    });
  });

  it('provisionTenant invokes the provisionTenant callable and returns data', async () => {
    callableImpl.mockResolvedValue({ data: { ok: true, tenantId: 'acme', gcipTenantId: 'g1' } });
    const svc = TestBed.inject(TenantAdminService);
    const res = await svc.provisionTenant({ tenantId: 'acme', name: 'Acme' });
    expect(callableImpl).toHaveBeenCalledWith('provisionTenant', {
      tenantId: 'acme',
      name: 'Acme',
    });
    expect(res.tenantId).toBe('acme');
  });

  it('setTenantStatus passes status through', async () => {
    callableImpl.mockResolvedValue({ data: { ok: true } });
    await TestBed.inject(TenantAdminService).setTenantStatus('acme', 'suspended');
    expect(callableImpl).toHaveBeenCalledWith('setTenantStatus', {
      tenantId: 'acme',
      status: 'suspended',
    });
  });

  it('inviteMember forwards the invite payload', async () => {
    callableImpl.mockResolvedValue({ data: { ok: true, uid: 'u1', inviteLink: 'https://x' } });
    const res = await TestBed.inject(MemberAdminService).inviteMember({
      tenantId: 'acme',
      email: 'a@acme.test',
      role: 'learner',
    });
    expect(res.uid).toBe('u1');
    expect(callableImpl).toHaveBeenCalledWith('inviteMember', {
      tenantId: 'acme',
      email: 'a@acme.test',
      role: 'learner',
    });
  });
});
