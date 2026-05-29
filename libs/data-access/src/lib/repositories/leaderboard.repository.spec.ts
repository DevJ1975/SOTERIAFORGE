// Mock @angular/fire/firestore to avoid real Firebase initialisation.
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  docData: jest.fn(),
  getDoc: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { Firestore, doc, docData, getDoc } from '@angular/fire/firestore';
import { of } from 'rxjs';
import { LeaderboardRepository } from './leaderboard.repository';
import type { Leaderboard } from '@forge/shared';

const mockLeaderboard: Leaderboard = {
  tenantId: 'acme',
  period: 'allTime',
  entries: [
    { uid: 'user-1', xp: 500, rank: 1, displayName: 'Alice' },
    { uid: 'user-2', xp: 300, rank: 2, displayName: 'Bob' },
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('LeaderboardRepository', () => {
  let repo: LeaderboardRepository;

  beforeEach(() => {
    jest.clearAllMocks();

    // Make doc() return a fake ref that withConverter() passes through.
    (doc as jest.Mock).mockReturnValue({
      withConverter: jest.fn().mockReturnValue('fake-ref'),
    });

    TestBed.configureTestingModule({
      providers: [{ provide: Firestore, useValue: {} }],
    });

    repo = TestBed.inject(LeaderboardRepository);
  });

  describe('get()', () => {
    it('returns the leaderboard when the document exists', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockLeaderboard,
      });

      const result = await repo.get('acme', 'allTime');

      expect(getDoc).toHaveBeenCalledWith('fake-ref');
      expect(result).toEqual(mockLeaderboard);
    });

    it('returns null when the document does not exist', async () => {
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

      const result = await repo.get('acme', 'weekly');
      expect(result).toBeNull();
    });
  });

  describe('watch()', () => {
    it('returns an observable of the leaderboard document', (done) => {
      (docData as jest.Mock).mockReturnValue(of(mockLeaderboard));

      repo.watch('acme', 'allTime').subscribe((val) => {
        expect(val).toEqual(mockLeaderboard);
        done();
      });
    });

    it('emits undefined when document does not exist', (done) => {
      (docData as jest.Mock).mockReturnValue(of(undefined));

      repo.watch('acme', 'daily').subscribe((val) => {
        expect(val).toBeUndefined();
        done();
      });
    });
  });
});
