import { chunkText, cosineSimilarity, topKBySimilarity } from './vector';

describe('cosineSimilarity', () => {
  it('is 1 for identical direction, 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('topKBySimilarity', () => {
  it('ranks candidates by similarity and truncates to k', () => {
    const candidates = [
      { id: 'a', embedding: [1, 0] },
      { id: 'b', embedding: [0, 1] },
      { id: 'c', embedding: [0.9, 0.1] },
    ];
    const top = topKBySimilarity([1, 0], candidates, 2);
    expect(top.map((t) => t.id)).toEqual(['a', 'c']);
    expect(top[0].score).toBeGreaterThan(top[1].score);
  });
});

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('hello world', 100)).toEqual(['hello world']);
  });

  it('splits long text into bounded chunks on boundaries', () => {
    const para = 'A'.repeat(800);
    const text = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkText(text, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(1000 + 5);
  });

  it('returns empty for blank input', () => {
    expect(chunkText('   ')).toEqual([]);
  });
});
