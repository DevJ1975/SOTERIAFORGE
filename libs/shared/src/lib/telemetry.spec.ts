import { emit, setTelemetrySink } from './telemetry';

describe('telemetry', () => {
  afterEach(() => {
    setTelemetrySink(); // reset to the no-op sink
  });

  it('is a no-op by default (does not throw)', () => {
    expect(() => emit('event.name', { a: 1 })).not.toThrow();
  });

  it('routes events to an installed sink', () => {
    const sink = jest.fn();
    setTelemetrySink(sink);
    emit('progress.flushed', { synced: 3, failed: 0 });
    expect(sink).toHaveBeenCalledWith('progress.flushed', { synced: 3, failed: 0 });
  });

  it('forwards events without fields', () => {
    const sink = jest.fn();
    setTelemetrySink(sink);
    emit('app.started');
    expect(sink).toHaveBeenCalledWith('app.started', undefined);
  });

  it('resetting to default stops delivery to the old sink', () => {
    const sink = jest.fn();
    setTelemetrySink(sink);
    setTelemetrySink();
    emit('ignored');
    expect(sink).not.toHaveBeenCalled();
  });

  it('swallows sink errors so callers are unaffected', () => {
    setTelemetrySink(() => {
      throw new Error('sink boom');
    });
    expect(() => emit('event.name')).not.toThrow();
  });
});
