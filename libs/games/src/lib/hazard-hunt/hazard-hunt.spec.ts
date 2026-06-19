/**
 * Hazard Hunter — Jest tests for the pure modules only.
 * Deliberately does NOT import the component, world, hud, or audio.
 */
import { LEVELS, getLevel } from './hazard-data';
import { ShiftEngine, gradeForRatio } from './shift-engine';

describe('hazard-data integrity', () => {
  it('defines at least two levels', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(2);
  });

  it('seeds at least 10 hazards per level', () => {
    for (const level of LEVELS) {
      expect(level.hazards.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('has globally unique hazard ids', () => {
    const ids = LEVELS.flatMap((l) => l.hazards.map((h) => h.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every hazard a nonempty incident narrative and name', () => {
    for (const h of LEVELS.flatMap((l) => l.hazards)) {
      expect(h.name.trim().length).toBeGreaterThan(0);
      expect(h.incident.trim().length).toBeGreaterThan(40);
    }
  });

  it('uses real-format OSHA references (29 CFR 19xx.*) with titles', () => {
    for (const h of LEVELS.flatMap((l) => l.hazards)) {
      expect(h.oshaRef).toMatch(/^29 CFR 19\d\d\./);
      expect(h.oshaTitle.trim().length).toBeGreaterThan(0);
    }
  });

  it('grants more inspections than needed but not unlimited', () => {
    for (const level of LEVELS) {
      expect(level.inspections).toBeGreaterThanOrEqual(level.hazards.length);
      expect(level.inspections).toBeLessThan(level.hazards.length * 2);
    }
  });

  it('places every hazard with a finite 3D position', () => {
    for (const h of LEVELS.flatMap((l) => l.hazards)) {
      expect(h.position).toHaveLength(3);
      for (const c of h.position) expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('looks levels up by id', () => {
    expect(getLevel(1)?.name).toBe('WAREHOUSE');
    expect(getLevel(2)?.name).toBe('TOOL SHOP');
    expect(getLevel(3)?.name).toBe('ATL RAMP');
    expect(getLevel(99)).toBeUndefined();
  });

  it('includes the ATL RAMP shift with airport hazards', () => {
    const atl = getLevel(3);
    expect(atl?.shiftLabel).toBe('SHIFT 3 — HARTSFIELD RAMP');
    expect(atl?.hazards.length).toBeGreaterThanOrEqual(11);
    // Every ATL hazard reuses an archetype that also appears in earlier shifts.
    const earlierKinds = new Set(
      [...(getLevel(1)?.hazards ?? []), ...(getLevel(2)?.hazards ?? [])].map((h) => h.kind),
    );
    for (const h of atl?.hazards ?? []) {
      expect(earlierKinds.has(h.kind)).toBe(true);
    }
  });

  it('keeps every hazard inside its room half-extents', () => {
    for (const level of LEVELS) {
      for (const h of level.hazards) {
        expect(Math.abs(h.position[0])).toBeLessThanOrEqual(level.roomHalfWidth);
        expect(Math.abs(h.position[2])).toBeLessThanOrEqual(level.roomHalfDepth);
      }
    }
  });
});

describe('ShiftEngine', () => {
  const ids = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'];
  const make = (inspections = 12) => new ShiftEngine({ levelId: 1, hazardIds: ids, inspections });

  it('consumes one inspection per click, right or wrong', () => {
    const e = make(12);
    expect(e.inspectionsLeft).toBe(12);
    expect(e.inspect('h1').outcome).toBe('found');
    expect(e.inspectionsLeft).toBe(11);
    expect(e.inspect(null).outcome).toBe('wrong');
    expect(e.inspectionsLeft).toBe(10);
    expect(e.inspect('not-a-hazard').outcome).toBe('wrong');
    expect(e.inspectionsLeft).toBe(9);
  });

  it('does not consume an inspection for an already-found hazard', () => {
    const e = make(12);
    e.inspect('h1');
    const r = e.inspect('h1');
    expect(r.outcome).toBe('duplicate');
    expect(e.inspectionsLeft).toBe(11);
    expect(e.foundCount).toBe(1);
  });

  it('ends the shift when inspections run out and reports it', () => {
    const e = make(2);
    expect(e.inspect(null).shiftEnded).toBe(false);
    const last = e.inspect(null);
    expect(last.shiftEnded).toBe(true);
    expect(e.isEnded).toBe(true);
    expect(e.inspect('h1').outcome).toBe('shift-over');
  });

  it('ends the shift early when every hazard is found', () => {
    const e = make(12);
    let last;
    for (const id of ids) last = e.inspect(id);
    expect(last?.shiftEnded).toBe(true);
    expect(e.allFound).toBe(true);
    expect(e.inspectionsLeft).toBe(2);
  });

  it('scores base + unused bonus − miss penalty', () => {
    const e = make(12);
    for (const id of ids.slice(0, 8)) e.inspect(id); // 8 found
    e.inspect(null); // 1 wrong → 3 left
    const s = e.endShift();
    expect(s.breakdown.foundPoints).toBe(8 * 250);
    expect(s.breakdown.unusedBonus).toBe(3 * 100);
    expect(s.breakdown.missPenalty).toBe(2 * 150);
    expect(s.score).toBe(2000 + 300 - 300);
  });

  it('never returns a negative score', () => {
    const e = new ShiftEngine({ levelId: 1, hazardIds: ids, inspections: 10 });
    for (let i = 0; i < 10; i++) e.inspect(null);
    expect(e.summary().score).toBe(0);
  });

  it('lists every missed hazard at end of shift, in seed order', () => {
    const e = make(12);
    e.inspect('h2');
    e.inspect('h7');
    const s = e.endShift();
    expect(s.missed).toEqual(['h1', 'h3', 'h4', 'h5', 'h6', 'h8', 'h9', 'h10']);
    expect(s.found).toEqual(['h2', 'h7']);
    expect(s.foundCount).toBe(2);
    expect(s.total).toBe(10);
  });

  it('unlocks the next level at exactly 70% found', () => {
    const at = (n: number) => {
      const e = make(12);
      for (const id of ids.slice(0, n)) e.inspect(id);
      return e.endShift().unlockedNext;
    };
    expect(at(6)).toBe(false); // 60%
    expect(at(7)).toBe(true); // 70%
    expect(at(10)).toBe(true);
  });

  it('grades the shift by found ratio', () => {
    expect(gradeForRatio(1)).toBe('A');
    expect(gradeForRatio(0.9)).toBe('B');
    expect(gradeForRatio(0.7)).toBe('C');
    expect(gradeForRatio(0.5)).toBe('D');
    expect(gradeForRatio(0.3)).toBe('F');
  });

  it('rejects invalid configuration', () => {
    expect(() => new ShiftEngine({ levelId: 1, hazardIds: [], inspections: 5 })).toThrow();
    expect(() => new ShiftEngine({ levelId: 1, hazardIds: ids, inspections: 0 })).toThrow();
    expect(() => new ShiftEngine({ levelId: 1, hazardIds: ['a', 'a'], inspections: 5 })).toThrow();
  });

  it('matches real level data end-to-end (warehouse unlock path)', () => {
    const level = getLevel(1);
    expect(level).toBeDefined();
    if (!level) return;
    const e = new ShiftEngine({
      levelId: level.id,
      hazardIds: level.hazards.map((h) => h.id),
      inspections: level.inspections,
    });
    const need = Math.ceil(level.hazards.length * 0.7);
    for (const h of level.hazards.slice(0, need)) e.inspect(h.id);
    const s = e.endShift();
    expect(s.unlockedNext).toBe(true);
    expect(s.missed.length).toBe(level.hazards.length - need);
  });
});
