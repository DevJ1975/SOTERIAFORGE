import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { STOREFRONT_ENV, type StorefrontEnvironment } from '../environments/storefront-environment';
import { AppComponent } from './app.component';

const testEnv: StorefrontEnvironment = {
  production: false,
  rootDomain: 'localhost',
  contactEmail: 'hello@example.test',
};

describe('Storefront AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), { provide: STOREFRONT_ENV, useValue: testEnv }],
    }).compileComponents();
  });

  it('creates and renders the brand + nav', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Soteria Assurance');
    expect(text).toContain('Catalog');
  });

  it('links Request access to the configured contact address and has no sign-in', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const request = fixture.nativeElement.querySelector('a[href^="mailto:"]');
    expect(request.getAttribute('href')).toContain('mailto:hello@example.test');
    expect(fixture.nativeElement.textContent).not.toContain('Sign in');
  });
});
