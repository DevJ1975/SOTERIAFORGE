import { buildLaunchUrl, parseLaunchParams, Cmi5LaunchParams } from './cmi5';

describe('cmi5 helpers', () => {
  const BASE_URL = 'https://content.example.com/module/index.html';

  const SAMPLE_PARAMS: Cmi5LaunchParams = {
    endpoint: 'https://lrs.example.com/xapi/',
    fetch: 'https://api.example.com/auth/token?session=abc123',
    actor: JSON.stringify({
      objectType: 'Agent',
      account: { homePage: 'https://example.com', name: 'user-uid-42' },
    }),
    registration: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    activityId: 'https://example.com/activities/module-1',
  };

  describe('buildLaunchUrl', () => {
    it('returns a string URL containing the base URL', () => {
      const result = buildLaunchUrl(BASE_URL, SAMPLE_PARAMS);
      expect(result).toContain('https://content.example.com/module/index.html');
    });

    it('encodes and appends all five cmi5 query parameters', () => {
      const result = buildLaunchUrl(BASE_URL, SAMPLE_PARAMS);
      const url = new URL(result);
      expect(url.searchParams.get('endpoint')).toBe(SAMPLE_PARAMS.endpoint);
      expect(url.searchParams.get('fetch')).toBe(SAMPLE_PARAMS.fetch);
      expect(url.searchParams.get('actor')).toBe(SAMPLE_PARAMS.actor);
      expect(url.searchParams.get('registration')).toBe(SAMPLE_PARAMS.registration);
      expect(url.searchParams.get('activityId')).toBe(SAMPLE_PARAMS.activityId);
    });

    it('preserves existing query parameters on the base URL', () => {
      const baseWithParams = `${BASE_URL}?foo=bar`;
      const result = buildLaunchUrl(baseWithParams, SAMPLE_PARAMS);
      const url = new URL(result);
      expect(url.searchParams.get('foo')).toBe('bar');
      expect(url.searchParams.get('endpoint')).toBe(SAMPLE_PARAMS.endpoint);
    });
  });

  describe('parseLaunchParams', () => {
    it('extracts all cmi5 parameters from a URL string', () => {
      const launchUrl = buildLaunchUrl(BASE_URL, SAMPLE_PARAMS);
      const parsed = parseLaunchParams(launchUrl);
      expect(parsed.endpoint).toBe(SAMPLE_PARAMS.endpoint);
      expect(parsed.fetch).toBe(SAMPLE_PARAMS.fetch);
      expect(parsed.actor).toBe(SAMPLE_PARAMS.actor);
      expect(parsed.registration).toBe(SAMPLE_PARAMS.registration);
      expect(parsed.activityId).toBe(SAMPLE_PARAMS.activityId);
    });

    it('accepts a URL object as well as a string', () => {
      const launchUrl = buildLaunchUrl(BASE_URL, SAMPLE_PARAMS);
      const urlObj = new URL(launchUrl);
      const parsed = parseLaunchParams(urlObj);
      expect(parsed.endpoint).toBe(SAMPLE_PARAMS.endpoint);
    });

    it('returns empty strings for missing parameters', () => {
      const parsed = parseLaunchParams('https://example.com/');
      expect(parsed.endpoint).toBe('');
      expect(parsed.fetch).toBe('');
      expect(parsed.actor).toBe('');
      expect(parsed.registration).toBe('');
      expect(parsed.activityId).toBe('');
    });
  });

  describe('round-trip: buildLaunchUrl → parseLaunchParams', () => {
    it('recovers the original params exactly after a round-trip', () => {
      const launchUrl = buildLaunchUrl(BASE_URL, SAMPLE_PARAMS);
      const recovered = parseLaunchParams(launchUrl);
      expect(recovered).toEqual(SAMPLE_PARAMS);
    });

    it('handles actor JSON with special characters in the round-trip', () => {
      const paramsWithSpecial: Cmi5LaunchParams = {
        ...SAMPLE_PARAMS,
        actor: JSON.stringify({
          objectType: 'Agent',
          name: 'Ünïcödé Üser',
          account: { homePage: 'https://example.com', name: 'uid+42&special=true' },
        }),
      };
      const launchUrl = buildLaunchUrl(BASE_URL, paramsWithSpecial);
      const recovered = parseLaunchParams(launchUrl);
      expect(recovered.actor).toBe(paramsWithSpecial.actor);
    });
  });
});
