import { TestBed } from '@angular/core/testing';
import { CoachApi } from './coach-api';
import { TutorChatComponent } from './tutor-chat.component';

describe('Course-scoped tutor chat', () => {
  const api = { courses: jest.fn(), profiles: jest.fn(), askStream: jest.fn(), rate: jest.fn() };
  const asked = (agent = 'general', extra: object = {}) => [
    { question: 'Question', courseId: 'c1', agent, ...extra },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  ];
  beforeEach(() => {
    api.courses.mockReset().mockResolvedValue([{ id: 'c1', title: 'Gardening' }]);
    api.profiles.mockReset().mockResolvedValue([
      { id: 'general', title: 'Course Tutor', description: '', references: [] },
      { id: 'workplace-ai', title: 'AI for the Workplace', description: '', references: [] },
      { id: 'cybersecurity-ai', title: 'AI in Cybersecurity', description: '', references: [] },
    ]);
    api.askStream
      .mockReset()
      .mockResolvedValue({ answer: '<script>unsafe</script>', citations: [], abstained: true });
    api.rate.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [TutorChatComponent],
      providers: [{ provide: CoachApi, useValue: api }],
    });
  });

  async function render(courseId = '') {
    const fixture = TestBed.createComponent(TutorChatComponent);
    fixture.componentRef.setInput('tenantId', 'acme');
    fixture.componentRef.setInput('uid', 'learner');
    fixture.componentRef.setInput('courseId', courseId);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('requires a permitted course on the standalone page', async () => {
    const fixture = await render();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Gardening');
  });

  it('uses the supplied course context and renders answers as plain text', async () => {
    const fixture = await render('c1');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Question';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.askStream).toHaveBeenCalledWith(...asked());
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<script>unsafe</script>');
    fixture.componentRef.setInput('courseId', 'c2');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('<script>unsafe</script>');
  });

  it('switches specialist profiles, clears history, and sends the selected agent', async () => {
    const fixture = await render('c1');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const send = async () => {
      input.value = 'Question';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await send();
    expect(fixture.nativeElement.textContent).toContain('<script>unsafe</script>');
    const agent = fixture.nativeElement.querySelector(
      '[aria-label="Tutor agent"]',
    ) as HTMLSelectElement;
    agent.value = 'workplace-ai';
    agent.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('<script>unsafe</script>');
    await send();
    expect(api.askStream).toHaveBeenLastCalledWith(...asked('workplace-ai'));
    agent.value = 'cybersecurity-ai';
    agent.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await send();
    expect(api.askStream).toHaveBeenLastCalledWith(...asked('cybersecurity-ai'));
  });

  describe('a full answer', () => {
    const full = {
      exchangeId: 'x1',
      answer: 'Lock out, then tag out.',
      abstained: false,
      citations: [
        { sourceId: 's1', chunkId: 1, label: 'LOTO guide (page 2)', courseId: 'c1', page: 2 },
      ],
      diagram: {
        type: 'linear_flow',
        title: 'Lockout order',
        alt: 'Step 1: shut down. Step 2: lock.',
        steps: [{ label: 'Shut down' }, { label: 'Lock' }],
      },
      followUps: ['Who removes the lock?'],
    };
    const el = (f: Awaited<ReturnType<typeof render>>) => f.nativeElement as HTMLElement;
    const buttonNamed = (f: Awaited<ReturnType<typeof render>>, text: string) =>
      Array.from(el(f).querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as
        | HTMLButtonElement
        | undefined;

    async function answered(moduleId = '') {
      api.askStream.mockResolvedValue(full);
      const fixture = await render('c1');
      fixture.componentRef.setInput('moduleId', moduleId);
      const input = el(fixture).querySelector('.tutor-chat__input') as HTMLInputElement;
      input.value = 'Question';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      buttonNamed(fixture, 'Send')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }
    async function settle(fixture: Awaited<ReturnType<typeof render>>) {
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('shows source chips, the diagram and one polite announcement of the answer', async () => {
      const fixture = await answered();
      expect(el(fixture).querySelector('.tutor-chat__citation-chip')?.textContent).toContain(
        'LOTO guide (page 2)',
      );
      expect(el(fixture).querySelector('assurance-coach-diagram svg[role="img"]')).toBeTruthy();
      const live = el(fixture).querySelector('[aria-live="polite"]');
      expect(live?.textContent?.trim()).toBe('Tutor: Lock out, then tag out.');
      // The message list itself is not a live region, so tokens are not re-announced.
      expect(
        el(fixture).querySelector('.tutor-chat__messages')?.getAttribute('aria-live'),
      ).toBeNull();
    });

    it('sends the module when the chat is opened for one', async () => {
      await answered('m1');
      expect(api.askStream).toHaveBeenLastCalledWith(...asked('general', { moduleId: 'm1' }));
    });

    it('asks a suggested follow-up when it is chosen', async () => {
      const fixture = await answered();
      buttonNamed(fixture, 'Who removes the lock?')?.click();
      await settle(fixture);
      expect(api.askStream.mock.calls.at(-1)[0].question).toBe('Who removes the lock?');
    });

    it('rates with thumbs, and offers an optional note after a thumbs down', async () => {
      const fixture = await answered();
      const up = buttonNamed(fixture, 'Helpful') as HTMLButtonElement;
      up.click();
      await settle(fixture);
      expect(api.rate).toHaveBeenLastCalledWith('x1', 'up', undefined);
      expect(up.getAttribute('aria-pressed')).toBe('true');

      buttonNamed(fixture, 'Not helpful')?.click();
      await settle(fixture);
      expect(api.rate).toHaveBeenLastCalledWith('x1', 'down', undefined);
      const note = el(fixture).querySelector('.tutor-chat__note input') as HTMLInputElement;
      note.value = 'Cites the wrong page';
      note.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      buttonNamed(fixture, 'Send note')?.click();
      await settle(fixture);
      expect(api.rate).toHaveBeenLastCalledWith('x1', 'down', 'Cites the wrong page');
      expect(el(fixture).textContent).toContain('Your instructor will see this');
    });

    it('offers no rating when the answer was not logged', async () => {
      api.askStream.mockResolvedValue({ ...full, exchangeId: null });
      const fixture = await render('c1');
      const input = el(fixture).querySelector('.tutor-chat__input') as HTMLInputElement;
      input.value = 'Question';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      buttonNamed(fixture, 'Send')?.click();
      await settle(fixture);
      expect(buttonNamed(fixture, 'Helpful')).toBeUndefined();
    });
  });
});
