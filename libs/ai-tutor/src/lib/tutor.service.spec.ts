/**
 * Mock @angular/fire/functions before any imports so the module initialisation
 * (which transitively requires @firebase/auth → fetch) never runs in Jest/Node.
 */
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: jest.fn(),
}));

import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TutorService, TUTOR_FUNCTIONS } from './tutor.service';

/** Subclass that replaces the Firebase callable with a controlled stub. */
@Injectable()
class TutorServiceStub extends TutorService {
  stubbedAnswer = 'Photosynthesis converts sunlight into energy.';
  stubbedCitations = [
    { sourceId: 'src-001', label: 'Biology 101', moduleId: 'mod-001' },
  ];

  protected override invoke(
    _question: string,
    _tenantId: string,
    _uid: string,
  ): Promise<{ answer: string; citations: Array<{ sourceId: string; label?: string; moduleId?: string }> }> {
    return Promise.resolve({
      answer: this.stubbedAnswer,
      citations: this.stubbedCitations,
    });
  }
}

/** Stub that always rejects, to test error handling. */
@Injectable()
class TutorServiceErrorStub extends TutorService {
  protected override invoke(
    _question: string,
    _tenantId: string,
    _uid: string,
  ): Promise<{ answer: string; citations: Array<{ sourceId: string; label?: string; moduleId?: string }> }> {
    return Promise.reject(new Error('Callable failed'));
  }
}

/** Opaque sentinel — never invoked because invoke() is overridden in stubs. */
const functionsSentinel = {};

describe('TutorService', () => {
  let service: TutorServiceStub;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TUTOR_FUNCTIONS, useValue: functionsSentinel },
        { provide: TutorService, useClass: TutorServiceStub },
      ],
    });
    service = TestBed.inject(TutorService) as TutorServiceStub;
  });

  it('creates the service', () => {
    expect(service).toBeTruthy();
  });

  it('starts with an empty messages array, pending false, and error null', () => {
    expect(service.messages()).toEqual([]);
    expect(service.pending()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('appends a user message and an assistant message with citations after ask()', async () => {
    await service.ask('What is photosynthesis?', {
      tenantId: 'tenant-acme',
      uid: 'user-xyz',
    });

    const msgs = service.messages();
    expect(msgs).toHaveLength(2);

    // --- user message ---
    const userMsg = msgs[0];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('What is photosynthesis?');
    expect(userMsg.tenantId).toBe('tenant-acme');
    expect(userMsg.uid).toBe('user-xyz');
    expect(userMsg.citations).toEqual([]);
    expect(typeof userMsg.id).toBe('string');
    expect(userMsg.id.length).toBeGreaterThan(0);

    // --- assistant message ---
    const assistantMsg = msgs[1];
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.content).toBe('Photosynthesis converts sunlight into energy.');
    expect(assistantMsg.tenantId).toBe('tenant-acme');
    expect(assistantMsg.uid).toBe('user-xyz');
    expect(assistantMsg.citations).toHaveLength(1);
    expect(assistantMsg.citations[0].sourceId).toBe('src-001');
    expect(assistantMsg.citations[0].label).toBe('Biology 101');
    expect(assistantMsg.citations[0].moduleId).toBe('mod-001');
    expect(typeof assistantMsg.id).toBe('string');
    expect(assistantMsg.id.length).toBeGreaterThan(0);

    // user and assistant must have different IDs
    expect(userMsg.id).not.toBe(assistantMsg.id);
  });

  it('pending is true while the call is in flight and false after resolution', async () => {
    // pending starts false
    expect(service.pending()).toBe(false);

    // kick off without awaiting — signal updates synchronously before the async invoke
    const promise = service.ask('test question', { tenantId: 't1', uid: 'u1' });
    expect(service.pending()).toBe(true);

    await promise;
    expect(service.pending()).toBe(false);
  });

  it('does not throw to the caller on invoke failure; sets error signal instead', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: TUTOR_FUNCTIONS, useValue: functionsSentinel },
        { provide: TutorService, useClass: TutorServiceErrorStub },
      ],
    });
    const errorService = TestBed.inject(TutorService) as TutorServiceErrorStub;

    // Must resolve (not reject)
    await expect(
      errorService.ask('Will this fail?', { tenantId: 't1', uid: 'u1' }),
    ).resolves.toBeUndefined();

    expect(errorService.error()).toBe('Callable failed');
    // Only the user message was appended; no assistant message on failure
    expect(errorService.messages()).toHaveLength(1);
    expect(errorService.messages()[0].role).toBe('user');
    expect(errorService.pending()).toBe(false);
  });
});
