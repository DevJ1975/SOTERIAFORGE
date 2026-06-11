import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';
import { GamificationData } from '@forge/gamification';
import { ForgeCatalog, ForgeEnrollment } from '@forge/lms-core';
import { ProfilePage } from './profile.page';

// Real Firebase never runs in jsdom: Firestore is a dummy object and the
// gamification/lms-core services are stubbed at the DI level. Without an Auth
// provider the PrincipalStore settles 'signedOut', so live subscriptions are
// never opened.
describe('ProfilePage', () => {
  let member: jest.Mock;
  let awards: jest.Mock;

  beforeEach(async () => {
    member = jest.fn();
    awards = jest.fn();
    await TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: Firestore, useValue: {} },
        { provide: GamificationData, useValue: { member, awards } },
        { provide: ForgeCatalog, useValue: { listPublished: jest.fn().mockResolvedValue([]) } },
        { provide: ForgeEnrollment, useValue: { get: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compileComponents();
  });

  it('creates and renders the page heading', () => {
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('My Profile');
  });

  it('does not open live subscriptions while signed out', () => {
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    expect(member).not.toHaveBeenCalled();
    expect(awards).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No team workspace');
  });
});
