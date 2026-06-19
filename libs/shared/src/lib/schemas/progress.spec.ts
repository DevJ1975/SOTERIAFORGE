import { idempotencyKey } from './primitives';
import { progressEvent, PROGRESS_EVENT_KINDS } from './progress';
import { enrollment } from './course';

const audit = { createdAt: '2026-01-01T00:00:00Z' };

const validEvent = {
  idempotencyKey: 'evt_abc12345',
  uid: 'u1',
  tenantId: 'acme',
  courseId: 'c1',
  kind: 'lesson_completed' as const,
  lessonId: 'l1',
  clientSeq: 3,
  occurredAt: '2026-01-01T00:00:00Z',
  deviceId: 'dev-1',
  createdAt: '2026-01-01T00:00:01Z',
};

describe('idempotencyKey', () => {
  it('accepts 8..200 url-safe chars', () => {
    expect(idempotencyKey.safeParse('abcd1234').success).toBe(true);
    expect(idempotencyKey.safeParse('a_b-C9' + '0'.repeat(194)).success).toBe(true);
    expect(idempotencyKey.safeParse('A'.repeat(200)).success).toBe(true);
  });

  it.each([
    ['too short (7)', '1234567'],
    ['too long (201)', 'a'.repeat(201)],
    ['has slash', 'abc/defg'],
    ['has space', 'abc defg'],
    ['has dot', 'abcdef.g'],
    ['empty', ''],
  ])('rejects %s', (_label, key) => {
    expect(idempotencyKey.safeParse(key).success).toBe(false);
  });
});

describe('progressEvent', () => {
  it('parses a valid event', () => {
    const parsed = progressEvent.parse(validEvent);
    expect(parsed.kind).toBe('lesson_completed');
    expect(parsed.clientSeq).toBe(3);
  });

  it('parses a score_recorded event with a score', () => {
    const parsed = progressEvent.parse({
      ...validEvent,
      idempotencyKey: 'score_001abc',
      kind: 'score_recorded',
      lessonId: undefined,
      score: 87,
    });
    expect(parsed.score).toBe(87);
  });

  it('exposes the frozen kind enum', () => {
    expect([...PROGRESS_EVENT_KINDS]).toEqual([
      'lesson_completed',
      'course_completed',
      'score_recorded',
    ]);
  });

  it('rejects an unknown kind', () => {
    expect(progressEvent.safeParse({ ...validEvent, kind: 'started' }).success).toBe(false);
  });

  it('rejects an out-of-range score', () => {
    expect(progressEvent.safeParse({ ...validEvent, score: 120 }).success).toBe(false);
  });

  it('rejects a malformed idempotencyKey', () => {
    expect(progressEvent.safeParse({ ...validEvent, idempotencyKey: 'short' }).success).toBe(false);
  });

  it('rejects a negative clientSeq', () => {
    expect(progressEvent.safeParse({ ...validEvent, clientSeq: -1 }).success).toBe(false);
  });

  it('requires a non-empty deviceId', () => {
    expect(progressEvent.safeParse({ ...validEvent, deviceId: '' }).success).toBe(false);
  });
});

describe('enrollment hardening fields', () => {
  it('applies additive defaults to a legacy enrollment doc', () => {
    const parsed = enrollment.parse({
      ...audit,
      uid: 'u1',
      courseId: 'c1',
      tenantId: 'acme',
    });
    expect(parsed.progressVersion).toBe(0);
    expect(parsed.completedLessonIds).toEqual([]);
    expect(parsed.attemptCount).toBe(0);
    expect(parsed.lastEventKey).toBeUndefined();
  });

  it('round-trips supplied hardening fields', () => {
    const parsed = enrollment.parse({
      ...audit,
      uid: 'u1',
      courseId: 'c1',
      tenantId: 'acme',
      progressVersion: 7,
      completedLessonIds: ['l1', 'l2'],
      attemptCount: 2,
      lastEventKey: 'evt_abc12345',
    });
    expect(parsed.progressVersion).toBe(7);
    expect(parsed.completedLessonIds).toEqual(['l1', 'l2']);
    expect(parsed.attemptCount).toBe(2);
    expect(parsed.lastEventKey).toBe('evt_abc12345');
  });

  it('rejects a malformed lastEventKey', () => {
    expect(
      enrollment.safeParse({
        ...audit,
        uid: 'u1',
        courseId: 'c1',
        tenantId: 'acme',
        lastEventKey: 'bad/key',
      }).success,
    ).toBe(false);
  });
});
