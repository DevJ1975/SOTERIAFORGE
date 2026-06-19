import { provideForgeAppCheck, resolveAppCheckSiteKey } from './app-check.providers';

describe('resolveAppCheckSiteKey (demo-safe)', () => {
  afterEach(() => {
    delete (window as { __FORGE_APPCHECK_SITE_KEY__?: string }).__FORGE_APPCHECK_SITE_KEY__;
  });

  it('returns undefined when no key is configured (dev/emulator default)', () => {
    expect(resolveAppCheckSiteKey()).toBeUndefined();
  });

  it('prefers an explicit key', () => {
    expect(resolveAppCheckSiteKey('explicit-key')).toBe('explicit-key');
  });

  it('falls back to window.__FORGE_APPCHECK_SITE_KEY__', () => {
    (window as { __FORGE_APPCHECK_SITE_KEY__?: string }).__FORGE_APPCHECK_SITE_KEY__ = 'win-key';
    expect(resolveAppCheckSiteKey()).toBe('win-key');
  });

  it('ignores blank / whitespace-only keys', () => {
    expect(resolveAppCheckSiteKey('   ')).toBeUndefined();
    (window as { __FORGE_APPCHECK_SITE_KEY__?: string }).__FORGE_APPCHECK_SITE_KEY__ = '  ';
    expect(resolveAppCheckSiteKey()).toBeUndefined();
  });
});

describe('provideForgeAppCheck (demo-safe)', () => {
  it('returns an EnvironmentProviders no-op when no key is configured', () => {
    // Must not throw and must not attempt to initialize App Check without a key.
    expect(() => provideForgeAppCheck()).not.toThrow();
    const providers = provideForgeAppCheck();
    expect(providers).toBeDefined();
  });
});
