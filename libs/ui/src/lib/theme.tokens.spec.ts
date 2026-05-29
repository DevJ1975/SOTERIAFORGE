import { DEFAULT_THEME, tokensToCssVars } from './theme.tokens';

describe('tokensToCssVars', () => {
  it('should produce --forge- prefixed keys for every token', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);

    // Verify the prefix is applied to all keys
    for (const key of Object.keys(cssVars)) {
      expect(key.startsWith('--forge-')).toBe(true);
    }
  });

  it('should map colorPrimary to --forge-color-primary', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--forge-color-primary']).toBe(DEFAULT_THEME.colorPrimary);
  });

  it('should map colorSurface to --forge-color-surface', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--forge-color-surface']).toBe(DEFAULT_THEME.colorSurface);
  });

  it('should map colorAccent to --forge-color-accent', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--forge-color-accent']).toBe(DEFAULT_THEME.colorAccent);
  });

  it('should map colorText to --forge-color-text', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--forge-color-text']).toBe(DEFAULT_THEME.colorText);
  });

  it('should map colorTextMuted to --forge-color-text-muted', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--forge-color-text-muted']).toBe(DEFAULT_THEME.colorTextMuted);
  });

  it('should map fontFamily to --forge-font-family', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--forge-font-family']).toBe(DEFAULT_THEME.fontFamily);
  });

  it('should map radius to --forge-radius', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    expect(cssVars['--forge-radius']).toBe(DEFAULT_THEME.radius);
  });

  it('should omit optional properties that are undefined', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    // logoUrl is optional and not set in DEFAULT_THEME
    expect(cssVars['--forge-logo-url']).toBeUndefined();
  });

  it('should include logoUrl when provided', () => {
    const tokens = { ...DEFAULT_THEME, logoUrl: 'https://example.com/logo.png' };
    const cssVars = tokensToCssVars(tokens);
    expect(cssVars['--forge-logo-url']).toBe('https://example.com/logo.png');
  });

  it('should return an object with the expected number of non-undefined token keys', () => {
    const cssVars = tokensToCssVars(DEFAULT_THEME);
    // DEFAULT_THEME has 7 defined properties (logoUrl is undefined)
    expect(Object.keys(cssVars).length).toBe(7);
  });
});
