import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { SeoService } from './seo.service';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'soteria.example',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
};

describe('SeoService', () => {
  let service: SeoService;
  let meta: Meta;
  let title: Title;
  let doc: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SeoService, Title, Meta, { provide: ASSURANCE_ENV, useValue: testEnv }],
    });
    service = TestBed.inject(SeoService);
    meta = TestBed.inject(Meta);
    title = TestBed.inject(Title);
    doc = TestBed.inject(DOCUMENT);
    // Clear any canonical left by a previous test.
    doc.head.querySelectorAll("link[rel='canonical']").forEach((l) => l.remove());
  });

  it('sets the document title', () => {
    service.setSeo({ title: 'Hello', description: 'World', path: '/' });
    expect(title.getTitle()).toBe('Hello');
  });

  it('sets the meta description', () => {
    service.setSeo({ title: 'T', description: 'A clear description', path: '/' });
    expect(meta.getTag("name='description'")?.content).toBe('A clear description');
  });

  it('sets Open Graph tags (title, description, type, url, image)', () => {
    service.setSeo({
      title: 'OG Title',
      description: 'OG Desc',
      path: '/catalog',
      type: 'website',
      image: '/assets/cover.png',
    });
    expect(meta.getTag("property='og:title'")?.content).toBe('OG Title');
    expect(meta.getTag("property='og:description'")?.content).toBe('OG Desc');
    expect(meta.getTag("property='og:type'")?.content).toBe('website');
    expect(meta.getTag("property='og:url'")?.content).toBe('https://soteria.example/catalog');
    expect(meta.getTag("property='og:image'")?.content).toBe(
      'https://soteria.example/assets/cover.png',
    );
  });

  it('sets Twitter card tags', () => {
    service.setSeo({ title: 'TW', description: 'TWD', path: '/' });
    expect(meta.getTag("name='twitter:card'")?.content).toBe('summary_large_image');
    expect(meta.getTag("name='twitter:title'")?.content).toBe('TW');
    expect(meta.getTag("name='twitter:description'")?.content).toBe('TWD');
    expect(meta.getTag("name='twitter:image'")?.content).toContain('https://soteria.example/');
  });

  it('writes a single canonical <link> derived from rootDomain + path', () => {
    service.setSeo({ title: 'C', description: 'D', path: '/catalog' });
    const links = doc.head.querySelectorAll("link[rel='canonical']");
    expect(links.length).toBe(1);
    expect((links[0] as HTMLLinkElement).getAttribute('href')).toBe(
      'https://soteria.example/catalog',
    );
  });

  it('updates (does not duplicate) the canonical link on repeated calls', () => {
    service.setSeo({ title: 'A', description: 'D', path: '/' });
    service.setSeo({ title: 'B', description: 'D', path: '/catalog' });
    const links = doc.head.querySelectorAll("link[rel='canonical']");
    expect(links.length).toBe(1);
    expect((links[0] as HTMLLinkElement).getAttribute('href')).toBe(
      'https://soteria.example/catalog',
    );
  });

  it('falls back to a default OG image when none is provided', () => {
    service.setSeo({ title: 'X', description: 'Y', path: '/' });
    expect(meta.getTag("property='og:image'")?.content).toBe(
      'https://soteria.example/assets/og-default.png',
    );
  });

  it('passes absolute image URLs through unchanged', () => {
    service.setSeo({
      title: 'X',
      description: 'Y',
      path: '/',
      image: 'https://cdn.example.com/a.png',
    });
    expect(meta.getTag("property='og:image'")?.content).toBe('https://cdn.example.com/a.png');
  });
});
