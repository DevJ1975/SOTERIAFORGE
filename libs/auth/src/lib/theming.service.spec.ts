import { TestBed } from '@angular/core/testing';
import { Branding } from '@forge/shared';
import { ForgeTheming } from './theming.service';

describe('ForgeTheming', () => {
  let theming: ForgeTheming;
  let rootStyle: CSSStyleDeclaration;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    theming = TestBed.inject(ForgeTheming);
    rootStyle = document.documentElement.style;
  });

  afterEach(() => {
    theming.reset();
    rootStyle.removeProperty('--untouched');
  });

  it('sets branding colors as CSS custom properties, normalizing the -- prefix', () => {
    const branding: Branding = {
      colors: { '--forge-accent': '#123456', 'forge-surface': '#ffffff' },
    };
    theming.applyBranding(branding);

    expect(rootStyle.getPropertyValue('--forge-accent')).toBe('#123456');
    expect(rootStyle.getPropertyValue('--forge-surface')).toBe('#ffffff');
  });

  it('applies fontFamily to --forge-font and exposes logoUrl as a signal', () => {
    theming.applyBranding({
      colors: {},
      fontFamily: 'Inter, sans-serif',
      logoUrl: 'https://cdn.example.com/logo.svg',
    });

    expect(rootStyle.getPropertyValue('--forge-font')).toBe('Inter, sans-serif');
    expect(theming.logoUrl()).toBe('https://cdn.example.com/logo.svg');
  });

  it('reset() removes exactly the properties it set', () => {
    rootStyle.setProperty('--untouched', 'keep-me');
    theming.applyBranding({
      colors: { 'forge-accent': '#123456' },
      fontFamily: 'Inter',
      logoUrl: 'https://cdn.example.com/logo.svg',
    });

    theming.reset();

    expect(rootStyle.getPropertyValue('--forge-accent')).toBe('');
    expect(rootStyle.getPropertyValue('--forge-font')).toBe('');
    expect(rootStyle.getPropertyValue('--untouched')).toBe('keep-me');
    expect(theming.logoUrl()).toBeNull();
  });

  it('clears logoUrl when later branding omits it', () => {
    theming.applyBranding({ colors: {}, logoUrl: 'https://cdn.example.com/logo.svg' });
    theming.applyBranding({ colors: {} });
    expect(theming.logoUrl()).toBeNull();
  });
});
