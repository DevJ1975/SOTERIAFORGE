import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { ThemeService } from './theme.service';
import { DEFAULT_THEME, ThemeTokens } from './theme.tokens';

describe('ThemeService', () => {
  let service: ThemeService;
  let document: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
    document = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    // Clean up CSS vars set during tests
    document.documentElement.removeAttribute('style');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialise tokens signal with DEFAULT_THEME', () => {
    const tokens = service.tokens();
    expect(tokens.colorPrimary).toBe(DEFAULT_THEME.colorPrimary);
    expect(tokens.colorSurface).toBe(DEFAULT_THEME.colorSurface);
  });

  describe('applyTheme', () => {
    it('should write --assurance-color-primary CSS var onto documentElement', () => {
      const custom: ThemeTokens = { ...DEFAULT_THEME, colorPrimary: '#ff0000' };
      service.applyTheme(custom);
      const value = document.documentElement.style.getPropertyValue('--assurance-color-primary');
      expect(value).toBe('#ff0000');
    });

    it('should write --assurance-color-surface CSS var onto documentElement', () => {
      const custom: ThemeTokens = { ...DEFAULT_THEME, colorSurface: '#f0f0f0' };
      service.applyTheme(custom);
      const value = document.documentElement.style.getPropertyValue('--assurance-color-surface');
      expect(value).toBe('#f0f0f0');
    });

    it('should write --assurance-font-family CSS var onto documentElement', () => {
      const custom: ThemeTokens = { ...DEFAULT_THEME, fontFamily: 'Roboto, sans-serif' };
      service.applyTheme(custom);
      const value = document.documentElement.style.getPropertyValue('--assurance-font-family');
      expect(value).toBe('Roboto, sans-serif');
    });

    it('should write --assurance-radius CSS var onto documentElement', () => {
      const custom: ThemeTokens = { ...DEFAULT_THEME, radius: '0.5rem' };
      service.applyTheme(custom);
      const value = document.documentElement.style.getPropertyValue('--assurance-radius');
      expect(value).toBe('0.5rem');
    });

    it('should update the tokens signal', () => {
      const custom: ThemeTokens = { ...DEFAULT_THEME, colorAccent: '#00ff00' };
      service.applyTheme(custom);
      expect(service.tokens().colorAccent).toBe('#00ff00');
    });
  });

  describe('reset', () => {
    it('should restore tokens signal to DEFAULT_THEME', () => {
      service.applyTheme({ ...DEFAULT_THEME, colorPrimary: '#aabbcc' });
      service.reset();
      expect(service.tokens().colorPrimary).toBe(DEFAULT_THEME.colorPrimary);
    });

    it('should write DEFAULT_THEME CSS vars onto documentElement after reset', () => {
      service.applyTheme({ ...DEFAULT_THEME, colorPrimary: '#aabbcc' });
      service.reset();
      const value = document.documentElement.style.getPropertyValue('--assurance-color-primary');
      expect(value).toBe(DEFAULT_THEME.colorPrimary);
    });
  });

  describe('applyBranding', () => {
    it('should map --assurance-color-primary branding color to colorPrimary token', () => {
      service.applyBranding({
        colors: { '--assurance-color-primary': '#123456' },
      });
      expect(service.tokens().colorPrimary).toBe('#123456');
      const value = document.documentElement.style.getPropertyValue('--assurance-color-primary');
      expect(value).toBe('#123456');
    });

    it('should map logoUrl from branding', () => {
      service.applyBranding({
        colors: {},
        logoUrl: 'https://tenant.example.com/logo.svg',
      });
      expect(service.tokens().logoUrl).toBe('https://tenant.example.com/logo.svg');
    });

    it('should map fontFamily from branding', () => {
      service.applyBranding({
        colors: {},
        fontFamily: 'Nunito, sans-serif',
      });
      expect(service.tokens().fontFamily).toBe('Nunito, sans-serif');
    });

    it('should preserve tokens not overridden by branding', () => {
      service.applyBranding({
        colors: { '--assurance-color-primary': '#abcdef' },
      });
      // colorSurface was not in the branding so it keeps DEFAULT_THEME value
      expect(service.tokens().colorSurface).toBe(DEFAULT_THEME.colorSurface);
    });
  });
});
