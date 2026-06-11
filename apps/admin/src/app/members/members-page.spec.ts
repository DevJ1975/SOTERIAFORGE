import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MembersPage } from './members-page';

// Light creation tests only: no Firebase providers are configured, so the
// PrincipalStore settles to 'signedOut' (Auth resolves to null), Firestore and
// Functions inject as null, and the page must render its signed-out state.
// Live-list and callable flows are exercised against the emulators, not here.
describe('MembersPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MembersPage],
      providers: [provideRouter([]), provideNoopAnimations()],
    }).compileComponents();
  });

  it('creates and renders the members header', () => {
    const fixture = TestBed.createComponent(MembersPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Members');
  });

  it('shows the signed-out prompt when no session is available', () => {
    const fixture = TestBed.createComponent(MembersPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Sign in to manage members');
    expect(el.querySelector('.member-list')).toBeNull();
  });
});
