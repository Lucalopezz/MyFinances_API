module.exports = {
  ...require('./jest-base.config.cjs'),
  testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
  setupFiles: [
    '<rootDir>/tests/setup-env.cjs',
    '<rootDir>/tests/setup-database.cjs',
  ],
  testTimeout: 60000,
};
