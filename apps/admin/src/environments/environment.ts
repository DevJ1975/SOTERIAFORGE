import type { AssuranceEnvironment } from '@assurance/auth';

export const environment: AssuranceEnvironment = {
  production: true,
  apiBaseUrl: 'https://api.soteriaforge.com',
  rootDomain: 'soteriaforge.com',
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
  appCheckSiteKey: '',
};
