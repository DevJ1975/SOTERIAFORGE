import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment, TenantService } from '@assurance/auth';
import { CourseRepository } from '@assurance/data-access';
import { CourseAuthoringService } from '@assurance/lms-core';
import { CoursesComponent } from './courses.component';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
};

describe('CoursesComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoursesComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: CourseRepository, useValue: { listAll: async () => [] } },
        {
          provide: CourseAuthoringService,
          useValue: {
            createCourse: jest.fn(),
            publish: jest.fn(),
          },
        },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(CoursesComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the Courses heading', () => {
    const fixture = TestBed.createComponent(CoursesComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Courses');
  });

  it('renders the New Course form', async () => {
    const fixture = TestBed.createComponent(CoursesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('New Course');
  });

  it('renders the Create Course button', async () => {
    const fixture = TestBed.createComponent(CoursesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Create Course');
  });
});
