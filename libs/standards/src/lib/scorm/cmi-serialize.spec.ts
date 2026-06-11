import { flattenCmi, mergeCmi, nestCmi } from './cmi-serialize';

describe('cmi-serialize', () => {
  it('flattens nested records to dotted keys with string values', () => {
    expect(flattenCmi({ cmi: { core: { score: { raw: 87 }, lesson_status: 'passed' } } })).toEqual({
      'cmi.core.score.raw': '87',
      'cmi.core.lesson_status': 'passed',
    });
  });

  it('flattens arrays to indexed keys and drops null leaves', () => {
    expect(
      flattenCmi({ cmi: { interactions: [{ id: 'q1', result: 'correct' }], comments: null } }),
    ).toEqual({
      'cmi.interactions.0.id': 'q1',
      'cmi.interactions.0.result': 'correct',
    });
  });

  it('passes already-flat maps through unchanged', () => {
    const flat = { 'cmi.suspend_data': 'bookmark=3', 'cmi.core.score.raw': '50' };
    expect(flattenCmi(flat)).toEqual(flat);
  });

  it('nests dotted keys back into records and arrays', () => {
    expect(nestCmi({ 'cmi.core.score.raw': '87', 'cmi.interactions.0.id': 'q1' })).toEqual({
      cmi: { core: { score: { raw: '87' } }, interactions: [{ id: 'q1' }] },
    });
  });

  it('round-trips flatten ∘ nest', () => {
    const flat = {
      'cmi.core.lesson_status': 'incomplete',
      'cmi.core.score.raw': '40',
      'cmi.suspend_data': 'p=2',
    };
    expect(flattenCmi(nestCmi(flat))).toEqual(flat);
  });

  it('deep-merges records, arrays index-wise, scalars overwrite', () => {
    const base = {
      cmi: { core: { lesson_status: 'incomplete', score: { raw: '40' } } },
      interactions: [{ id: 'q1' }, { id: 'q2' }],
    };
    const overlay = {
      cmi: { core: { lesson_status: 'passed' } },
      interactions: [{ result: 'correct' }],
    };
    expect(mergeCmi(base, overlay)).toEqual({
      cmi: { core: { lesson_status: 'passed', score: { raw: '40' } } },
      interactions: [{ id: 'q1', result: 'correct' }, { id: 'q2' }],
    });
    // No mutation of inputs.
    expect(base.cmi.core.lesson_status).toBe('incomplete');
  });
});
