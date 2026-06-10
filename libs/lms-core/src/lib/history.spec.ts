import { deepClone, EditHistory } from './history';

interface Doc {
  title: string;
  items: string[];
}

const doc = (title: string, items: string[] = []): Doc => ({ title, items });

describe('deepClone', () => {
  it('returns a structurally equal but independent copy', () => {
    const original = doc('Forklift', ['inspection']);
    const copy = deepClone(original);
    expect(copy).toEqual(original);
    copy.items.push('stability');
    expect(original.items).toEqual(['inspection']);
  });
});

describe('EditHistory', () => {
  it('starts empty', () => {
    const history = new EditHistory<Doc>();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo(doc('now'))).toBeUndefined();
    expect(history.redo(doc('now'))).toBeUndefined();
  });

  it('undoes back to the pushed snapshot and banks the present for redo', () => {
    const history = new EditHistory<Doc>();
    const v1 = doc('v1');
    const v2 = doc('v2');

    history.push(v1); // about to mutate v1 -> v2
    expect(history.canUndo).toBe(true);

    const restored = history.undo(v2);
    expect(restored).toEqual(v1);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    const redone = history.redo(restored as Doc);
    expect(redone).toEqual(v2);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it('clears the redo stack when a new snapshot is pushed', () => {
    const history = new EditHistory<Doc>();
    history.push(doc('v1'));
    history.undo(doc('v2'));
    expect(history.canRedo).toBe(true);

    history.push(doc('v1'));
    expect(history.canRedo).toBe(false);
  });

  it('snapshots structurally — later mutations do not leak into history', () => {
    const history = new EditHistory<Doc>();
    const state = doc('v1', ['a']);
    history.push(state);
    state.items.push('b'); // mutate after pushing

    const restored = history.undo(doc('v2'));
    expect(restored?.items).toEqual(['a']);
  });

  it('caps retained snapshots at the configured capacity', () => {
    const history = new EditHistory<Doc>(3);
    for (let i = 0; i < 10; i++) {
      history.push(doc(`v${i}`));
    }
    expect(history.size).toBe(3);

    // Walking back yields the 3 most recent snapshots, oldest dropped.
    expect(history.undo(doc('now'))?.title).toBe('v9');
    expect(history.undo(doc('v9'))?.title).toBe('v8');
    expect(history.undo(doc('v8'))?.title).toBe('v7');
    expect(history.canUndo).toBe(false);
  });

  it('defaults capacity to 100', () => {
    const history = new EditHistory<Doc>();
    for (let i = 0; i < 150; i++) {
      history.push(doc(`v${i}`));
    }
    expect(history.size).toBe(100);
  });

  it('clear() empties both stacks', () => {
    const history = new EditHistory<Doc>();
    history.push(doc('v1'));
    history.undo(doc('v2'));
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
