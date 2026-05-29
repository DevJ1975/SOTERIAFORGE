export default {
  displayName: 'data-access',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/libs/data-access',
  // Rules tests need the Firestore emulator; they run via the `test-rules`
  // target, not the default unit-test run.
  testPathIgnorePatterns: ['/node_modules/', '/src/lib/rules/'],
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      { tsconfig: '<rootDir>/tsconfig.spec.json', stringifyContentPathRegex: '\\.(html|svg)$' },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$|@angular|rxjs)'],
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
};
