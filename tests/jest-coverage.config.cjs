module.exports = {
  ...require('./jest-integration.config.cjs'),
  testMatch: [
    '<rootDir>/tests/unit/**/*.spec.ts',
    '<rootDir>/tests/integration/**/*.spec.ts',
    '<rootDir>/tests/e2e/**/*.e2e-spec.ts',
  ],
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage/all',
  coverageReporters: ['text-summary', 'html', 'lcovonly', 'json-summary'],
  coverageThreshold: {
    global: { statements: 90, branches: 75, functions: 90, lines: 90 },
  },
};
