import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { FIRESTORE } from '@forge/data-access';
import { CertificatePage } from './certificate-page';

/**
 * Without Firebase Auth providers the PrincipalStore settles signed-out (no
 * tenant/uid), so once a courseId is present the certificate load
 * short-circuits before touching Firestore and the component must render its
 * friendly "not available yet" fallback rather than crash. The dummy FIRESTORE
 * value is never dereferenced on this path.
 */
describe('CertificatePage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CertificatePage],
      providers: [
        provideRouter([]),
        { provide: FIRESTORE, useValue: {} },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ courseId: 'course-1' })) },
        },
      ],
    }).compileComponents();
  });

  it('renders the not-available fallback when no certificate can be resolved', () => {
    const fixture = TestBed.createComponent(CertificatePage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Certificate not available yet');
  });
});
