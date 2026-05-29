/**
 * Mock @angular/fire/functions before any imports so the module initialisation
 * (which transitively requires @firebase/auth → fetch) never runs in Jest/Node.
 */
const callableImpl = jest.fn();
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: (_fns: unknown, name: string) => {
    return (data: unknown) => callableImpl(name, data);
  },
}));

import { TestBed } from '@angular/core/testing';
import { Functions } from '@angular/fire/functions';
import { IngestService } from './ingest.service';

describe('IngestService', () => {
  beforeEach(() => {
    callableImpl.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: Functions, useValue: {} }],
    });
  });

  it('creates the service', () => {
    const service = TestBed.inject(IngestService);
    expect(service).toBeTruthy();
  });

  it('calls the ingestKnowledge callable with the provided input and returns data', async () => {
    callableImpl.mockResolvedValue({ data: { ok: true, chunks: 12 } });

    const service = TestBed.inject(IngestService);
    const result = await service.ingest({
      tenantId: 'acme',
      sourceId: 'src-001',
      text: 'Some long document text',
      label: 'Biology 101',
    });

    expect(callableImpl).toHaveBeenCalledWith('ingestKnowledge', {
      tenantId: 'acme',
      sourceId: 'src-001',
      text: 'Some long document text',
      label: 'Biology 101',
    });
    expect(result.ok).toBe(true);
    expect(result.chunks).toBe(12);
  });

  it('forwards optional moduleId when provided', async () => {
    callableImpl.mockResolvedValue({ data: { ok: true, chunks: 3 } });

    const service = TestBed.inject(IngestService);
    await service.ingest({
      tenantId: 'acme',
      sourceId: 'src-002',
      text: 'Module-specific text',
      moduleId: 'mod-abc',
    });

    expect(callableImpl).toHaveBeenCalledWith('ingestKnowledge', {
      tenantId: 'acme',
      sourceId: 'src-002',
      text: 'Module-specific text',
      moduleId: 'mod-abc',
    });
  });

  it('propagates callable errors to the caller', async () => {
    callableImpl.mockRejectedValue(new Error('Firebase error'));

    const service = TestBed.inject(IngestService);
    await expect(
      service.ingest({ tenantId: 'acme', sourceId: 's1', text: 'text' }),
    ).rejects.toThrow('Firebase error');
  });
});
