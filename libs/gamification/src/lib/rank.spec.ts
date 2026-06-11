import { initialOf, medalFor } from './rank';

describe('medalFor', () => {
  it('maps the podium to gold/silver/bronze', () => {
    expect(medalFor(1)).toBe('gold');
    expect(medalFor(2)).toBe('silver');
    expect(medalFor(3)).toBe('bronze');
  });

  it('returns null off the podium', () => {
    expect(medalFor(0)).toBeNull();
    expect(medalFor(4)).toBeNull();
    expect(medalFor(100)).toBeNull();
  });
});

describe('initialOf', () => {
  it('uppercases the first character', () => {
    expect(initialOf('jamil')).toBe('J');
    expect(initialOf('  ada lovelace ')).toBe('A');
  });

  it('falls back to ? for missing or blank names', () => {
    expect(initialOf(undefined)).toBe('?');
    expect(initialOf(null)).toBe('?');
    expect(initialOf('   ')).toBe('?');
  });
});
