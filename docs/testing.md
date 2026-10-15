# Testes da API

Todos os testes ficam em `tests/`, separados do código distribuído em `src/`:

- `unit/`: regras de domínio e serviços com dependências isoladas; não exigem Docker.
- `integration/`: composição Nest e persistência real em MongoDB com replica set.
- `e2e/`: contratos e fluxos pela interface HTTP.
- As configurações Jest e os auxiliares também ficam em `tests/`.

## Execução

```bash
npm run test:unit
npm run test:cov
npm run db:local
npm run test:integration
npm run test:e2e
npm run test:all
```

Os unitários são o comando padrão (`npm test`). `test:cov` gera o relatório em `coverage/`, incluindo `coverage/lcov-report/index.html`. Arquivos de produção sem testes entram na medição; `src/main.ts`, que apenas inicia o processo, fica fora.

As suítes usam configuração JWT e chave de criptografia exclusivas de teste, sem depender dos segredos do `.env` pessoal. Integrações usam por padrão `mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true`, atendido pelo `npm run db:local`. Outra porta local pode ser informada explicitamente:

```bash
TEST_DATABASE_URL='mongodb://127.0.0.1:27029/?replicaSet=rs0&directConnection=true' npm run test:integration
```

Cada suíte cria um banco com nome aleatório, sincroniza os índices com Prisma e remove somente esse banco ao encerrar. Nunca utiliza o banco apontado por `DATABASE_URL` para limpar dados. Destinos remotos são recusados. As variáveis antigas por domínio (`CARDS_TEST_DATABASE_URL`, `CALENDAR_TEST_DATABASE_URL`, `IMPORT_TEST_DATABASE_URL`, `NOTIFICATIONS_TEST_DATABASE_URL` e `WISHLIST_TEST_DATABASE_URL`) continuam aceitas nas suítes existentes. Os comandos de integração ativam essas suítes mesmo sem `.env`; banco indisponível causa falha, não sucesso com testes ignorados.

Os comandos específicos por domínio continuam disponíveis, como `npm run test:cards:integration`. Para executar um arquivo unitário, use seu novo caminho:

```bash
npm test -- --runInBand --runTestsByPath tests/unit/modules/cards/domain/card-calculation.spec.ts
```

## Novas mudanças

Siga o ciclo TDD descrito no `AGENTS.md`: teste primeiro, confirme a falha de comportamento, implemente e refatore. Correções de bugs exigem regressão. Ao caracterizar código existente, os testes podem passar de imediato. Cubra regras, erros e isolamento entre usuários; integrações e E2E complementam os unitários onde há persistência, transações atômicas e contratos HTTP.
