import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';
import { of } from 'rxjs';
import { ForgeCatalog, ForgeEnrollment } from '@forge/lms-core';
import { PlayerPage } from './player.page';

// Real Firebase never runs in jsdom: Firestore is a dummy object and the
// lms-core services are stubbed at the DI level.
describe('PlayerPage', () => {
  beforeEach(async () => {
    const paramMap = convertToParamMap({ courseId: 'course-1' });
    await TestBed.configureTestingModule({
      imports: [PlayerPage],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: Firestore, useValue: {} },
        { provide: ActivatedRoute, useValue: { paramMap: of(paramMap), snapshot: { paramMap } } },
        {
          provide: ForgeCatalog,
          useValue: { getPublished: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ForgeEnrollment, useValue: { get: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compileComponents();
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(PlayerPage);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the unavailable notice when signed out / course missing', async () => {
    const fixture = TestBed.createComponent(PlayerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Course unavailable');
  });
});
