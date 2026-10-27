import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ASSURANCE_ENV, ForgeSession } from '@assurance/auth';
import { EngageComponent } from './engage.component';

describe('EngageComponent', () => {
  const canAuthor = signal(false);
  let http: HttpTestingController;

  beforeEach(async () => {
    canAuthor.set(false);
    await TestBed.configureTestingModule({
      imports: [EngageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: 'https://api.example.com' } },
        { provide: ForgeSession, useValue: { canAuthor } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows rooms to learners without creation controls', async () => {
    const fixture = TestBed.createComponent(EngageComponent);
    fixture.detectChanges();
    http
      .expectOne('https://api.example.com/api/engage/classrooms')
      .flush([{ id: '1', title: 'Safety skills', maxParticipants: 21 }]);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Join Safety skills');
    expect(element.querySelector('form')).toBeNull();
    expect(element.textContent).toContain('Chrome');
  });

  it('shows classroom creation for instructors', async () => {
    canAuthor.set(true);
    const fixture = TestBed.createComponent(EngageComponent);
    fixture.detectChanges();
    http.expectOne('https://api.example.com/api/engage/classrooms').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('label')?.textContent).toContain('New classroom title');
    expect(element.textContent).toContain('No classrooms yet');
  });

  it('announces server failures as an accessible alert', async () => {
    const fixture = TestBed.createComponent(EngageComponent);
    fixture.detectChanges();
    http
      .expectOne('https://api.example.com/api/engage/classrooms')
      .flush({ detail: 'Video unavailable.' }, { status: 503, statusText: 'Down' });
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Video unavailable.');
  });
});
