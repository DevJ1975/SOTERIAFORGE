import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  FORGE_LEARNER_NAV,
  SfAppShellComponent,
  type SfCrumb,
  type SfShellVariant,
  initialsOf,
} from './sf-app-shell.component';

expect.extend(toHaveNoViolations);

@Component({ standalone: true, template: `<h1>Page</h1>` })
class PageComponent {}

@Component({
  standalone: true,
  imports: [SfAppShellComponent],
  template: `
    <sf-app-shell
      [crumbs]="crumbs()"
      [userName]="userName()"
      [streakDays]="streak()"
      [variant]="variant()"
      [bare]="bare()"
      (search)="queries.push($event)"
    >
      <button sfTopbarEnd type="button">Sign out</button>
      <h1>Good morning</h1>
    </sf-app-shell>
  `,
})
class HostComponent {
  readonly crumbs = signal<SfCrumb[]>([{ label: 'Courses', link: '/courses' }, { label: 'AI Cyber Defender' }]);
  readonly userName = signal('Marcus Walker');
  readonly streak = signal<number | null>(22);
  readonly variant = signal<SfShellVariant>('light');
  readonly bare = signal(false);
  readonly queries: string[] = [];
}

describe('SfAppShellComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideRouter([
          { path: '', component: PageComponent },
          { path: 'courses', component: PageComponent },
        ]),
      ],
    }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders one rail link per learner destination, each with an aria-label', () => {
    const { el } = render();
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('.sf-rail__item'));
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(
      FORGE_LEARNER_NAV.map((i) => i.label),
    );
    expect(FORGE_LEARNER_NAV.map((i) => i.label)).toEqual([
      'Home',
      'Courses',
      'Engage',
      'Progress',
      'Analytics',
      'History',
    ]);
    // Icons inside labelled links are decorative.
    for (const a of links) {
      expect(a.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('marks the active route with aria-current="page"', async () => {
    const { fixture, el } = render();
    await TestBed.inject(Router).navigateByUrl('/courses');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const current = el.querySelectorAll('.sf-rail__item[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0].getAttribute('aria-label')).toBe('Courses');
  });

  it('renders the breadcrumb with the last crumb as the current page', () => {
    const { el } = render();
    const crumbs = el.querySelector('nav[aria-label="Breadcrumb"]') as HTMLElement;
    expect(crumbs.querySelector('a')?.textContent?.trim()).toBe('Courses');
    expect(crumbs.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe(
      'AI Cyber Defender',
    );
  });

  it('shows the streak pill with a flame icon (never emoji) and hides it when null', () => {
    const { fixture, el } = render();
    const pill = el.querySelector('.sf-pill') as HTMLElement;
    expect(pill.textContent).toContain('22');
    expect(pill.querySelector('use')?.getAttribute('href')).toContain('#sf-flame');
    expect(pill.textContent).not.toMatch(/\p{Extended_Pictographic}/u);

    fixture.componentInstance.streak.set(null);
    fixture.detectChanges();
    expect(el.querySelector('.sf-pill')).toBeNull();
  });

  it('shows the learner name and initials avatar', () => {
    const { el } = render();
    expect(el.querySelector('.sf-shell__uname')?.textContent).toBe('Marcus Walker');
    expect(el.querySelector('.sf-shell__user .sf-avatar')?.textContent?.trim()).toBe('MW');
    expect(el.querySelector('.sf-shell__rail-avatar')?.textContent?.trim()).toBe('MW');
  });

  it('emits trimmed search queries and ignores blanks', () => {
    const { fixture, el } = render();
    const input = el.querySelector('input[type="search"]') as HTMLInputElement;
    const form = el.querySelector('form[role="search"]') as HTMLFormElement;
    expect(input.placeholder).toBe('Search modules, labs, job aids');
    input.value = '   ';
    form.dispatchEvent(new Event('submit'));
    input.value = '  prompt injection ';
    form.dispatchEvent(new Event('submit'));
    expect(fixture.componentInstance.queries).toEqual(['prompt injection']);
  });

  it('projects content into <main id="main-content" tabindex="-1"> behind a skip link', () => {
    const { el } = render();
    const skip = el.querySelector('a.sf-skip-link');
    expect(skip?.getAttribute('href')).toBe('#main-content');
    const main = el.querySelector('main#main-content');
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(main?.querySelector('h1')?.textContent).toBe('Good morning');
    expect(el.querySelector('header [sfTopbarEnd]')).not.toBeNull();
  });

  it('applies the dark (Engage) variant hook on the host', () => {
    const { fixture, el } = render();
    const host = el.querySelector('sf-app-shell') as HTMLElement;
    expect(host.classList).toContain('sf-shell');
    expect(host.classList).not.toContain('sf-shell--dark');
    fixture.componentInstance.variant.set('dark');
    fixture.detectChanges();
    expect(host.classList).toContain('sf-shell--dark');
  });

  it('bare mode drops rail + top bar but keeps the skip link and <main>', () => {
    const { fixture, el } = render();
    fixture.componentInstance.bare.set(true);
    fixture.detectChanges();
    expect(el.querySelector('nav.sf-rail')).toBeNull();
    expect(el.querySelector('header')).toBeNull();
    expect(el.querySelector('main#main-content h1')).not.toBeNull();
    expect(el.querySelector('sf-app-shell')?.classList).toContain('sf-shell--bare');
  });

  it('has no axe violations', async () => {
    const { el } = render();
    expect(await axe(el)).toHaveNoViolations();
  });
});

describe('initialsOf', () => {
  it.each([
    ['Marcus Walker', 'MW'],
    ['marcus', 'M'],
    ['  Ana  de la Cruz ', 'AC'],
    ['', ''],
    [null, ''],
  ])('%p → %p', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});
