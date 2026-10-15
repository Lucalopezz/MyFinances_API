const { existsSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomBytes } = require('node:crypto');

const apiDirectory = resolve(__dirname, '..');
const frontDirectory = resolve(apiDirectory, '..', 'MyFinances_Front');

/**
 * Cria configurações locais uma única vez. Reutilizar o arquivo é necessário:
 * trocar a chave financeira impediria ler os registros já criptografados.
 * As chaves ficam somente no .env ignorado pelo Git, sem aparecer no terminal.
 */
function createEnv(directory, content) {
  const filePath = resolve(directory, '.env');
  if (existsSync(filePath)) {
    console.log(`Configuração existente preservada: ${filePath}`);
    return;
  }
  writeFileSync(filePath, content, { flag: 'wx', mode: 0o600 });
  console.log(`Configuração local criada: ${filePath}`);
}

createEnv(
  apiDirectory,
  [
    '# Configuração exclusiva para desenvolvimento local.',
    'NODE_ENV=development',
    'PORT=3001',
    'FRONTEND_URL=http://localhost:3000',
    'DATABASE_URL=mongodb://127.0.0.1:27028/myfinances_local?replicaSet=rs0&directConnection=true',
    'CARDS_TEST_DATABASE_URL=mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true',
    'CALENDAR_TEST_DATABASE_URL=mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true',
    'IMPORT_TEST_DATABASE_URL=mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true',
    'NOTIFICATIONS_TEST_DATABASE_URL=mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true',
    'WISHLIST_TEST_DATABASE_URL=mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true',
    '',
    `JWT_SECRET=${randomBytes(48).toString('hex')}`,
    'JWT_TOKEN_AUDIENCE=myfinances',
    'JWT_TOKEN_ISSUER=myfinances-api',
    'JWT_TTL=86400',
    'JWT_REFRESH_TTL=86400',
    '',
    '# Preserve esta chave enquanto usar os dados do banco local.',
    `FINANCIAL_DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
    '',
    'REDIS_URL=redis://127.0.0.1:6380',
    'EXPORT_STORAGE_PATH=./storage/exports-local',
    'TRANSACTION_EXPORT_BATCH_SIZE=50',
    '',
  ].join('\n'),
);

// O frontend é um repositório separado, normalmente irmão da API neste
// workspace. Ele recebe somente a URL pública local, nunca segredos do JWT.
if (existsSync(frontDirectory)) {
  createEnv(
    frontDirectory,
    '# API local usada pelas chamadas de servidor.\nBACKEND_URL=http://127.0.0.1:3001\n',
  );
}
