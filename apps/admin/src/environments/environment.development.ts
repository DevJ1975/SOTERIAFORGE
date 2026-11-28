import type { AssuranceEnvironment } from '@assurance/auth';

// Same hostname as the page, port 8000: tenant hosts (lakewood.localhost) then stay
// same-site with the API, so the refresh cookie works. SSR falls back to localhost.
const host = typeof location === 'undefined' ? 'localhost' : location.hostname;

export const environment: AssuranceEnvironment = {
  production: false,
  apiBaseUrl: `http://${host}:8000`,
  rootDomain: 'localhost',
};
