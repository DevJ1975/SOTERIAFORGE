import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AssuranceOfflineBannerComponent } from './offline-banner.component';
import { ConnectivityService } from '../../connectivity.service';

describe('AssuranceOfflineBannerComponent (MO-04)', () => {
  let fixture: ComponentFixture<AssuranceOfflineBannerComponent>;
  const onlineSig = signal(true);

  beforeEach(async () => {
    onlineSig.set(true);
    await TestBed.configureTestingModule({
      imports: [AssuranceOfflineBannerComponent],
      providers: [{ provide: ConnectivityService, useValue: { online: onlineSig } }],
    }).compileComponents();

    fixture = TestBed.createComponent(AssuranceOfflineBannerComponent);
  });

  it('renders nothing while online', () => {
    onlineSig.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.assurance-offline-banner')).toBeNull();
  });

  it('renders a polite status banner while offline', () => {
    onlineSig.set(false);
    fixture.detectChanges();
    const banner: HTMLElement = fixture.nativeElement.querySelector('.assurance-offline-banner');
    expect(banner).not.toBeNull();
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.textContent).toContain("You're offline");
  });

  it('surfaces a pending-update count when provided', () => {
    onlineSig.set(false);
    fixture.componentRef.setInput('pendingCount', 3);
    fixture.detectChanges();
    const banner: HTMLElement = fixture.nativeElement.querySelector('.assurance-offline-banner');
    expect(banner.textContent).toContain('3 updates pending');
  });

  it('does not show the pending count when zero', () => {
    onlineSig.set(false);
    fixture.componentRef.setInput('pendingCount', 0);
    fixture.detectChanges();
    const banner: HTMLElement = fixture.nativeElement.querySelector('.assurance-offline-banner');
    expect(banner.textContent).not.toContain('pending');
  });
});
