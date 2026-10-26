import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService, TenantService } from '@assurance/auth';
import { MemberRepository } from '@assurance/data-access';
import type { Member } from '@assurance/shared';
import { LearnerProfileStore } from './learner-profile.store';

const member: Member = {
  uid: 'u1',
  tenantId: 't1',
  role: 'learner',
  status: 'active',
  email: 'marcus@example.com',
  displayName: 'Marcus Walker',
  xp: 1200,
  level: 4,
  streakDays: 22,
  earnedBadgeIds: ['recruit'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('LearnerProfileStore', () => {
  const principal = signal<{ uid: string; displayName?: string } | null>(null);
  const repo = { getById: jest.fn() };

  beforeEach(() => {
    principal.set(null);
    repo.getById.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { principal } },
        { provide: TenantService, useValue: { tenantId: () => 't1' } },
        { provide: MemberRepository, useValue: repo },
      ],
    });
  });

  it('does not read Firestore when signed out', async () => {
    const store = TestBed.inject(LearnerProfileStore);
    await expect(store.load()).resolves.toBeNull();
    expect(repo.getById).not.toHaveBeenCalled();
    expect(store.streakDays()).toBeNull();
  });

  it('loads the member once per principal and exposes name + streak', async () => {
    principal.set({ uid: 'u1', displayName: 'From Auth' });
    repo.getById.mockResolvedValue(member);
    const store = TestBed.inject(LearnerProfileStore);

    expect(store.displayName()).toBe('From Auth');
    await Promise.all([store.load(), store.load()]);
    expect(repo.getById).toHaveBeenCalledTimes(1);
    expect(repo.getById).toHaveBeenCalledWith('t1', 'u1');
    expect(store.displayName()).toBe('Marcus Walker');
    expect(store.firstName()).toBe('Marcus');
    expect(store.streakDays()).toBe(22);
  });

  it('allows a retry after a failed load', async () => {
    principal.set({ uid: 'u1' });
    repo.getById.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(member);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = TestBed.inject(LearnerProfileStore);

    await expect(store.load()).resolves.toBeNull();
    await expect(store.load()).resolves.toEqual(member);
    expect(repo.getById).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('reset() clears the cached member', async () => {
    principal.set({ uid: 'u1' });
    repo.getById.mockResolvedValue(member);
    const store = TestBed.inject(LearnerProfileStore);
    await store.load();
    store.reset();
    expect(store.member()).toBeNull();
  });
});
