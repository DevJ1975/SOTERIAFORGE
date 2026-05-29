import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Cmi5LauncherComponent } from './cmi5-launcher.component';
import { buildLaunchUrl } from './cmi5';

describe('Cmi5LauncherComponent', () => {
  let fixture: ComponentFixture<Cmi5LauncherComponent>;

  const AU_URL = 'https://content.example.com/au/index.html';
  const ENDPOINT = 'https://lrs.example.com/xapi/';
  const FETCH = 'https://api.example.com/auth/token?session=test';
  const ACTOR = JSON.stringify({
    objectType: 'Agent',
    account: { homePage: 'https://soteriaforge.com', name: 'uid-test' },
  });
  const REGISTRATION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const ACTIVITY_ID = 'https://soteriaforge.com/activities/module-test';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Cmi5LauncherComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(Cmi5LauncherComponent);
    fixture.componentRef.setInput('auUrl', AU_URL);
    fixture.componentRef.setInput('endpoint', ENDPOINT);
    fixture.componentRef.setInput('fetch', FETCH);
    fixture.componentRef.setInput('actor', ACTOR);
    fixture.componentRef.setInput('registration', REGISTRATION);
    fixture.componentRef.setInput('activityId', ACTIVITY_ID);
  });

  it('creates the component', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('invokes buildLaunchUrl logic — the launch URL contains all cmi5 params', () => {
    const expectedUrl = buildLaunchUrl(AU_URL, {
      endpoint: ENDPOINT,
      fetch: FETCH,
      actor: ACTOR,
      registration: REGISTRATION,
      activityId: ACTIVITY_ID,
    });

    const parsedExpected = new URL(expectedUrl);
    // Verify buildLaunchUrl encodes all five params correctly.
    expect(parsedExpected.searchParams.get('endpoint')).toBe(ENDPOINT);
    expect(parsedExpected.searchParams.get('fetch')).toBe(FETCH);
    expect(parsedExpected.searchParams.get('actor')).toBe(ACTOR);
    expect(parsedExpected.searchParams.get('registration')).toBe(REGISTRATION);
    expect(parsedExpected.searchParams.get('activityId')).toBe(ACTIVITY_ID);
  });

  it('accepts default empty-string values for optional cmi5 params', () => {
    fixture.componentRef.setInput('endpoint', '');
    fixture.componentRef.setInput('fetch', '');
    fixture.detectChanges();
    expect(fixture.componentInstance.endpoint()).toBe('');
    expect(fixture.componentInstance.fetch()).toBe('');
  });

  it('reflects the auUrl signal input', () => {
    expect(fixture.componentInstance.auUrl()).toBe(AU_URL);
  });
});
