import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '@assurance/auth';
import { type ApiScoreCard, GamificationApi } from '@assurance/lms-core';
import { LearnerProfileStore } from './learner-profile.store';

const card: ApiScoreCard = {
  totalXp: 1200,
  todayXp: 40,
  level: 4,
  xpIntoLevel: 100,
  xpToNext: 400,
  streakDays: 22,
  strip: Array.from({ length: 14 }, () => true),
  crew: null,
};

describe('LearnerProfileStore', () => {
  const principal = signal<{ uid: string; displayName?: string } | null>(null);
  const api = { progress: jest.fn() };

  beforeEach(() => {
    principal.set(null);
    api.progress.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { principal } },
        { provide: GamificationApi, useValue: api },
      ],
    });
  });

  it('does not call the API when signed out', async () => {
    const store = TestBed.inject(LearnerProfileStore);
    await expect(store.load()).resolves.toBeNull();
    expect(api.progress).not.toHaveBeenCalled();
    expect(store.streakDays()).toBeNull();
  });

  it('loads the score card once per principal and exposes name + streak', async () => {
    principal.set({ uid: 'u1', displayName: 'Marcus Walker' });
    api.progress.mockResolvedValue(card);
    const store = TestBed.inject(LearnerProfileStore);

    expect(store.displayName()).toBe('Marcus Walker');
    expect(store.firstName()).toBe('Marcus');
    await Promise.all([store.load(), store.load()]);
    expect(api.progress).toHaveBeenCalledTimes(1);
    expect(store.streakDays()).toBe(22);
    expect(store.scoreCard()).toEqual(card);
  });

  it('allows a retry after a failed load', async () => {
    principal.set({ uid: 'u1' });
    api.progress.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(card);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = TestBed.inject(LearnerProfileStore);

    await expect(store.load()).resolves.toBeNull();
    await expect(store.load()).resolves.toEqual(card);
    expect(api.progress).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('reset() clears the cached score card', async () => {
    principal.set({ uid: 'u1' });
    api.progress.mockResolvedValue(card);
    const store = TestBed.inject(LearnerProfileStore);
    await store.load();
    store.reset();
    expect(store.scoreCard()).toBeNull();
    expect(store.streakDays()).toBeNull();
  });
});
