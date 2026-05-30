import { DEFAULT_THEME, tokensToCssVars } from './theme.tokens';

describe('tokensToCssVars', () => {
  it('should produce --assurance- prefixed keys for every token', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);

    // Verify the prefix is applied to all keys
    for (const key of Object.keys(cssVars)) {
      expect(key.startsWith('--assurance-')).toBe(true);
    }
  });

  it('should map colorPrimary to --assurance-color-primary', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--assurance-color-primary']).toBe(DEFAULT_THEME.colorPrimary);
  });

  it('should map colorSurface to --assurance-color-surface', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--assurance-color-surface']).toBe(DEFAULT_THEME.colorSurface);
  });

  it('should map colorAccent to --assurance-color-accent', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--assurance-color-accent']).toBe(DEFAULT_THEME.colorAccent);
  });

  it('should map colorText to --assurance-color-text', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--assurance-color-text']).toBe(DEFAULT_THEME.colorText);
  });

  it('should map colorTextMuted to --assurance-color-text-muted', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--assurance-color-text-muted']).toBe(DEFAULT_THEME.colorTextMuted);
  });

  it('should map fontFamily to --assurance-font-family', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--assurance-font-family']).toBe(DEFAULT_THEME.fontFamily);
  });

  it('should map radius to --assurance-radius', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--assurance-radius']).toBe(DEFAULT_THEME.radius);
  });

  it('should omit optional properties that are undefined', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    // logoUrl is optional and not set in DEFAULT_THEME
    expect(cssVars['--assurance-logo-url']).toBeUndefined();
  });

  it('should include logoUrl when provided', () => {
    const tokens = { ...DEFAULT_THEME, logoUrl: 'https://example.com/logo.png' };
    const cssVars = tokensToCssVars(tokens);
    expect(cssVars['--assurance-logo-url']).toBe('https://example.com/logo.png');
  });

  it('should return an object with the expected number of non-undefined token keys', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    // DEFAULT_THEME has 7 defined properties (logoUrl is undefined)
    expect(Object.keys(cssVars).length).toBe(7);
  });
});
