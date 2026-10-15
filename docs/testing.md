# Testes da API

Todos os testes ficam em `tests/`, separados do código distribuído em `src/`:

- `unit/`: regras de domínio e serviços com dependências isoladas; não exigem Docker.
- `integration/`: composição Nest e persistência real em MongoDB com replica set.
- `e2e/`: contratos e fluxos pela interface HTTP, com aplicação Nest, bcrypt, JWT, MongoDB, fila Redis e worker reais.
- `support/`: criação e limpeza dos recursos exclusivos de cada suíte.
- As configurações Jest e os auxiliares também ficam em `tests/`.

## Execução

```bash
npm run test:unit
npm run test:cov
npm run db:local
npm run test:integration
npm run test:e2e
npm run test:all
npm run test:cov:all
```

Os unitários são o comando padrão (`npm test`). `test:cov` gera o relatório em `coverage/`, incluindo `coverage/lcov-report/index.html`. Arquivos de produção sem testes entram na medição; `src/main.ts`, que apenas inicia o processo, fica fora.

`test:cov:all` executa as três camadas e reúne sua cobertura em `coverage/all/index.html`, com LCOV e resumo JSON na mesma pasta. Requer MongoDB e Redis locais. Os percentuais unitários e consolidados são medições distintas: o relatório consolidado inclui caminhos exercitados apenas com persistência e HTTP reais.

O comando consolidado falha abaixo de 90% de statements, funções ou linhas, ou de 75% de branches. Na validação desta ampliação, passaram 267 testes em 49 suítes: 177 unitários, 63 de integração e 27 E2E. A cobertura consolidada foi 91,81% de statements, 76,77% de branches, 91,04% de funções e 91,68% de linhas. A cobertura apenas unitária foi 53,42% de linhas; ainda há espaço para isolar mais regras dos cenários hoje exercitados pelas integrações e pelos E2E.

As suítes usam configuração JWT e chave de criptografia exclusivas de teste, sem depender dos segredos do `.env` pessoal. Integrações usam por padrão `mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true`, atendido pelo `npm run db:local`. Outra porta local pode ser informada explicitamente:

```bash
TEST_DATABASE_URL='mongodb://127.0.0.1:27029/?replicaSet=rs0&directConnection=true' npm run test:integration
```

Cada suíte cria um banco com nome aleatório, sincroniza os índices com Prisma e remove somente esse banco ao encerrar. Nunca utiliza o banco apontado por `DATABASE_URL` para limpar dados. Destinos remotos são recusados. As variáveis antigas por domínio (`CARDS_TEST_DATABASE_URL`, `CALENDAR_TEST_DATABASE_URL`, `IMPORT_TEST_DATABASE_URL`, `NOTIFICATIONS_TEST_DATABASE_URL` e `WISHLIST_TEST_DATABASE_URL`) continuam aceitas nas suítes existentes. Os comandos de integração ativam essas suítes mesmo sem `.env`; banco indisponível causa falha, não sucesso com testes ignorados.

E2E usa Redis em `redis://127.0.0.1:6380`, com prefixo aleatório por suíte e sem limpar outras filas. Use `TEST_REDIS_URL` para escolher outra porta local. Exportações são gravadas em uma pasta temporária exclusiva; worker, fila, banco e arquivos são encerrados e removidos ao terminar. As variáveis `TEST_DATABASE_URL` e `TEST_REDIS_URL` devem ser exportadas no shell ou passadas junto ao comando; os scripts não carregam o `.env` pessoal como configuração de testes.

## Cenários cobertos

| Camada | Cobertura de comportamento |
| --- | --- |
| Unitários | Criptografia e adulteração, datas civis e recorrências, regras de classificação, revisões de receitas, duplicatas de extratos e validação de cursores, além das suítes preexistentes |
| Integração | Persistência criptografada, edição parcial, paginação, isolamento por usuário, arquivamento de categorias, concorrência do índice de orçamentos e recálculo dos gastos, além dos domínios já cobertos |
| E2E | Cadastro, login, perfil e troca de senha; transações, busca, saldo, categorias/regras, orçamentos e dashboard; calendário e confirmação de receitas; aportes e conclusão de metas; compra parcelada, pagamento e estorno no cartão; pagamento/desfazimento de despesas fixas e resolução de lembretes; multipart de importação, confirmação idempotente e cancelamento; fila, geração e download de CSV/XLSX/PDF |

E2E inicia o `AppModule` em processo com o filtro público de erros e o limite JSON da API. Não testa infraestrutura de deploy, TLS, CORS ou cabeçalhos Helmet do bootstrap. A aplicação de negócio usa os providers reais, sem substituir autenticação, serviços, repositórios ou processamento assíncrono por mocks.

Os comandos específicos por domínio continuam disponíveis, como `npm run test:cards:integration`. Para executar um arquivo unitário, use seu novo caminho:

```bash
npm test -- --runInBand --runTestsByPath tests/unit/modules/cards/domain/card-calculation.spec.ts
```

## Novas mudanças

Siga o ciclo TDD descrito no `AGENTS.md`: teste primeiro, confirme a falha de comportamento, implemente e refatore. Correções de bugs exigem regressão. Ao caracterizar código existente, os testes podem passar de imediato. Cubra regras, erros e isolamento entre usuários; integrações e E2E complementam os unitários onde há persistência, transações atômicas e contratos HTTP.
