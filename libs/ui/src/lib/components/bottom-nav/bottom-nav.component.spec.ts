import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AssuranceBottomNavComponent, LEARNER_BOTTOM_NAV } from './bottom-nav.component';

describe('AssuranceBottomNavComponent (MO-03)', () => {
  let fixture: ComponentFixture<AssuranceBottomNavComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssuranceBottomNavComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AssuranceBottomNavComponent);
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the four learner destinations', () => {
    const links: HTMLAnchorElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('a.assurance-bottom-nav__link'),
    );
    expect(links).toHaveLength(4);

    const labels = links.map((a) => a.textContent?.trim());
    expect(labels.some((l) => l?.includes('Dashboard'))).toBe(true);
    expect(labels.some((l) => l?.includes('Courses'))).toBe(true);
    expect(labels.some((l) => l?.includes('Leaderboard'))).toBe(true);
    expect(labels.some((l) => l?.includes('Tutor'))).toBe(true);
  });

  it('points each tab at the expected route', () => {
    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('a.assurance-bottom-nav__link'),
    ).map((a) => (a as HTMLAnchorElement).getAttribute('href'));
    expect(hrefs).toEqual(['/', '/courses', '/leaderboard', '/tutor']);
  });

  it('exposes a uniquely-labelled navigation landmark', () => {
    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
    expect(nav.getAttribute('aria-label')).toBe('Primary mobile');
  });

  it('default destinations match LEARNER_BOTTOM_NAV', () => {
    expect(LEARNER_BOTTOM_NAV.map((i) => i.link)).toEqual([
      '/',
      '/courses',
      '/leaderboard',
      '/tutor',
    ]);
  });
});
