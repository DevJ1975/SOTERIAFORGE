import { TestBed } from '@angular/core/testing';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AUTH_BRAND_LOGO, AuthShellComponent } from './auth-shell.component';

expect.extend(toHaveNoViolations);

describe('AuthShellComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(AuthShellComponent);
    fixture.componentRef.setInput('title', 'Sign in');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the single h1 and no logo by default', () => {
    TestBed.configureTestingModule({ imports: [AuthShellComponent] });
    const el = render();
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('img')).toBeNull();
  });

  it('shows the provided brand lockup with alt text', async () => {
    TestBed.configureTestingModule({
      imports: [AuthShellComponent],
      providers: [
        {
          provide: AUTH_BRAND_LOGO,
          useValue: { src: 'assets/forge/logo/x.svg', alt: 'Soteria Forge' },
        },
      ],
    });
    const el = render();
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('assets/forge/logo/x.svg');
    expect(img.alt).toBe('Soteria Forge');
    expect(await axe(el)).toHaveNoViolations();
  });
});
