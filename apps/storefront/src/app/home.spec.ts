import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Home } from './home';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the marketing hero with the brand headline and catalog CTA', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent).toContain('Safety training that');
    expect(element.querySelector('h1')?.textContent).toContain('sticks');
    expect(element.querySelector('a.cta')?.getAttribute('href')).toBe('/catalog');
  });

  it('renders the three feature cards and the brand footer', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const features = Array.from(element.querySelectorAll('.feature h2')).map((heading) =>
      heading.textContent?.trim(),
    );
    expect(features).toEqual([
      'Forge Studio courses',
      'Safety Arcade games',
      'Open Badges you can verify',
    ]);
    expect(element.querySelector('footer')?.textContent).toContain('Forged for the frontline');
  });
});
