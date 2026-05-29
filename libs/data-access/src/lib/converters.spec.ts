import { z } from 'zod';
import { zodConverter } from './converters';

const schema = z.object({ id: z.string().optional(), name: z.string(), xp: z.number() });

describe('zodConverter', () => {
  const converter = zodConverter(schema, 'thing');

  it('strips id from the persisted body on write', () => {
    const out = converter.toFirestore({ id: 'abc', name: 'Ada', xp: 10 });
    expect(out).toEqual({ name: 'Ada', xp: 10 });
    expect('id' in out).toBe(false);
  });

  it('injects the snapshot id on read and validates', () => {
    const snapshot = {
      id: 'doc1',
      data: () => ({ name: 'Ada', xp: 10 }),
    } as never;
    const model = converter.fromFirestore(snapshot, undefined);
    expect(model).toEqual({ id: 'doc1', name: 'Ada', xp: 10 });
  });

  it('throws on invalid data (drift defense)', () => {
    const snapshot = { id: 'doc1', data: () => ({ name: 'Ada' }) } as never;
    expect(() => converter.fromFirestore(snapshot, undefined)).toThrow();
  });
});
