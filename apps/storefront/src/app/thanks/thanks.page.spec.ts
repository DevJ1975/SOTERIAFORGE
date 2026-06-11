import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { PrincipalStore } from '@forge/auth';
import { ThanksPage } from './thanks.page';

type Principal = InstanceType<typeof PrincipalStore>;

describe('ThanksPage', () => {
  const refreshClaims = jest.fn().mockResolvedValue(undefined);

  function principalStub(status: 'signedIn' | 'signedOut'): Principal {
    return {
      init: jest.fn(),
      status: () => status,
      refreshClaims,
    } as unknown as Principal;
  }

  async function render(queryParams: Record<string, string>, status: 'signedIn' | 'signedOut') {
    await TestBed.configureTestingModule({
      imports: [ThanksPage],
      providers: [
        provideRouter([]),
        { provide: PrincipalStore, useValue: principalStub(status) },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ThanksPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    refreshClaims.mockClear();
  });

  it('celebrates and refreshes the claims mirror once signed in', async () => {
    const fixture = await render({ product: 'p1' }, 'signedIn');
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent).toContain("You're in!");
    expect(refreshClaims).toHaveBeenCalledTimes(1);
    expect(element.querySelector('.test-mode')).toBeNull();
    expect(element.querySelector('a.cta')?.getAttribute('href')).toBe('/library');
  });

  it('shows the test-mode chip for emulated purchases (?emulated=1)', async () => {
    const fixture = await render({ product: 'p1', emulated: '1' }, 'signedIn');

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.test-mode')?.textContent,
    ).toContain('Test mode');
  });

  it('does not refresh claims while signed out', async () => {
    await render({ product: 'p1' }, 'signedOut');

    expect(refreshClaims).not.toHaveBeenCalled();
  });
});
