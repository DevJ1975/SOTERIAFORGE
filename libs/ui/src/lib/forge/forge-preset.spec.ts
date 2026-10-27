import { FORGE_PRIMENG_OPTIONS, FORGE_PRIMENG_TOKENS } from './forge-preset';

type Dict = Record<string, unknown>;
const at = (path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o as Dict | undefined)?.[k], FORGE_PRIMENG_TOKENS);

describe('FORGE_PRIMENG_TOKENS (PrimeNG Aura → --sf-* tokens)', () => {
  it('maps the primary colour onto ember tokens', () => {
    expect(at('semantic.primary.500')).toBe('var(--sf-ember)');
    expect(at('semantic.primary.50')).toBe('var(--sf-ember-soft)');
    expect(at('semantic.colorScheme.light.primary.color')).toBe('var(--sf-ember)');
    expect(at('semantic.colorScheme.light.primary.activeColor')).toBe('var(--sf-ember-dark)');
  });

  it('maps surfaces, text and borders onto the cream/ink/line neutrals', () => {
    expect(at('semantic.colorScheme.light.surface.0')).toBe('var(--sf-surface)');
    expect(at('semantic.colorScheme.light.surface.50')).toBe('var(--sf-cream)');
    expect(at('semantic.colorScheme.light.text.color')).toBe('var(--sf-ink)');
    expect(at('semantic.colorScheme.light.formField.borderColor')).toBe('var(--sf-line)');
  });

  it('uses the kit radii and a visible 3px ember focus ring', () => {
    expect(at('primitive.borderRadius.md')).toBe('var(--sf-radius-md)');
    expect(at('primitive.borderRadius.xl')).toBe('var(--sf-radius-xl)');
    expect(at('semantic.focusRing.width')).toBe('3px');
    expect(String(at('semantic.focusRing.color'))).toContain('var(--sf-ember)');
  });

  it('contains no raw hex or rgb colours (tokens only)', () => {
    const json = JSON.stringify(FORGE_PRIMENG_TOKENS);
    expect(json).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(json).not.toMatch(/rgba?\(/);
  });

  it('scopes PrimeNG dark mode to the Engage shell variant, not the OS', () => {
    expect(FORGE_PRIMENG_OPTIONS.darkModeSelector).toBe('.sf-shell--dark');
  });
});
