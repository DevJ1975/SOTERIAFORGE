import { XAPI_TENANT_EXTENSION, XAPI_VERBS } from '@forge/shared';
import {
  activityIdFor,
  buildStatement,
  statementUuid,
  XAPI_ACTIVITY_TYPES,
  XAPI_ACTOR_HOME_PAGE,
} from './statement';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('buildStatement', () => {
  it('builds a complete completed-with-score statement (golden structure)', () => {
    const statement = buildStatement({
      actorUid: 'learner-1',
      actorName: 'Pat Learner',
      verb: 'completed',
      activityId: activityIdFor('course', 'acme', 'course-1'),
      activityName: 'Lockout/Tagout',
      activityType: XAPI_ACTIVITY_TYPES.course,
      tenantId: 'acme',
      registration: '7f3c0a4e-1111-4222-8333-444455556666',
      result: {
        score: { scaled: 0.85, raw: 85, min: 0, max: 100 },
        success: true,
        completion: true,
      },
    });

    expect(statement).toEqual({
      id: expect.stringMatching(UUID_RE),
      actor: {
        objectType: 'Agent',
        name: 'Pat Learner',
        account: { homePage: XAPI_ACTOR_HOME_PAGE, name: 'learner-1' },
      },
      verb: {
        id: 'http://adlnet.gov/expapi/verbs/completed',
        display: { 'en-US': 'completed' },
      },
      object: {
        objectType: 'Activity',
        id: 'https://soteriaforge.com/xapi/activities/course/acme/course-1',
        definition: {
          name: { 'en-US': 'Lockout/Tagout' },
          type: 'http://adlnet.gov/expapi/activities/course',
        },
      },
      result: {
        score: { scaled: 0.85, raw: 85, min: 0, max: 100 },
        success: true,
        completion: true,
      },
      context: {
        registration: '7f3c0a4e-1111-4222-8333-444455556666',
        extensions: { [XAPI_TENANT_EXTENSION]: 'acme' },
      },
      timestamp: expect.stringMatching(ISO_RE),
      version: '1.0.3',
    });
  });

  it('always carries the tenant extension, even for the leanest statement', () => {
    const statement = buildStatement({
      actorUid: 'u1',
      verb: 'launched',
      activityId: activityIdFor('lesson', 'globex', 'c1/l1'),
      tenantId: 'globex',
    });
    expect(statement.context.extensions[XAPI_TENANT_EXTENSION]).toBe('globex');
    // No optional noise on the lean shape.
    expect(statement.result).toBeUndefined();
    expect(statement.object.definition).toBeUndefined();
    expect(statement.actor.name).toBeUndefined();
    expect(statement.context.registration).toBeUndefined();
  });

  it.each(Object.keys(XAPI_VERBS) as Array<keyof typeof XAPI_VERBS>)(
    "maps verb '%s' to its IRI with an en-US display",
    (verb) => {
      const statement = buildStatement({
        actorUid: 'u1',
        verb,
        activityId: activityIdFor('quiz', 'acme', 'q1'),
        tenantId: 'acme',
      });
      expect(statement.verb).toEqual({ id: XAPI_VERBS[verb], display: { 'en-US': verb } });
    },
  );

  it('nests a parent context activity when parentActivityId is given', () => {
    const statement = buildStatement({
      actorUid: 'u1',
      verb: 'progressed',
      activityId: activityIdFor('lesson', 'acme', 'c1/l1'),
      tenantId: 'acme',
      parentActivityId: activityIdFor('course', 'acme', 'c1'),
    });
    expect(statement.context.contextActivities).toEqual({
      parent: [
        {
          objectType: 'Activity',
          id: 'https://soteriaforge.com/xapi/activities/course/acme/c1',
        },
      ],
    });
  });

  it('gives every statement a fresh v4 uuid', () => {
    const opts = {
      actorUid: 'u1',
      verb: 'initialized' as const,
      activityId: activityIdFor('game', 'acme', 'g1'),
      tenantId: 'acme',
    };
    const a = buildStatement(opts);
    const b = buildStatement(opts);
    expect(a.id).toMatch(UUID_RE);
    expect(b.id).toMatch(UUID_RE);
    expect(a.id).not.toBe(b.id);
  });
});

describe('activityIdFor', () => {
  it.each([
    ['course', 'acme', 'course-1', 'https://soteriaforge.com/xapi/activities/course/acme/course-1'],
    [
      'lesson',
      'acme',
      'course-1/lesson-2',
      'https://soteriaforge.com/xapi/activities/lesson/acme/course-1/lesson-2',
    ],
    ['quiz', 'globex', 'quiz-9', 'https://soteriaforge.com/xapi/activities/quiz/globex/quiz-9'],
    [
      'game',
      'acme',
      'forklift-sim',
      'https://soteriaforge.com/xapi/activities/game/acme/forklift-sim',
    ],
  ] as const)('shapes %s ids', (kind, tenantId, ref, expected) => {
    expect(activityIdFor(kind, tenantId, ref)).toBe(expected);
  });

  it('URI-encodes unsafe ref segments so ids stay valid IRIs', () => {
    expect(activityIdFor('lesson', 'acme', 'c 1/l#2')).toBe(
      'https://soteriaforge.com/xapi/activities/lesson/acme/c%201/l%232',
    );
  });
});

describe('statementUuid', () => {
  it('uses crypto.randomUUID when available', () => {
    expect(statementUuid()).toMatch(UUID_RE);
  });

  it('falls back to a Math.random v4 uuid without Web Crypto', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const id = statementUuid();
      expect(id).toMatch(UUID_RE);
      expect(statementUuid()).not.toBe(id);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'crypto', original);
      } else {
        delete (globalThis as { crypto?: unknown }).crypto;
      }
    }
  });
});
