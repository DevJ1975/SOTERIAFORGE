import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { PrincipalStore } from '@forge/auth';
import { FirestoreGameResultSink } from './game-result-sink';

// Real Firebase never runs in jsdom: the raw SDK write surface and the
// data-access collection factories are module-mocked so the test can assert
// the exact document shape the sink writes.
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ id: 'generated-id' })),
  setDoc: jest.fn(() => Promise.resolve()),
}));

jest.mock('@forge/data-access', () => ({
  gameResultsCol: jest.fn((db: unknown, tenantId: string) => ({
    kind: 'col',
    path: `tenants/${tenantId}/gameResults`,
  })),
  gameResultDoc: jest.fn((db: unknown, tenantId: string, id: string) => ({
    kind: 'doc',
    path: `tenants/${tenantId}/gameResults/${id}`,
  })),
}));

const { doc, setDoc } = jest.requireMock('firebase/firestore') as {
  doc: jest.Mock;
  setDoc: jest.Mock;
};
const { gameResultsCol, gameResultDoc } = jest.requireMock('@forge/data-access') as {
  gameResultsCol: jest.Mock;
  gameResultDoc: jest.Mock;
};

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

describe('FirestoreGameResultSink', () => {
  const fakeDb = { kind: 'db' };

  function makeSink(principal: { uid: string | null; tenantId: string | null }) {
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: fakeDb },
        {
          provide: PrincipalStore,
          useValue: { uid: () => principal.uid, tenantId: () => principal.tenantId },
        },
      ],
    });
    return TestBed.inject(FirestoreGameResultSink);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes the validated doc shape for a signed-in player', async () => {
    const sink = makeSink({ uid: 'learner-1', tenantId: 'acme' });

    await sink.report({ game: 'hazard-hunter', score: 870, maxScore: 3300 });

    expect(gameResultsCol).toHaveBeenCalledWith(fakeDb, 'acme');
    expect(doc).toHaveBeenCalledWith(expect.objectContaining({ path: 'tenants/acme/gameResults' }));
    expect(gameResultDoc).toHaveBeenCalledWith(fakeDb, 'acme', 'generated-id');
    expect(setDoc).toHaveBeenCalledTimes(1);

    const [ref, data] = setDoc.mock.calls[0];
    expect(ref).toEqual(expect.objectContaining({ path: 'tenants/acme/gameResults/generated-id' }));
    expect(data).toEqual({
      id: 'generated-id',
      uid: 'learner-1',
      tenantId: 'acme',
      game: 'hazard-hunter',
      score: 870,
      maxScore: 3300,
      at: expect.stringMatching(ISO_DATE_TIME),
    });
    expect(new Date(data.at).getTime()).not.toBeNaN();
  });

  it('omits maxScore/won instead of writing undefined fields', async () => {
    const sink = makeSink({ uid: 'learner-1', tenantId: 'acme' });

    await sink.report({ game: 'peril', score: 0 });

    const [, data] = setDoc.mock.calls[0];
    expect(Object.keys(data).sort()).toEqual(['at', 'game', 'id', 'score', 'tenantId', 'uid']);
  });

  it('passes won through when a game reports it', async () => {
    const sink = makeSink({ uid: 'learner-1', tenantId: 'acme' });

    await sink.report({ game: 'peril', score: 4200, won: true });

    expect(setDoc.mock.calls[0][1]).toMatchObject({ won: true });
  });

  it("throws 'unauthenticated' when signed out and writes nothing", async () => {
    const sink = makeSink({ uid: null, tenantId: null });

    await expect(sink.report({ game: 'hazard-hunter', score: 100 })).rejects.toThrow(
      'unauthenticated',
    );
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("throws 'unauthenticated' when signed in without a tenant claim", async () => {
    const sink = makeSink({ uid: 'learner-1', tenantId: null });

    await expect(sink.report({ game: 'hazard-hunter', score: 100 })).rejects.toThrow(
      'unauthenticated',
    );
    expect(setDoc).not.toHaveBeenCalled();
  });
});
