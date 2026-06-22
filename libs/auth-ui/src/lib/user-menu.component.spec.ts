import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '@assurance/auth';
import { UserMenuComponent } from './user-menu.component';

const en = { auth: { signOut: 'Sign out' } };

const transloco = () =>
  TranslocoTestingModule.forRoot({
    langs: { en },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });

describe('UserMenuComponent', () => {
  let fixture: ComponentFixture<UserMenuComponent>;
  const principal = signal<{ uid: string; email?: string; claims: { role: string } } | null>(null);
  const auth = { principal, signOutUser: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    principal.set({ uid: 'u1', email: 'admin@acme.com', claims: { role: 'tenant_admin' } });
    auth.signOutUser.mockClear();
    await TestBed.configureTestingModule({
      imports: [UserMenuComponent, transloco()],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
    fixture = TestBed.createComponent(UserMenuComponent);
    fixture.detectChanges();
  });

  it('renders the signed-in principal', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('admin@acme.com');
    expect(text).toContain('tenant_admin');
  });

  it('renders nothing when there is no principal', () => {
    principal.set(null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.user-menu')).toBeNull();
  });

  it('signs out and navigates to the redirect target', async () => {
    const nav = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const cmp = fixture.componentInstance as unknown as { signOut: () => Promise<void> };
    await cmp.signOut();
    expect(auth.signOutUser).toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/login');
  });
});
