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
  let rate: jest.Mock;
  let service: TutorService;

  beforeEach(() => {
    ask = jest.fn().mockResolvedValue(result);
    rate = jest.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [TutorService, { provide: CoachApi, useValue: { askStream: ask, rate } }],
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
      { question: 'What does basil need?', courseId: 'course', agent: 'general' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
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

  it('passes the module through when the chat is scoped to one', async () => {
    await service.ask('Q', { ...ctx, moduleId: 'm1' });
    expect(ask.mock.calls[0][0]).toEqual({
      question: 'Q',
      courseId: 'course',
      agent: 'general',
      moduleId: 'm1',
    });
  });

  it('shows text as it streams, then replaces it with the validated answer', async () => {
    let finish!: (value: unknown) => void;
    ask.mockImplementation((_input, handlers) => {
      handlers.onStatus('generating');
      handlers.onDelta('Basil ');
      handlers.onDelta('needs sun');
      return new Promise((done) => (finish = done));
    });
    const request = service.ask('Q', ctx);
    await Promise.resolve();
    expect(service.stage()).toBe('generating');
    expect(service.messages()[1]).toMatchObject({ content: 'Basil needs sun', streaming: true });
    expect(service.announcement()).toBe('The tutor is working on an answer.');

    finish({ ...result, exchangeId: 'x1', followUps: ['How much sun?'], diagram: null });
    await request;
    const answer = service.messages()[1];
    expect(service.messages()).toHaveLength(2);
    expect(answer.content).toBe('Basil needs sunlight.');
    expect(answer.streaming).toBeUndefined();
    expect(answer.followUps).toEqual(['How much sun?']);
    expect(service.announcement()).toBe('Tutor: Basil needs sunlight.');
    expect(service.stage()).toBeNull();
  });

  it('drops unvalidated streamed text when the answer fails', async () => {
    ask.mockImplementation(async (_input, handlers) => {
      handlers.onDelta('Half an ans');
      throw new Error('The answer was cut off. Try again.');
    });
    await service.ask('Q', ctx);
    expect(service.messages().map((m) => m.role)).toEqual(['user']);
    expect(service.error()).toBe('The answer was cut off. Try again.');
  });

  it('keeps follow-up suggestions on the latest answer only', async () => {
    ask.mockResolvedValue({ ...result, followUps: ['Next?'] });
    await service.ask('One', ctx);
    await service.ask('Two', ctx);
    const answers = service.messages().filter((m) => m.role === 'assistant');
    expect(answers.map((m) => m.followUps)).toEqual([[], ['Next?']]);
  });

  describe('rating', () => {
    const answerId = () => service.messages()[1].id;
    beforeEach(async () => {
      ask.mockResolvedValue({ ...result, exchangeId: 'x1' });
      await service.ask('Q', ctx);
    });

    it('sends a thumbs up, and the same thumb again clears it', async () => {
      await service.rate(answerId(), 'up');
      expect(rate).toHaveBeenLastCalledWith('x1', 'up', undefined);
      expect(service.messages()[1].rating).toBe('up');
      await service.rate(answerId(), 'up');
      expect(rate).toHaveBeenLastCalledWith('x1', null, undefined);
      expect(service.messages()[1].rating).toBeNull();
    });

    it('adds a note to a thumbs down without toggling it off', async () => {
      await service.rate(answerId(), 'down');
      await service.rate(answerId(), 'down', 'Wrong page');
      expect(rate).toHaveBeenLastCalledWith('x1', 'down', 'Wrong page');
      expect(service.messages()[1].rating).toBe('down');
    });

    it('puts the rating back and says so when the server refuses', async () => {
      rate.mockImplementation(async () => {
        throw new Error('Rating failed');
      });
      await service.rate(answerId(), 'down');
      expect(service.messages()[1].rating).toBeNull();
      expect(service.error()).toBe('Rating failed');
    });

    it('does nothing for an answer that was not logged', async () => {
      service.reset();
      ask.mockResolvedValue({ ...result, exchangeId: null });
      await service.ask('Q', ctx);
      await service.rate(answerId(), 'up');
      expect(rate).not.toHaveBeenCalled();
    });
  });
});
