import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  STOREFRONT_ENV,
  type StorefrontEnvironment,
} from '../../environments/storefront-environment';
import { PLACEHOLDER_COURSES } from '../core/catalog-data';
import { CatalogComponent } from './catalog.component';

const testEnv: StorefrontEnvironment = {
  production: false,
  rootDomain: 'localhost',
  contactEmail: 'hello@example.test',
};

describe('CatalogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [provideRouter([]), { provide: STOREFRONT_ENV, useValue: testEnv }],
    }).compileComponents();
  });

  it('renders every placeholder course', () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    for (const course of PLACEHOLDER_COURSES) {
      expect(text).toContain(course.title);
    }
  });

  it('offers a mailto request-access link to the configured contact address', () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    const links = Array.from<HTMLAnchorElement>(
      fixture.nativeElement.querySelectorAll('a.catalog__request'),
    );
    expect(links).toHaveLength(PLACEHOLDER_COURSES.length);
    expect(links[0].getAttribute('href')).toMatch(/^mailto:hello@example\.test\?subject=/);
    expect(decodeURIComponent(links[0].getAttribute('href') ?? '')).toContain(
      PLACEHOLDER_COURSES[0].title,
    );
  });

  it('has no checkout or buy action', () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string).toLowerCase()).not.toContain('buy');
  });
});
