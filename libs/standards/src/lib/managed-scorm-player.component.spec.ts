import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ManagedScormPlayerComponent } from './managed-scorm-player.component';
import { StandardsApi } from './standards-api';

describe('isolated SCORM bridge', () => {
  let fixture: ComponentFixture<ManagedScormPlayerComponent>;
  const launch = {
    id: 'launch-1',
    url: 'https://content.example.test/launch/token/',
    origin: 'https://content.example.test',
    expiresAt: '2099-01-01T00:00:00Z',
  };
  const api = {
    launch: jest.fn(),
    commit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    api.launch.mockResolvedValue(launch);
    api.commit.mockResolvedValue({ sequence: 1, completion: null });
    await TestBed.configureTestingModule({
      imports: [ManagedScormPlayerComponent],
      providers: [{ provide: StandardsApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(ManagedScormPlayerComponent);
    fixture.componentRef.setInput('lessonId', 'lesson-1');
    fixture.detectChanges();
  });

  async function open(): Promise<HTMLIFrameElement> {
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('iframe')!;
  }

  function send(
    frame: HTMLIFrameElement,
    data: object,
    origin = launch.origin,
    source = frame.contentWindow,
  ) {
    window.dispatchEvent(new MessageEvent('message', { source, origin, data }));
  }

  it('only loads the isolated origin and locks down its frame', async () => {
    const frame = await open();
    expect(api.launch).toHaveBeenCalledWith('lesson-1');
    expect(frame.src).toBe(launch.url);
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('rejects same-origin launches before sanitizer bypass', async () => {
    api.launch.mockResolvedValueOnce({
      ...launch,
      url: `${window.location.origin}/launch/token/`,
      origin: window.location.origin,
    });
    await open();
    expect((fixture.nativeElement as HTMLElement).querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('invalid isolated content launch');
  });

  it('checks message origin, source and launch before sending any save', async () => {
    const frame = await open();
    const message = {
      type: 'forge.scorm.commit',
      launchId: launch.id,
      sequence: 1,
      cmi: { cmi: {} },
    };
    send(frame, message, 'https://evil.example.test');
    send(frame, message, launch.origin, window);
    send(frame, { ...message, launchId: 'other' });
    send(frame, { ...message, sequence: -1 });
    await fixture.whenStable();
    expect(api.commit).not.toHaveBeenCalled();
    send(frame, message);
    await fixture.whenStable();
    expect(api.commit).toHaveBeenCalledWith(launch.id, { sequence: 1, cmi: { cmi: {} } });
  });

  it('connects only to the actual wrapper and acknowledges a persisted completion', async () => {
    const frame = await open();
    const post = jest
      .spyOn(frame.contentWindow!, 'postMessage')
      .mockImplementation(() => undefined);
    const completion = { progressPct: 25, completed: false, firstCompletion: true, award: null };
    const completed = jest.fn();
    fixture.componentInstance.completed.subscribe(completed);
    api.commit.mockResolvedValueOnce({ sequence: 1, completion });
    send(frame, { type: 'forge.scorm.ready', launchId: launch.id });
    expect(post).toHaveBeenCalledWith(
      { type: 'forge.scorm.connect', launchId: launch.id },
      launch.origin,
    );
    send(frame, { type: 'forge.scorm.commit', launchId: launch.id, sequence: 1, cmi: { cmi: {} } });
    await fixture.whenStable();
    expect(completed).toHaveBeenCalledWith(completion);
    expect(post).toHaveBeenCalledWith(
      { type: 'forge.scorm.ack', launchId: launch.id, sequence: 1 },
      launch.origin,
    );
  });

  it('retains failed payloads and retries exactly the same sequence', async () => {
    const frame = await open();
    api.commit.mockRejectedValueOnce(new Error('Offline'));
    const message = {
      type: 'forge.scorm.commit',
      launchId: launch.id,
      sequence: 1,
      cmi: { cmi: { suspend_data: 'p2' } },
    };
    send(frame, message);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Offline');
    expect(fixture.nativeElement.textContent).not.toContain('Progress saved.');
    const retry = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Retry save'))!;
    retry.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.commit.mock.calls[0]).toEqual(api.commit.mock.calls[1]);
    expect(fixture.nativeElement.textContent).toContain('Progress saved.');
  });

  it('does not drop an earlier failed commit to accept newer state', async () => {
    const frame = await open();
    api.commit.mockRejectedValueOnce(new Error('Offline'));
    const message = {
      type: 'forge.scorm.commit',
      launchId: launch.id,
      sequence: 1,
      cmi: { cmi: {} },
    };
    send(frame, message);
    await fixture.whenStable();
    send(frame, { ...message, sequence: 2 });
    await fixture.whenStable();
    expect(api.commit).toHaveBeenCalledTimes(1);
  });

  it('ignores a save response after lesson changes', async () => {
    const frame = await open();
    let resolve: (value: object) => void = () => undefined;
    api.commit.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const completed = jest.fn();
    fixture.componentInstance.completed.subscribe(completed);
    send(frame, { type: 'forge.scorm.commit', launchId: launch.id, sequence: 1, cmi: { cmi: {} } });
    fixture.componentRef.setInput('lessonId', 'lesson-2');
    fixture.detectChanges();
    resolve({ sequence: 1, completion: { progressPct: 100 } });
    await fixture.whenStable();
    expect(completed).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('iframe')).toBeNull();
  });

  it('tracks dirty values before commit so navigation can warn', async () => {
    const frame = await open();
    send(frame, { type: 'forge.scorm.dirty', launchId: launch.id });
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
    send(frame, { type: 'forge.scorm.clean', launchId: launch.id });
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
  });
});
