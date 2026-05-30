export default {
  displayName: 'functions',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@assurance/shared$': '<rootDir>/../../libs/shared/src/index.ts',
  },
  coverageDirectory: '../../coverage/apps/functions',
};
