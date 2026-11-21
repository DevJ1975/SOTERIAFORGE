import { TestBed } from '@angular/core/testing';
import { sessionState, T0 } from './engage-session.fixtures';
import type { Heatmap, SessionCrew } from './engage-session.model';
import { SessionBlockBarComponent } from './session-block-bar.component';
import { SessionCrewComponent } from './session-crew.component';
import { SessionHeatmapComponent } from './session-heatmap.component';

describe('SessionBlockBarComponent', () => {
  it('shows the stages, which one is running and the time left in it', () => {
    const fixture = TestBed.createComponent(SessionBlockBarComponent);
    fixture.componentRef.setInput('state', sessionState());
    fixture.componentRef.setInput('now', T0 + 12_000);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('30-minute block');
    expect(el.textContent).toContain('Block 2 of 4');
    expect(el.querySelector('.eg-gold')?.textContent).toBe('01:48');
    const steps = Array.from(el.querySelectorAll('li'));
    expect(steps.map((s) => s.querySelector('span')?.textContent)).toEqual([
      'Teach',
      'Hunt',
      'Huddle',
      'Report',
      'Debrief',
    ]);
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(steps[1].classList.contains('is-current')).toBe(true);
    expect(steps[0].classList.contains('is-done')).toBe(true);
    // The state is in words too, not only colour.
    expect(steps.map((s) => s.querySelector('small')?.textContent)).toEqual([
      '10 min · done',
      '3 min · now',
      '6 min · next',
      '6 min · next',
      '5 min · next',
    ]);
  });
});

describe('SessionCrewComponent', () => {
  it('lists my crew with points, the lead, the total and the crew rank', () => {
    const crew: SessionCrew = {
      id: 'c1',
      name: 'Crew Alpha',
      rank: 2,
      crewCount: 4,
      total: 3000,
      members: [
        { memberId: 'm1', name: 'Marcus Walker', isLead: true, points: 680, isMe: true },
        { memberId: 'm2', name: 'Elena Ruiz', isLead: false, points: 1610, isMe: false },
      ],
    };
    const fixture = TestBed.createComponent(SessionCrewComponent);
    fixture.componentRef.setInput('crew', crew);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Crew Alpha');
    expect(el.textContent).toContain('#2 of 4 crews');
    const rows = Array.from(el.querySelectorAll('li')).map((li) => [
      li.querySelector('.who')?.textContent?.replace(/\s+/g, ' ').trim(),
      li.querySelector('.eg-gold')?.textContent,
    ]);
    expect(rows).toEqual([
      ['Marcus Walker · lead · you', '680'],
      ['Elena Ruiz', '1,610'],
    ]);
    expect(el.querySelector('.total__n')?.textContent).toBe('3,000');
  });
});

describe('SessionHeatmapComponent', () => {
  const heatmap: Heatmap = {
    activities: [
      { id: 'a1', kind: 'hunt', prompt: 'Find the real attack.', block: 1 },
      { id: 'a2', kind: 'poll', prompt: 'Which tell convinced you?', block: 1 },
    ],
    crews: [
      {
        crewId: 'c1',
        name: 'Crew Alpha',
        cells: [
          { activityId: 'a1', members: 5, responded: 5, correct: 4, rate: 0.8 },
          { activityId: 'a2', members: 5, responded: 3, correct: null, rate: 0.6 },
        ],
      },
      {
        crewId: 'c2',
        name: 'Crew Bravo',
        cells: [{ activityId: 'a1', members: 4, responded: 0, correct: 0, rate: null }],
      },
    ],
  };

  function render(value: Heatmap): HTMLElement {
    const fixture = TestBed.createComponent(SessionHeatmapComponent);
    fixture.componentRef.setInput('heatmap', value);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('is a real table with a number in every cell', () => {
    const el = render(heatmap);
    expect(el.querySelector('caption')?.textContent).toContain('Share of each crew');
    expect(el.querySelectorAll('thead th[scope="col"]')).toHaveLength(3);
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    expect(rows.map((r) => r.querySelector('th[scope="row"]')?.textContent)).toEqual([
      'Crew Alpha',
      'Crew Bravo',
    ]);
    const cells = Array.from(rows[0].querySelectorAll('td')).map((td) => [
      td.querySelector('.pct')?.textContent,
      td.querySelector('.count')?.textContent,
    ]);
    expect(cells).toEqual([
      ['80%', '4 of 5 correct'],
      ['60%', '3 of 5 answered'],
    ]);
    expect(el.textContent).toContain('No individual answers');
  });

  it('says so in words when a crew did not answer or took no part', () => {
    const el = render(heatmap);
    const bravo = Array.from(el.querySelectorAll('tbody tr')[1].querySelectorAll('td')).map(
      (td) => [td.querySelector('.pct')?.textContent, td.querySelector('.count')?.textContent],
    );
    expect(bravo).toEqual([
      ['No answers', '0 of 4 correct'],
      [undefined, 'No data'],
    ]);
  });

  it('tints by rate but never relies on the tint', () => {
    const el = render(heatmap);
    const cells = el.querySelectorAll<HTMLElement>('tbody tr:first-child td');
    expect(cells[0].style.background).not.toBe(cells[1].style.background);
    expect(cells[0].textContent).toContain('80%');
  });

  it('explains an empty debrief', () => {
    const el = render({ activities: [], crews: [] });
    expect(el.querySelector('table')).toBeNull();
    expect(el.textContent).toContain('No activities have been run');
  });
});
