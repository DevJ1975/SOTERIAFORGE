import { TestBed } from '@angular/core/testing';
import { CoachApi } from './coach-api';
import { TutorService } from './tutor.service';

describe('TutorService', () => {
  const ctx = { tenantId: 'tenant', uid: 'user', courseId: 'course' };
  const result = {
    answer: 'Basil needs sunlight.',
    abstained: false,
    citations: [
      { sourceId: 'source', chunkId: 1, label: 'Gardening', courseId: 'course', page: null },
    ],
  };
  let ask: jest.Mock;
  let service: TutorService;

  beforeEach(() => {
    ask = jest.fn().mockResolvedValue(result);
    TestBed.configureTestingModule({
      providers: [TutorService, { provide: CoachApi, useValue: { ask } }],
    });
    service = TestBed.inject(TutorService);
  });

  it('starts with empty transient history', () => {
    expect(service.messages()).toEqual([]);
    expect(service.pending()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('sends only question and course context, preserving messages and citations', async () => {
    await service.ask('What does basil need?', ctx);
    expect(ask).toHaveBeenCalledWith(
      'What does basil need?',
      'course',
      expect.any(AbortSignal),
      'general',
    );
    expect(service.messages().map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(service.messages()[1].citations[0].label).toBe('Gardening');
    expect(service.messages()[0].id).not.toBe(service.messages()[1].id);
  });

  it('prevents duplicate submissions while pending', async () => {
    const request = service.ask('One', ctx);
    expect(service.pending()).toBe(true);
    await service.ask('Two', ctx);
    expect(ask).toHaveBeenCalledTimes(1);
    await request;
    expect(service.pending()).toBe(false);
  });

  it('surfaces errors without inventing an assistant answer', async () => {
    ask.mockRejectedValue(new Error('Local inference unavailable'));
    await service.ask('Question', ctx);
    expect(service.error()).toBe('Local inference unavailable');
    expect(service.messages()).toHaveLength(1);
    expect(service.pending()).toBe(false);
  });

  it('discards late responses after the course or account changes', async () => {
    let resolve!: (value: typeof result) => void;
    ask.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const request = service.ask('Question', ctx);
    service.reset();
    resolve(result);
    await request;
    expect(service.messages()).toEqual([]);
    expect(service.pending()).toBe(false);
  });
});
