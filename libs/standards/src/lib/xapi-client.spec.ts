// Prevent @angular/fire from loading Firebase (which needs `fetch` in jsdom).
// XapiClient only uses `httpsCallable` at runtime (inside `send()`); importing
// the module itself is enough for DI typing; we never call the real callable
// in unit tests, so a stub export is sufficient.
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: jest.fn(() => jest.fn()),
}));

import { TestBed } from '@angular/core/testing';
import { XapiClient } from './xapi-client';
import { OfflineXapiQueue } from './offline-xapi-queue.service';
import { XAPI_VERBS, XAPI_TENANT_EXTENSION } from '@forge/shared';

/**
 * Unit tests for XapiClient.buildStatement.
 * No live Firebase — Functions is not provided (inject optional → null),
 * so send() gracefully no-ops.
 */
describe('XapiClient', () => {
  let client: XapiClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [XapiClient],
      // Deliberately omit Functions provider — tests the optional-inject path.
    });
    client = TestBed.inject(XapiClient);
  });

  // ---------------------------------------------------------------------------
  // buildStatement — actor
  // ---------------------------------------------------------------------------
  describe('buildStatement — actor', () => {
    it('sets actor objectType to Agent', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
      });
      expect(stmt.actor.objectType).toBe('Agent');
    });

    it('uses uid as account.name', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
      });
      expect(stmt.actor.account.name).toBe('uid-001');
    });

    it('uses homePage as account.homePage', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://myplatform.example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
      });
      expect(stmt.actor.account.homePage).toBe('https://myplatform.example.com');
    });

    it('sets optional actorName when provided', () => {
      const stmt = client.buildStatement({
        uid: 'uid-002',
        actorName: 'Jane Doe',
        homePage: 'https://example.com',
        verb: 'initialized',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
      });
      expect(stmt.actor.name).toBe('Jane Doe');
    });
  });

  // ---------------------------------------------------------------------------
  // buildStatement — verb IDs
  // ---------------------------------------------------------------------------
  describe('buildStatement — verb ids', () => {
    const verbCases: Array<[keyof typeof XAPI_VERBS, string]> = [
      ['launched', XAPI_VERBS.launched],
      ['initialized', XAPI_VERBS.initialized],
      ['progressed', XAPI_VERBS.progressed],
      ['completed', XAPI_VERBS.completed],
      ['passed', XAPI_VERBS.passed],
      ['failed', XAPI_VERBS.failed],
      ['answered', XAPI_VERBS.answered],
      ['terminated', XAPI_VERBS.terminated],
    ];

    verbCases.forEach(([friendly, expected]) => {
      it(`maps "${friendly}" to the correct verb IRI`, () => {
        const stmt = client.buildStatement({
          uid: 'uid-001',
          homePage: 'https://example.com',
          verb: friendly,
          activityId: 'https://example.com/activities/course-1',
          tenantId: 'tenant-abc',
        });
        expect(stmt.verb.id).toBe(expected);
      });
    });

    it('includes a display object on the verb', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'completed',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
      });
      expect(stmt.verb.display).toBeDefined();
      const display = stmt.verb.display ?? {};
      expect(typeof display['en-US']).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // buildStatement — tenant extension
  // ---------------------------------------------------------------------------
  describe('buildStatement — tenant extension', () => {
    it('stamps tenantId into context.extensions[XAPI_TENANT_EXTENSION]', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'acme-corp',
      });
      expect(stmt.context?.extensions?.[XAPI_TENANT_EXTENSION]).toBe('acme-corp');
    });

    it('also mirrors tenantId at the top-level tenantId field', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'acme-corp',
      });
      expect(stmt.tenantId).toBe('acme-corp');
    });
  });

  // ---------------------------------------------------------------------------
  // buildStatement — score / result mapping
  // ---------------------------------------------------------------------------
  describe('buildStatement — result and score', () => {
    it('omits result when no result options are provided', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
      });
      expect(stmt.result).toBeUndefined();
    });

    it('maps scaled score correctly', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'passed',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
        result: { scaled: 0.85, completion: true, success: true },
      });
      expect(stmt.result?.score?.scaled).toBe(0.85);
      expect(stmt.result?.completion).toBe(true);
      expect(stmt.result?.success).toBe(true);
    });

    it('maps raw score correctly', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'passed',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
        result: { raw: 85 },
      });
      expect(stmt.result?.score?.raw).toBe(85);
    });

    it('omits the score object when neither scaled nor raw are provided', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'completed',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
        result: { completion: true },
      });
      expect(stmt.result?.score).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // buildStatement — object
  // ---------------------------------------------------------------------------
  describe('buildStatement — object', () => {
    it('sets object.objectType to Activity', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
      });
      expect(stmt.object.objectType).toBe('Activity');
    });

    it('uses activityId as object.id', () => {
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-99',
        tenantId: 'tenant-abc',
      });
      expect(stmt.object.id).toBe('https://example.com/activities/course-99');
    });
  });

  // ---------------------------------------------------------------------------
  // buildStatement — registration
  // ---------------------------------------------------------------------------
  describe('buildStatement — registration', () => {
    it('includes registration UUID in context when provided', () => {
      const reg = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
        registration: reg,
      });
      expect(stmt.context?.registration).toBe(reg);
    });
  });

  // ---------------------------------------------------------------------------
  // send — tolerant when Functions unavailable
  // ---------------------------------------------------------------------------
  describe('send', () => {
    it('resolves without throwing when Functions is not injected', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const stmt = client.buildStatement({
        uid: 'uid-001',
        homePage: 'https://example.com',
        verb: 'launched',
        activityId: 'https://example.com/activities/course-1',
        tenantId: 'tenant-abc',
      });
      await expect(client.send(stmt)).resolves.toBeUndefined();
      warnSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// XapiClient offline queuing behaviour
// ---------------------------------------------------------------------------
describe('XapiClient — offline queuing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  function buildBaseStmt() {
    // We need a client instance; build one without real Functions so the
    // no-Functions guard fires before we can test offline logic. To test the
    // offline path we provide a mock Functions token so the guard is bypassed.
    return {
      actor: {
        objectType: 'Agent' as const,
        account: { homePage: 'https://example.com', name: 'uid-x' },
      },
      verb: { id: 'https://adlnet.gov/expapi/verbs/launched', display: { 'en-US': 'launched' } },
      object: { objectType: 'Activity' as const, id: 'https://example.com/activities/c1' },
      timestamp: new Date().toISOString(),
      tenantId: 'tenant-abc',
      actorUid: 'uid-x',
    };
  }

  it('enqueues statement when navigator.onLine is false', async () => {
    // Provide a mock Functions token so the "no Functions" guard is bypassed.
    const { Functions } = jest.requireMock('@angular/fire/functions') as {
      Functions: new () => object;
    };
    const { httpsCallable } = jest.requireMock('@angular/fire/functions') as {
      httpsCallable: jest.Mock;
    };
    // Make the callable never actually called (we go offline before that)
    httpsCallable.mockReturnValue(jest.fn().mockResolvedValue({}));

    TestBed.configureTestingModule({
      providers: [XapiClient, OfflineXapiQueue, { provide: Functions, useValue: new Functions() }],
    });

    const xapiClient = TestBed.inject(XapiClient);
    const offlineQueue = TestBed.inject(OfflineXapiQueue);

    // Simulate offline
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });

    const stmt = buildBaseStmt();
    await xapiClient.send(stmt as never);

    expect(offlineQueue.size()).toBe(1);

    // Restore
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('enqueues statement when the callable rejects', async () => {
    const { Functions } = jest.requireMock('@angular/fire/functions') as {
      Functions: new () => object;
    };
    const { httpsCallable } = jest.requireMock('@angular/fire/functions') as {
      httpsCallable: jest.Mock;
    };
    // Make the callable reject to simulate a network error
    httpsCallable.mockReturnValue(jest.fn().mockRejectedValue(new Error('Network error')));

    TestBed.configureTestingModule({
      providers: [XapiClient, OfflineXapiQueue, { provide: Functions, useValue: new Functions() }],
    });

    const xapiClient = TestBed.inject(XapiClient);
    const offlineQueue = TestBed.inject(OfflineXapiQueue);

    // Ensure we appear online so the network attempt is made
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stmt = buildBaseStmt();
    await xapiClient.send(stmt as never);

    expect(offlineQueue.size()).toBe(1);
  });
});
