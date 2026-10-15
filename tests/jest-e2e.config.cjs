module.exports = {
  ...require('./jest-integration.config.cjs'),
  testMatch: ['<rootDir>/tests/e2e/**/*.e2e-spec.ts'],
};
