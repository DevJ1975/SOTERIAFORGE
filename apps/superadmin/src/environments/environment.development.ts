import type { ForgeEnvironment } from '@forge/auth';

export const environment: ForgeEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'demo',
    authDomain: 'localhost',
    projectId: 'soteria-forge-dev',
    storageBucket: 'soteria-forge-dev.appspot.com',
    messagingSenderId: 'demo',
    appId: 'demo',
  },
};
