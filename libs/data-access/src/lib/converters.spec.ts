import { Timestamp } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { z } from 'zod';
import { member } from '@forge/shared';
import { timestampsToIso, zodConverter } from './converters';

/** Minimal stub satisfying the parts of QueryDocumentSnapshot the converter uses. */
function snapshotOf(
  data: Record<string, unknown>,
  path = 'tenants/t1',
): QueryDocumentSnapshot<DocumentData, DocumentData> {
  return {
    id: path.split('/').pop(),
    ref: { path },
    data: () => data,
  } as unknown as QueryDocumentSnapshot<DocumentData, DocumentData>;
}

const docSchema = z.object({
  name: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  tags: z.array(z.string()).default([]),
  nested: z.object({ at: z.string().datetime({ offset: true }).optional() }).optional(),
});

describe('timestampsToIso', () => {
  it('converts a Timestamp to an ISO-8601 string', () => {
    const ts = Timestamp.fromDate(new Date('2024-01-15T12:30:00.000Z'));
    expect(timestampsToIso(ts)).toBe('2024-01-15T12:30:00.000Z');
  });

  it('recurses through plain objects and arrays', () => {
    const ts = Timestamp.fromDate(new Date('2024-06-01T00:00:00.000Z'));
    expect(
      timestampsToIso({
        a: ts,
        b: [ts, 'keep', 1],
        c: { deep: { at: ts } },
      }),
    ).toEqual({
      a: '2024-06-01T00:00:00.000Z',
      b: ['2024-06-01T00:00:00.000Z', 'keep', 1],
      c: { deep: { at: '2024-06-01T00:00:00.000Z' } },
    });
  });

  it('leaves strings, numbers, booleans and null untouched', () => {
    expect(timestampsToIso('2024-01-01T00:00:00Z')).toBe('2024-01-01T00:00:00Z');
    expect(timestampsToIso(42)).toBe(42);
    expect(timestampsToIso(false)).toBe(false);
    expect(timestampsToIso(null)).toBeNull();
  });
});

describe('zodConverter', () => {
  const converter = zodConverter(docSchema);

  describe('fromFirestore', () => {
    it('parses a valid document and applies defaults', () => {
      const parsed = converter.fromFirestore(
        snapshotOf({ name: 'Course A', createdAt: '2024-01-01T00:00:00.000Z' }),
      );
      expect(parsed).toEqual({
        name: 'Course A',
        createdAt: '2024-01-01T00:00:00.000Z',
        tags: [],
      });
    });

    it('converts Timestamp fields (including nested ones) to ISO strings before parsing', () => {
      const parsed = converter.fromFirestore(
        snapshotOf({
          name: 'Course B',
          createdAt: Timestamp.fromDate(new Date('2024-02-02T08:00:00.000Z')),
          nested: { at: Timestamp.fromDate(new Date('2024-02-03T09:00:00.000Z')) },
        }),
      );
      expect(parsed.createdAt).toBe('2024-02-02T08:00:00.000Z');
      expect(parsed.nested?.at).toBe('2024-02-03T09:00:00.000Z');
    });

    it('throws with the document path in the message on schema failure', () => {
      const snap = snapshotOf({ name: 123 }, 'tenants/acme/courses/c1');
      expect(() => converter.fromFirestore(snap)).toThrow(
        /Firestore document "tenants\/acme\/courses\/c1" failed schema validation/,
      );
    });

    it('works against a real @forge/shared schema', () => {
      const memberConverter = zodConverter(member);
      const parsed = memberConverter.fromFirestore(
        snapshotOf(
          {
            uid: 'u1',
            tenantId: 'acme',
            role: 'learner',
            status: 'active',
            email: 'u1@example.com',
            createdAt: Timestamp.fromDate(new Date('2024-03-01T00:00:00.000Z')),
          },
          'tenants/acme/members/u1',
        ),
      );
      expect(parsed.createdAt).toBe('2024-03-01T00:00:00.000Z');
      expect(parsed.xp).toBe(0);
      expect(parsed.level).toBe(1);
    });
  });

  describe('toFirestore', () => {
    it('validates and returns the parsed model (defaults applied)', () => {
      const written = converter.toFirestore({
        name: 'Course C',
        createdAt: '2024-04-01T00:00:00.000Z',
      } as z.infer<typeof docSchema>);
      expect(written).toEqual({
        name: 'Course C',
        createdAt: '2024-04-01T00:00:00.000Z',
        tags: [],
      });
    });

    it('leaves ISO datetime strings as-is on write', () => {
      const written = converter.toFirestore({
        name: 'Course D',
        createdAt: '2024-05-05T10:00:00.000Z',
        updatedAt: '2024-05-06T11:00:00.000Z',
        tags: ['a'],
      });
      expect(written['createdAt']).toBe('2024-05-05T10:00:00.000Z');
      expect(written['updatedAt']).toBe('2024-05-06T11:00:00.000Z');
    });

    it('rejects invalid models before write', () => {
      expect(() =>
        converter.toFirestore({
          name: 'Bad',
          createdAt: 'not-a-date',
        } as z.infer<typeof docSchema>),
      ).toThrow();
    });
  });
});
