import { TestBed } from '@angular/core/testing';
import type { CoachDiagram } from './coach-api';
import { CoachDiagramComponent, layoutDiagram, wrapText } from './coach-diagram.component';

const group = (label: string, ...points: string[]) => ({ label, points });
const diagrams: Record<CoachDiagram['type'], CoachDiagram> = {
  linear_flow: {
    type: 'linear_flow',
    title: 'Lockout order',
    alt: 'Three steps: shut down, isolate, lock.',
    steps: [
      { label: 'Shut down', detail: 'Use the normal stop.' },
      { label: 'Isolate' },
      { label: 'Lock' },
    ],
  },
  before_after: {
    type: 'before_after',
    title: 'Before and after lockout',
    alt: 'Before: energy present. After: energy isolated.',
    before: group('Before', 'Energy present'),
    after: group('After', 'Energy isolated', 'Lock applied'),
  },
  comparison: {
    type: 'comparison',
    title: 'Lock or tag',
    alt: 'A lock physically prevents; a tag only warns.',
    columns: [
      group('Lock', 'Physically prevents'),
      group('Tag', 'Warns only'),
      group('Both', 'Best'),
    ],
  },
  two_by_two: {
    type: 'two_by_two',
    title: 'Risk matrix',
    alt: 'Likelihood against severity; likely and severe is critical.',
    xAxis: { label: 'Likelihood', low: 'Unlikely', high: 'Likely' },
    yAxis: { label: 'Severity', low: 'Minor', high: 'Severe' },
    quadrants: [
      { label: 'Plan' },
      { label: 'Critical' },
      { label: 'Accept' },
      { label: 'Monitor' },
    ],
  },
};

describe('wrapText', () => {
  it('wraps on words and marks a cut with an ellipsis', () => {
    expect(wrapText('one two three', 7, 3)).toEqual(['one two', 'three']);
    expect(wrapText('one two three four five six', 7, 2)).toEqual(['one two', 'three…']);
  });
  it('cuts a word longer than the line instead of overflowing', () => {
    expect(wrapText('supercalifragilistic', 8, 2)).toEqual(['superca…']);
    expect(wrapText('', 8, 2)).toEqual([]);
  });
});

describe('CoachDiagramComponent', () => {
  function render(diagram: CoachDiagram): HTMLElement {
    const fixture = TestBed.createComponent(CoachDiagramComponent);
    fixture.componentRef.setInput('diagram', diagram);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it.each(Object.values(diagrams))(
    'renders a $type diagram with its text alternative',
    (diagram) => {
      const el = render(diagram);
      const svg = el.querySelector('svg') as SVGElement;
      expect(svg.getAttribute('role')).toBe('img');
      // The accessible name is the title and the description is the server's alt text.
      const title = el.querySelector(`#${svg.getAttribute('aria-labelledby')}`);
      const desc = el.querySelector(`#${svg.getAttribute('aria-describedby')}`);
      expect(title?.textContent).toBe(diagram.title);
      expect(desc?.textContent).toBe(diagram.alt);
      // ...and sighted readers can open the same text.
      expect(el.querySelector('details summary')?.textContent).toContain('Text version');
      expect(el.querySelector('details p')?.textContent).toBe(diagram.alt);
      expect(el.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
    },
  );

  it('numbers the steps of a flow and joins them with arrows', () => {
    const el = render(diagrams.linear_flow);
    const badges = Array.from(el.querySelectorAll('.cdg__badge-text')).map((b) =>
      b.textContent?.trim(),
    );
    expect(badges).toEqual(['1', '2', '3']);
    expect(el.querySelectorAll('path.cdg__arrow')).toHaveLength(2);
    expect(el.textContent).toContain('Use the normal stop.');
  });

  it('points from before to after, and marks the outcome by outline as well as colour', () => {
    const el = render(diagrams.before_after);
    expect(el.querySelectorAll('path.cdg__arrow')).toHaveLength(1);
    expect(el.querySelectorAll('rect.cdg__box--strong')).toHaveLength(1);
    expect(el.textContent).toContain('Lock applied');
  });

  it('lays out up to three comparison columns without an arrow', () => {
    const layout = layoutDiagram(diagrams.comparison);
    expect(layout.boxes).toHaveLength(3);
    expect(layout.arrows).toHaveLength(0);
    expect(new Set(layout.boxes.map((b) => b.x)).size).toBe(3);
  });

  it('places four quadrants in a grid and labels both axes', () => {
    const layout = layoutDiagram(diagrams.two_by_two);
    const [tl, tr, bl, br] = layout.boxes;
    expect(tl.y).toBe(tr.y);
    expect(bl.y).toBeGreaterThan(tl.y);
    expect(tl.x).toBe(bl.x);
    expect(br.x).toBe(tr.x);
    const text = render(diagrams.two_by_two).textContent ?? '';
    for (const word of ['Likelihood', 'Severity', 'Unlikely', 'Likely', 'Critical']) {
      expect(text).toContain(word);
    }
  });

  it('keeps every box inside the drawing', () => {
    for (const diagram of Object.values(diagrams)) {
      const layout = layoutDiagram(diagram);
      for (const box of layout.boxes) {
        expect(box.x + box.w).toBeLessThanOrEqual(layout.width);
        expect(box.y + box.h).toBeLessThanOrEqual(layout.height);
      }
    }
  });
});
