// Mock `scorm-again` (dynamically imported by the service) so we can assert how
// the API is constructed and seeded without loading the real SCORM engine.
const scorm12Instances: MockApi[] = [];
const scorm2004Instances: MockApi[] = [];

class MockApi {
  on = jest.fn();
  loadFromJSON = jest.fn();
  renderCMIToJSONObject = jest.fn(() => ({ cmi: {} }));
  constructor(public settings: Record<string, unknown>) {}
}

jest.mock('scorm-again', () => ({
  Scorm12API: jest.fn().mockImplementation((settings: Record<string, unknown>) => {
    const api = new MockApi(settings);
    scorm12Instances.push(api);
    return api;
  }),
  Scorm2004API: jest.fn().mockImplementation((settings: Record<string, unknown>) => {
    const api = new MockApi(settings);
    scorm2004Instances.push(api);
    return api;
  }),
}));

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

// ---------------------------------------------------------------------------
// MO-09 — resume seeding via loadFromJSON (FIX-1)
// ---------------------------------------------------------------------------

describe('ScormRuntimeService — resume seeding (MO-09)', () => {
  let svc: ScormRuntimeService;

  beforeEach(() => {
    scorm12Instances.length = 0;
    scorm2004Instances.length = 0;
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ScormRuntimeService);
  });

  afterEach(() => {
    svc.terminate();
    jest.clearAllMocks();
  });

  it('calls loadFromJSON with the UNWRAPPED cmi (2004) before the SCO loads', async () => {
    const initialCmi = {
      cmi: { suspend_data: 'page-3', score: { scaled: 0.5 } },
    };
    await svc.initialize({ version: '2004', initialCmi, persist: () => undefined });

    const api = scorm2004Instances[0];
    expect(api).toBeDefined();
    // Seeded with the inner cmi object, not the nested wrapper.
    expect(api.loadFromJSON).toHaveBeenCalledTimes(1);
    expect(api.loadFromJSON).toHaveBeenCalledWith({
      suspend_data: 'page-3',
      score: { scaled: 0.5 },
    });
    // No invalid `datastring` setting is passed to the API constructor.
    expect(api.settings).not.toHaveProperty('datastring');
  });

  it('calls loadFromJSON for SCORM 1.2 with the unwrapped cmi', async () => {
    const initialCmi = { cmi: { core: { lesson_location: 'slide-7' } } };
    await svc.initialize({ version: '1.2', initialCmi, persist: () => undefined });

    const api = scorm12Instances[0];
    expect(api.loadFromJSON).toHaveBeenCalledTimes(1);
    expect(api.loadFromJSON).toHaveBeenCalledWith({ core: { lesson_location: 'slide-7' } });
  });

  it('accepts an already-flat cmi object (no nested cmi key)', async () => {
    const initialCmi = { suspend_data: 'flat' };
    await svc.initialize({ version: '2004', initialCmi, persist: () => undefined });

    expect(scorm2004Instances[0].loadFromJSON).toHaveBeenCalledWith({ suspend_data: 'flat' });
  });

  it('does NOT call loadFromJSON when initialCmi is undefined', async () => {
    await svc.initialize({ version: '2004', persist: () => undefined });
    expect(scorm2004Instances[0].loadFromJSON).not.toHaveBeenCalled();
  });

  it('does NOT call loadFromJSON for an empty cmi object', async () => {
    await svc.initialize({ version: '2004', initialCmi: { cmi: {} }, persist: () => undefined });
    expect(scorm2004Instances[0].loadFromJSON).not.toHaveBeenCalled();
  });

  it('resets completed/score signals on terminate (no stale state for the next SCO)', async () => {
    await svc.initialize({ version: '2004', persist: () => undefined });
    svc.completed.set(true);
    svc.score.set(0.9);

    svc.terminate();

    expect(svc.completed()).toBe(false);
    expect(svc.score()).toBeNull();
  });
});
