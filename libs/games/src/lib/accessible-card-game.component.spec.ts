import { ComponentFixture, TestBed } from '@angular/core/testing';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AccessibleCardGameComponent } from './accessible-card-game.component';
import type { CardGameConfig, GameResult } from './card-game.model';

expect.extend(toHaveNoViolations);

const flipCfg: CardGameConfig = {
  kind: 'flip_reveal',
  title: 'Flip',
  cards: [
    { id: 'c1', label: 'A', revealText: 'reveal a' },
    { id: 'c2', label: 'B', revealText: 'reveal b' },
  ],
};

const matchCfg: CardGameConfig = {
  kind: 'match_pairs',
  title: 'Match',
  shuffle: false,
  pairs: [
    { id: 'p1', question: { id: 'q1', label: 'Q1' }, answer: { id: 'a1', label: 'A1' } },
    { id: 'p2', question: { id: 'q2', label: 'Q2' }, answer: { id: 'a2', label: 'A2' } },
  ],
};

const sortCfg: CardGameConfig = {
  kind: 'sort_buckets',
  title: 'Sort',
  cards: [
    { id: 'c1', label: 'C1' },
    { id: 'c2', label: 'C2' },
  ],
  buckets: [
    { id: 'b1', label: 'B1', correctCardIds: ['c1'] },
    { id: 'b2', label: 'B2', correctCardIds: ['c2'] },
  ],
};

const scenarioCfg: CardGameConfig = {
  kind: 'scenario_cards',
  title: 'Scenarios',
  scenarios: [
    {
      id: 's1',
      prompt: 'P1',
      choices: [
        { id: 'x1', text: 'X1', isCorrect: true },
        { id: 'x2', text: 'X2', isCorrect: false },
      ],
    },
    {
      id: 's2',
      prompt: 'P2',
      choices: [
        { id: 'y1', text: 'Y1', isCorrect: false },
        { id: 'y2', text: 'Y2', isCorrect: true },
      ],
    },
  ],
};

type Cmp = AccessibleCardGameComponent & Record<string, (...args: never[]) => unknown>;

function render(config: CardGameConfig): {
  fixture: ComponentFixture<AccessibleCardGameComponent>;
  cmp: Cmp;
  result: () => GameResult | undefined;
} {
  const fixture = TestBed.createComponent(AccessibleCardGameComponent);
  let result: GameResult | undefined;
  fixture.componentRef.setInput('config', config);
  fixture.componentInstance.completed.subscribe((r) => (result = r));
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance as unknown as Cmp, result: () => result };
}

beforeEach(async () => {
  await TestBed.configureTestingModule({
    imports: [AccessibleCardGameComponent],
  }).compileComponents();
});

describe('AccessibleCardGameComponent', () => {
  it('has no accessibility violations for every kind', async () => {
    for (const cfg of [flipCfg, matchCfg, sortCfg, scenarioCfg]) {
      const { fixture } = render(cfg);
      expect(await axe(fixture.nativeElement)).toHaveNoViolations();
    }
  });

  it('flip_reveal completes (no score) when all cards are revealed', () => {
    const { cmp, result } = render(flipCfg);
    (cmp as unknown as { reveal: (id: string) => void }).reveal('c1');
    expect(result()).toBeUndefined();
    (cmp as unknown as { reveal: (id: string) => void }).reveal('c2');
    expect(result()).toEqual({ kind: 'flip_reveal', totalItems: 2, correctCount: 2 });
    expect(result()?.score).toBeUndefined();
  });

  it('match_pairs scores 100% when matched on first attempts', () => {
    const { cmp, result } = render(matchCfg);
    const cells = (
      cmp as unknown as { matchCells: () => Array<{ id: string; pairId: string }> }
    ).matchCells();
    const pick = (cmp as unknown as { pick: (c: unknown) => void }).pick.bind(cmp);
    const byPair = (pid: string) => cells.filter((c) => c.pairId === pid);
    const [p1q, p1a] = byPair('p1');
    const [p2q, p2a] = byPair('p2');
    pick(p1q);
    pick(p1a);
    pick(p2q);
    pick(p2a);
    expect(result()).toEqual({ kind: 'match_pairs', totalItems: 2, correctCount: 2, score: 100 });
  });

  it('match_pairs score reflects extra attempts on mismatch', () => {
    const { cmp, result } = render(matchCfg);
    const cells = (
      cmp as unknown as { matchCells: () => Array<{ id: string; pairId: string }> }
    ).matchCells();
    const pick = (cmp as unknown as { pick: (c: unknown) => void }).pick.bind(cmp);
    const byPair = (pid: string) => cells.filter((c) => c.pairId === pid);
    const [p1q] = byPair('p1');
    const [p2q, p2a] = byPair('p2');
    const [, p1a] = byPair('p1');
    pick(p1q); // select
    pick(p2q); // mismatch (attempt 1)
    pick(p1q);
    pick(p1a); // match p1 (attempt 2)
    pick(p2q);
    pick(p2a); // match p2 (attempt 3)
    // 2 pairs / 3 attempts -> 67%
    expect(result()?.score).toBe(67);
  });

  it('sort_buckets grades placements against correctCardIds', () => {
    const { cmp, result } = render(sortCfg);
    const setBucket = (
      cmp as unknown as { setBucket: (c: string, b: string) => void }
    ).setBucket.bind(cmp);
    setBucket('c1', 'b1'); // correct
    setBucket('c2', 'b1'); // wrong (c2 belongs in b2)
    (cmp as unknown as { checkSort: () => void }).checkSort();
    expect(result()).toEqual({ kind: 'sort_buckets', totalItems: 2, correctCount: 1, score: 50 });
  });

  it('scenario_cards scores correct choices', () => {
    const { cmp, result } = render(scenarioCfg);
    const s = (scenarioCfg as Extract<CardGameConfig, { kind: 'scenario_cards' }>).scenarios;
    const setAnswer = (
      cmp as unknown as { setAnswer: (sc: unknown, ch: unknown) => void }
    ).setAnswer.bind(cmp);
    setAnswer(s[0], s[0].choices[0]); // correct (x1)
    setAnswer(s[1], s[1].choices[0]); // wrong (y1)
    (cmp as unknown as { finishScenarios: () => void }).finishScenarios();
    expect(result()).toEqual({ kind: 'scenario_cards', totalItems: 2, correctCount: 1, score: 50 });
  });

  it('shows an error for an invalid config and does not render the game', () => {
    const { fixture } = render({ kind: 'flip_reveal', title: '', cards: [] } as CardGameConfig);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('.acg__grid')).toBeNull();
  });
});
