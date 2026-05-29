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
