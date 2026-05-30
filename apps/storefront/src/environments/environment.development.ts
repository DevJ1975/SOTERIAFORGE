import type { AssuranceEnvironment } from '@assurance/auth';

export const environment: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'demo',
    authDomain: 'localhost',
    projectId: 'soteria-assurance-dev',
    storageBucket: 'soteria-assurance-dev.appspot.com',
    messagingSenderId: 'demo',
    appId: 'demo',
  },
};
