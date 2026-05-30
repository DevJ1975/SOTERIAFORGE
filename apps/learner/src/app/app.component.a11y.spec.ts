import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment } from '@forge/auth';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AppComponent } from './app.component';

expect.extend(toHaveNoViolations);

const testEnv: ForgeEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
};

describe('AppComponent – accessibility', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), { provide: FORGE_ENV, useValue: testEnv }],
    }).compileComponents();
  });

  it('has no axe violations', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const results = await axe(fixture.nativeElement);
    expect(results).toHaveNoViolations();
  });

  it('renders a skip link as the first focusable element', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const skipLink = el.querySelector('a.skip-link') as HTMLAnchorElement | null;
    expect(skipLink).not.toBeNull();
    expect(skipLink?.getAttribute('href')).toBe('#main-content');
    // Skip link must be the first <a> in the DOM
    const allLinks = Array.from(el.querySelectorAll('a'));
    expect(allLinks[0]).toBe(skipLink);
  });

  it('renders a <header> landmark', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('header')).not.toBeNull();
  });

  it('renders a <main> with id="main-content" and tabindex="-1"', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const main = el.querySelector('main#main-content') as HTMLElement | null;
    expect(main).not.toBeNull();
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });
});
