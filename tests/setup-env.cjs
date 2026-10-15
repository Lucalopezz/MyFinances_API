// Configuração determinística: testes não dependem de segredos nem do .env pessoal.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL:
    'mongodb://127.0.0.1:27028/unused_test_database?directConnection=true',
  JWT_SECRET: 'myfinances-test-only-secret',
  JWT_TOKEN_AUDIENCE: 'myfinances-tests',
  JWT_TOKEN_ISSUER: 'myfinances-api-tests',
  JWT_TTL: '3600',
  FINANCIAL_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  PRISMA_DIAGNOSTICS: 'false',
});
