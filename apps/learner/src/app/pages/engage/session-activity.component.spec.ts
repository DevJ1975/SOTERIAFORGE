import { ComponentFixture, TestBed } from '@angular/core/testing';
import { activity, T0 } from './engage-session.fixtures';
import type { SessionActivity } from './engage-session.model';
import { SessionActivityComponent } from './session-activity.component';

describe('SessionActivityComponent', () => {
  let fixture: ComponentFixture<SessionActivityComponent>;
  const sent: string[] = [];
  const el = () => fixture.nativeElement as HTMLElement;
  const radios = () => Array.from(el().querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const submit = () =>
    Array.from(el().querySelectorAll('button')).find((b) =>
      /Submit answer|Send vote/.test(b.textContent ?? ''),
    );
  const live = () => el().querySelector('[aria-live="polite"]')?.textContent ?? '';

  function show(value: SessionActivity, now = T0): void {
    fixture.componentRef.setInput('activity', value);
    fixture.componentRef.setInput('now', now);
    fixture.detectChanges();
  }

  beforeEach(() => {
    sent.length = 0;
    TestBed.configureTestingModule({ imports: [SessionActivityComponent] });
    fixture = TestBed.createComponent(SessionActivityComponent);
    fixture.componentInstance.respond.subscribe((id) => sent.push(id));
  });

  describe('Threat Hunt', () => {
    it('shows the tickets as one radio group with a server-timed countdown', () => {
      show(activity(), T0 + 31_000);
      expect(el().textContent).toContain('Threat Hunt');
      expect(el().textContent).toContain('Find the real attack.');
      expect(el().querySelector('.sf-timer')?.textContent).toBe('2:29');
      expect(radios()).toHaveLength(3);
      expect(new Set(radios().map((r) => r.name)).size).toBe(1);
      expect(el().querySelector('fieldset')?.getAttribute('aria-labelledby')).toBe('act-act-1');
      expect(el().textContent).toContain('timestamped by the server');
    });

    it('sends the chosen ticket once, and only after one is chosen', () => {
      show(activity());
      expect(submit()?.disabled).toBe(true);
      radios()[1].dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(submit()?.disabled).toBe(false);
      submit()?.click();
      expect(sent).toEqual(['o2']);
    });

    it('locks the answer and reports time, ranks and XP once submitted', () => {
      show(
        activity({
          myResponse: { optionId: 'o2', answeredAt: '2026-11-21T18:00:38Z', elapsedMs: 38_000 },
          myResult: { correct: true, crewRank: 1, classRank: 2, xp: 40 },
        }),
        T0 + 40_000,
      );
      expect(submit()).toBeUndefined();
      expect(el().querySelector('fieldset')?.disabled).toBe(true);
      expect(radios()[1].checked).toBe(true);
      expect(el().textContent).toContain(
        'Submitted 0:38 · Correct · 1st in crew · 2nd in class · +40 XP',
      );
      // The answer is not revealed to the class until the hunt closes.
      expect(el().textContent).not.toContain('The real attack');
    });

    it('says a wrong answer in words and leaves out ranks it does not have', () => {
      show(
        activity({
          myResponse: { optionId: 'o1', answeredAt: '2026-11-21T18:01:05Z', elapsedMs: 65_000 },
          myResult: { correct: false, crewRank: null, classRank: null, xp: 0 },
        }),
      );
      expect(el().textContent).toContain('Submitted 1:05 · Not the attack');
      expect(el().textContent).not.toContain('XP');
    });

    it('reveals the real attack and the spread once closed', () => {
      show(
        activity({
          status: 'closed',
          correctOptionId: 'o2',
          myResponse: { optionId: 'o1', answeredAt: '2026-11-21T18:00:20Z', elapsedMs: 20_000 },
          myResult: { correct: false, crewRank: null, classRank: null, xp: 0 },
          results: {
            total: 4,
            counts: [
              { optionId: 'o1', count: 1 },
              { optionId: 'o2', count: 3 },
            ],
          },
        }),
      );
      const options = Array.from(el().querySelectorAll('.option'));
      expect(options[1].textContent).toContain('The real attack');
      expect(options[1].textContent).toContain('75%');
      expect(options[0].textContent).toContain('Your answer');
      expect(options[0].textContent).toContain('25%');
      expect(options[2].textContent).toContain('0%');
      expect(el().textContent).toContain('Closed');
      expect(el().querySelector('.sf-timer')).toBeNull();
    });

    it('stops accepting answers when the clock runs out, before the server closes it', () => {
      show(activity(), T0 + 181_000);
      expect(submit()).toBeUndefined();
      expect(el().textContent).toContain('You did not answer in time.');
    });

    it('announces the countdown at a few moments, not every second', () => {
      show(activity(), T0);
      expect(live()).toBe('Threat Hunt is open. 3 minutes to answer.');
      show(activity(), T0 + 60_000);
      expect(live()).toBe('Threat Hunt is open. 3 minutes to answer.');
      show(activity(), T0 + 150_000);
      expect(live()).toBe('30 seconds left.');
      show(activity(), T0 + 151_000);
      expect(live()).toBe('30 seconds left.');
      show(activity(), T0 + 170_000);
      expect(live()).toBe('10 seconds left.');
      show(activity({ status: 'closed' }), T0 + 175_000);
      expect(live()).toBe('Threat Hunt is closed.');
    });
  });

  describe('live poll', () => {
    const poll = (over: Partial<SessionActivity> = {}) =>
      activity({
        kind: 'poll',
        prompt: 'Which tell convinced you?',
        results: {
          total: 3,
          counts: [
            { optionId: 'o1', count: 2 },
            { optionId: 'o2', count: 1 },
          ],
        },
        ...over,
      });

    it('shows live percentages as numbers beside the bars', () => {
      show(poll());
      expect(el().textContent).toContain('Live poll');
      const options = Array.from(el().querySelectorAll('.option'));
      expect(options.map((o) => o.querySelector('.option__pct')?.textContent)).toEqual([
        '67%',
        '33%',
        '0%',
      ]);
      expect(
        options.map((o) => (o.querySelector('.bar__fill') as HTMLElement).style.width),
      ).toEqual(['67%', '33%', '0%']);
      expect(el().textContent).toContain('3 answers');
    });

    it('sends one vote and then marks it', () => {
      show(poll());
      radios()[0].dispatchEvent(new Event('change'));
      fixture.detectChanges();
      submit()?.click();
      expect(sent).toEqual(['o1']);
      show(
        poll({
          myResponse: { optionId: 'o1', answeredAt: '2026-11-21T18:00:05Z', elapsedMs: 5000 },
        }),
      );
      expect(submit()).toBeUndefined();
      expect(el().querySelectorAll('.option')[0].textContent).toContain('Your answer');
    });

    it('starts a fresh choice when the host opens another activity', () => {
      show(poll());
      radios()[0].dispatchEvent(new Event('change'));
      fixture.detectChanges();
      show(poll({ id: 'act-2' }));
      expect(radios().some((r) => r.checked)).toBe(false);
      expect(submit()?.disabled).toBe(true);
    });
  });
});
