/**
 * Pure helper functions for the cmi5 launch flow.
 *
 * cmi5 is a profile on top of xAPI that defines a standardised launch URL
 * mechanism so that a player (AU) can be initiated from an LMS with all the
 * connection parameters it needs embedded in query parameters.
 *
 * Reference: https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md
 */

/** Parameters required / defined by the cmi5 spec for AU launch URLs. */
export interface Cmi5LaunchParams {
  /** The xAPI LRS endpoint URL. */
  endpoint: string;
  /**
   * Token fetch URL — the AU calls this to get a one-time auth token for
   * the LRS session.
   */
  fetch: string;
  /** JSON-serialised xAPI Actor object for the learner. */
  actor: string;
  /** Registration UUID linking this launch to an enrolment. */
  registration: string;
  /** Activity IRI identifying the AU (the learning object). */
  activityId: string;
}

/**
 * Construct a cmi5 launch URL by appending the standard query parameters to
 * a base URL.
 *
 * @param base       The AU's base launch URL (must be an absolute URL).
 * @param params     The cmi5 launch parameters.
 * @returns          A fully-qualified URL string ready for iframe/popup launch.
 *
 * @example
 * const url = buildLaunchUrl('https://content.example.com/course/index.html', {
 *   endpoint: 'https://lrs.example.com/xapi/',
 *   fetch: 'https://api.example.com/auth/token?session=abc',
 *   actor: JSON.stringify({ objectType:'Agent', account:{ homePage:'https://example.com', name:'uid123' } }),
 *   registration: 'a1b2c3d4-...',
 *   activityId: 'https://example.com/activities/module-1',
 * });
 */
export function buildLaunchUrl(base: string, params: Cmi5LaunchParams): string {
  const url = new URL(base);
  url.searchParams.set('endpoint', params.endpoint);
  url.searchParams.set('fetch', params.fetch);
  url.searchParams.set('actor', params.actor);
  url.searchParams.set('registration', params.registration);
  url.searchParams.set('activityId', params.activityId);
  return url.toString();
}

/**
 * Extract cmi5 launch parameters from a URL (or URL string).
 *
 * Returns `null` for any parameter that is missing from the URL.
 * It is the caller's responsibility to validate that all required fields are
 * present before using the result.
 *
 * @param url  The launch URL (string or URL object).
 * @returns    Extracted cmi5 launch parameters.
 */
export function parseLaunchParams(url: string | URL): Cmi5LaunchParams {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  return {
    endpoint: parsed.searchParams.get('endpoint') ?? '',
    fetch: parsed.searchParams.get('fetch') ?? '',
    actor: parsed.searchParams.get('actor') ?? '',
    registration: parsed.searchParams.get('registration') ?? '',
    activityId: parsed.searchParams.get('activityId') ?? '',
  };
}
