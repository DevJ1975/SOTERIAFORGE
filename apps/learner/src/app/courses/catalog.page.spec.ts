import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';
import { ForgeCatalog, ForgeEnrollment } from '@forge/lms-core';
import { CatalogPage } from './catalog.page';

// Real Firebase never runs in jsdom: Firestore is a dummy object and the
// lms-core services are stubbed at the DI level.
describe('CatalogPage', () => {
  let listPublished: jest.Mock;

  beforeEach(async () => {
    listPublished = jest.fn().mockResolvedValue([]);
    await TestBed.configureTestingModule({
      imports: [CatalogPage],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: Firestore, useValue: {} },
        { provide: ForgeCatalog, useValue: { listPublished } },
        { provide: ForgeEnrollment, useValue: { get: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compileComponents();
  });

  it('creates and renders the page heading', () => {
    const fixture = TestBed.createComponent(CatalogPage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('My Training');
  });

  it('does not query Firestore while signed out (no Auth provider in tests)', () => {
    const fixture = TestBed.createComponent(CatalogPage);
    fixture.detectChanges();
    expect(listPublished).not.toHaveBeenCalled();
  });
});
