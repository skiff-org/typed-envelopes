export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  globals: { 'ts-jest': { diagnostics: false } },
};
