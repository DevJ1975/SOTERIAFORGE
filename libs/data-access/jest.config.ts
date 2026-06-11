export default {
  displayName: 'data-access',
  preset: '../../jest.preset.js',
  // Node environment: the rules tests talk to the Firestore/Storage emulators
  // over the network, and the converter/pagination tests are
  // environment-agnostic.
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/libs/data-access',
  transform: {
    // jest-preset-angular (a ts-jest superset) rather than plain ts-jest:
    // media-upload.ts pulls in @angular/core's .mjs fesm bundles, which
    // ts-jest alone would leave as ESM under this CommonJS jest run.
    '^.+\\.(ts|mjs|js)$': ['jest-preset-angular', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
};
