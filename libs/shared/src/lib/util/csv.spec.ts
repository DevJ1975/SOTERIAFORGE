import { toCsv } from './csv';

describe('toCsv', () => {
  it('serializes rows with a header', () => {
    expect(toCsv([{ a: 1, b: 'x' }])).toBe('a,b\n1,x\n');
  });

  it('quotes fields with commas, quotes, or newlines', () => {
    expect(toCsv([{ a: 'x,y', b: 'he said "hi"' }])).toBe('a,b\n"x,y","he said ""hi"""\n');
  });

  it('honors an explicit column order and fills missing values', () => {
    expect(toCsv([{ a: 1 }], ['a', 'b'])).toBe('a,b\n1,\n');
  });

  it('returns just the header (or empty) for no rows', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b\n');
    expect(toCsv([])).toBe('');
  });
});
