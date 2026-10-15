// Cada suíte cria um banco aleatório. Esta URL identifica apenas o servidor local.
// O comando de integração deve executar os testes, nunca ignorá-los por falta de .env.
process.env.TEST_DATABASE_URL ??=
  'mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true';
for (const domain of [
  'CARDS',
  'CALENDAR',
  'IMPORT',
  'NOTIFICATIONS',
  'WISHLIST',
]) {
  process.env[`${domain}_TEST_DATABASE_URL`] ??= process.env.TEST_DATABASE_URL;
}
