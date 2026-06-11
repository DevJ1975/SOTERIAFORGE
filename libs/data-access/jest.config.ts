export default {
  displayName: 'data-access',
  preset: '../../jest.preset.js',
  // Node environment: the rules tests talk to the Firestore emulator over the
  // network, and the converter/pagination tests are environment-agnostic.
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/libs/data-access',
  transform: {
    '^.+\\.(ts|mjs|js)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
};
