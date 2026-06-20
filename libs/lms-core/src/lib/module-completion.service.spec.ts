// Stub @angular/fire/functions so importing it under jsdom doesn't pull in
// Firebase's Node entry, and so we can assert the callable invocations.
const callableImpl = jest.fn();
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: (_fns: unknown, name: string) => {
    return (data: unknown) => callableImpl(name, data);
  },
}));

import { TestBed } from '@angular/core/testing';
import { Functions } from '@angular/fire/functions';
import {
  ModuleCompletionService,
  type CompleteModuleInput,
  type CompleteModuleResult,
} from './module-completion.service';
import { installFakeIndexedDb, uninstallFakeIndexedDb } from './fake-indexed-db.testkit';

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const input: CompleteModuleInput = {
  tenantId: 'acme',
  courseId: 'c1',
  moduleId: 'm1',
  score: 80,
};

const mockResult: CompleteModuleResult = {
  ok: true,
  progressPct: 50,
  completed: false,
  firstCompletion: true,
};

describe('ModuleCompletionService — back-compat complete()', () => {
  beforeEach(() => {
    callableImpl.mockReset();
    setOnline(true);
    TestBed.configureTestingModule({
      providers: [{ provide: Functions, useValue: {} }],
    });
  });

  afterEach(() => {
    setOnline(true);
    TestBed.resetTestingModule();
  });

  it('invokes completeModule callable and returns the result', async () => {
    callableImpl.mockResolvedValue({ data: mockResult });
    const svc = TestBed.inject(ModuleCompletionService);

    const result = await svc.complete(input);

    expect(callableImpl).toHaveBeenCalledWith('completeModule', input);
    expect(result).toEqual(mockResult);
  });

  it('returns null (does not throw) when the callable rejects', async () => {
    callableImpl.mockRejectedValue(new Error('functions/internal'));
    const svc = TestBed.inject(ModuleCompletionService);

    await expect(svc.complete(input)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MO-10 — offline-durable completion outbox
// ---------------------------------------------------------------------------
describe('ModuleCompletionService — offline outbox (MO-10)', () => {
  beforeEach(() => {
    callableImpl.mockReset();
    installFakeIndexedDb();
    setOnline(true);
    TestBed.configureTestingModule({
      providers: [{ provide: Functions, useValue: {} }],
    });
  });

  afterEach(() => {
    uninstallFakeIndexedDb();
    setOnline(true);
    TestBed.resetTestingModule();
  });

  it('confirms synchronously when online and the callable succeeds', async () => {
    callableImpl.mockResolvedValue({ data: mockResult });
    const svc = TestBed.inject(ModuleCompletionService);

    const outcome = await svc.completeWithOutbox(input);

    expect(outcome.confirmed).toBe(true);
    expect(outcome.durable).toBe(true);
    expect(outcome.result).toEqual(mockResult);
    expect(svc.pendingCount()).toBe(0);
  });

  it('queues (durably) when offline without attempting the callable', async () => {
    setOnline(false);
    const svc = TestBed.inject(ModuleCompletionService);

    const outcome = await svc.completeWithOutbox(input);

    expect(outcome.confirmed).toBe(false);
    expect(outcome.durable).toBe(true);
    expect(callableImpl).not.toHaveBeenCalled();
    expect(svc.pendingCount()).toBe(1);
  });

  it('queues when the callable rejects while online', async () => {
    callableImpl.mockRejectedValue(new Error('functions/internal'));
    const svc = TestBed.inject(ModuleCompletionService);

    const outcome = await svc.completeWithOutbox(input);

    expect(outcome.confirmed).toBe(false);
    expect(outcome.durable).toBe(true);
    expect(svc.pendingCount()).toBe(1);
  });

  it('queue-then-flush: a queued completion is sent and reconciled on reconnect', async () => {
    setOnline(false);
    const svc = TestBed.inject(ModuleCompletionService);
    await svc.completeWithOutbox(input);
    expect(svc.pendingCount()).toBe(1);

    const reconciled: Array<{ input: CompleteModuleInput; result: CompleteModuleResult }> = [];
    svc.onReconciled((i, result) => reconciled.push({ input: i, result }));

    callableImpl.mockResolvedValue({ data: mockResult });
    setOnline(true);
    await svc.flushOutbox();

    expect(callableImpl).toHaveBeenCalledTimes(1);
    expect(callableImpl).toHaveBeenCalledWith('completeModule', input);
    expect(svc.pendingCount()).toBe(0);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].input.moduleId).toBe('m1');
    expect(reconciled[0].result).toEqual(mockResult);
  });

  it('a queued completion survives a reload and flushes on startup', async () => {
    setOnline(false);
    const first = TestBed.inject(ModuleCompletionService);
    await first.completeWithOutbox(input);
    await flushMicrotasks();
    expect(first.pendingCount()).toBe(1);

    // Reload already-online: the constructor's startup flush should drain it.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Functions, useValue: {} }] });
    callableImpl.mockResolvedValue({ data: mockResult });
    setOnline(true);

    const reloaded = TestBed.inject(ModuleCompletionService);
    await flushMicrotasks();

    expect(callableImpl).toHaveBeenCalledWith('completeModule', input);
    expect(reloaded.pendingCount()).toBe(0);
  });

  it('the online event triggers an outbox flush', async () => {
    setOnline(false);
    const svc = TestBed.inject(ModuleCompletionService);
    await svc.completeWithOutbox(input);
    expect(svc.pendingCount()).toBe(1);

    callableImpl.mockResolvedValue({ data: mockResult });
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await flushMicrotasks();

    expect(callableImpl).toHaveBeenCalledWith('completeModule', input);
    expect(svc.pendingCount()).toBe(0);
  });
});
