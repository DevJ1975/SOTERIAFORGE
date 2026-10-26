import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { axe, toHaveNoViolations } from 'jest-axe';
import { SfBadgeComponent, type SfBadgeState } from './sf-badge.component';
import { SfProgressRingComponent } from './sf-progress-ring.component';
import { SfStreakStripComponent } from './sf-streak-strip.component';

expect.extend(toHaveNoViolations);

@Component({
  standalone: true,
  imports: [SfProgressRingComponent, SfBadgeComponent, SfStreakStripComponent],
  template: `
    <sf-progress-ring [value]="pct()" caption="Week 5" label="AI Cyber Defender progress" />
    <ul>
      @for (b of badges; track b.name) {
        <li><sf-badge [name]="b.name" [state]="b.state" icon="badge-recruit" /></li>
      }
    </ul>
    <sf-streak-strip [days]="days()" />
  `,
})
class HostComponent {
  readonly pct = signal(56);
  readonly days = signal<boolean[]>([true, true, false, true]);
  readonly badges: { name: string; state: SfBadgeState }[] = [
    { name: 'Recruit', state: 'earned' },
    { name: 'AI-Ready Professional', state: 'credential' },
    { name: 'Red Cell', state: 'progress' },
    { name: 'Blue Cell', state: 'locked' },
  ];
}

describe('Forge widgets', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  describe('sf-progress-ring', () => {
    it('is a progressbar with value + spoken text', () => {
      const { el } = render();
      const ring = el.querySelector('sf-progress-ring') as HTMLElement;
      expect(ring.getAttribute('role')).toBe('progressbar');
      expect(ring.getAttribute('aria-valuenow')).toBe('56');
      expect(ring.getAttribute('aria-valuetext')).toBe('56% complete, Week 5');
      expect(ring.textContent).toContain('56%');
    });

    it('clamps and draws the arc from the value', () => {
      const { fixture, el } = render();
      const arc = el.querySelector('.sf-ring__value') as SVGCircleElement;
      const full = Number(arc.getAttribute('stroke-dasharray'));
      expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(full * 0.44, 0);
      fixture.componentInstance.pct.set(140);
      fixture.detectChanges();
      expect(el.querySelector('sf-progress-ring')?.getAttribute('aria-valuenow')).toBe('100');
      expect(Number(arc.getAttribute('stroke-dashoffset'))).toBe(0);
    });
  });

  describe('sf-badge', () => {
    it('pairs every state with a word, and locked with a lock icon', () => {
      const { el } = render();
      const badges = Array.from(el.querySelectorAll('sf-badge'));
      const metas = badges.map((b) => b.querySelector('.sf-badge__meta')?.textContent?.trim());
      expect(metas).toEqual(['Earned', 'Credential earned', 'In progress', 'Locked']);
      expect(badges[0].classList).toContain('sf-badge--earned');
      expect(badges[1].classList).toContain('sf-badge--credential');
      expect(badges[3].classList).toContain('sf-badge--locked');
      expect(badges[3].querySelector('.sf-badge__meta use')?.getAttribute('href')).toContain(
        '#sf-lock',
      );
    });
  });

  describe('sf-streak-strip', () => {
    it('renders one cell per day and summarises the count in words', () => {
      const { el } = render();
      const strip = el.querySelector('sf-streak-strip') as HTMLElement;
      expect(strip.querySelectorAll('.sf-streak__day').length).toBe(4);
      expect(strip.querySelectorAll('.sf-streak__day.is-done').length).toBe(3);
      expect(strip.getAttribute('role')).toBe('img');
      expect(strip.getAttribute('aria-label')).toBe('Active 3 of the last 4 days');
    });
  });

  it('has no axe violations', async () => {
    const { el } = render();
    expect(await axe(el)).toHaveNoViolations();
  });
});
