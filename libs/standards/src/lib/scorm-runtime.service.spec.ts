import { TestBed } from '@angular/core/testing';
import { ScormRuntimeService } from './scorm-runtime.service';

/**
 * Tests for the scaled-score derivation (MO-09). `_updateSignals` is private;
 * we invoke it via a typed cast to assert the [0–1] `score` signal for both
 * SCORM versions, since the public handlers (`_handleCommit`/`_handleFinish`)
 * delegate to it.
 */
type WithUpdateSignals = {
  _updateSignals(cmi: Record<string, unknown>): void;
};

describe('ScormRuntimeService — score scaling (MO-09)', () => {
  let svc: ScormRuntimeService;
  let updateSignals: (cmi: Record<string, unknown>) => void;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ScormRuntimeService);
    updateSignals = (cmi) => (svc as unknown as WithUpdateSignals)._updateSignals(cmi);
  });

  it('SCORM 1.2: raw 80 / max 100 yields a scaled score of 0.8', () => {
    updateSignals({ cmi: { core: { score: { raw: 80, max: 100 } } } });
    expect(svc.score()).toBe(0.8);
  });

  it('SCORM 1.2: defaults max to 100 when absent (raw 45 -> 0.45)', () => {
    updateSignals({ cmi: { core: { score: { raw: 45 } } } });
    expect(svc.score()).toBeCloseTo(0.45, 5);
  });

  it('SCORM 1.2: clamps to [0,1] when raw exceeds max', () => {
    updateSignals({ cmi: { core: { score: { raw: 120, max: 100 } } } });
    expect(svc.score()).toBe(1);
  });

  it('SCORM 1.2: parses numeric-string raw/max', () => {
    updateSignals({ cmi: { core: { score: { raw: '50', max: '200' } } } });
    expect(svc.score()).toBeCloseTo(0.25, 5);
  });

  it('SCORM 2004: scaled 0.8 yields a score of 0.8 (already normalised)', () => {
    updateSignals({ cmi: { score: { scaled: 0.8 } } });
    expect(svc.score()).toBe(0.8);
  });

  it('SCORM 2004 takes precedence over 1.2 raw when both present', () => {
    updateSignals({
      cmi: { score: { scaled: 0.6 }, core: { score: { raw: 90, max: 100 } } },
    });
    expect(svc.score()).toBe(0.6);
  });

  it('leaves the score signal unchanged when no score data is present', () => {
    expect(svc.score()).toBeNull();
    updateSignals({ cmi: {} });
    expect(svc.score()).toBeNull();
  });
});
