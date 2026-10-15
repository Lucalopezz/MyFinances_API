# Ambiente local de teste

O ambiente local usa MongoDB 7 em replica set e Redis 7, com volumes separados do `docker-compose.yml` original. As portas são publicadas somente em `127.0.0.1`:

| Serviço  | Endereço                                    |
| -------- | ------------------------------------------- |
| Frontend | `http://localhost:3000`                     |
| API      | `http://localhost:3001`                     |
| MongoDB  | `127.0.0.1:27028`, banco `myfinances_local` |
| Redis    | `127.0.0.1:6380`                            |

## Preparar e iniciar

Na pasta `MyFinances_API`:

```bash
npm install
npm run setup:local
npm run db:local
npx prisma generate
npx prisma db push
npm run seed:test-transactions
npm run start:dev
```

`setup:local` cria o `.env` da API e, quando o frontend está na pasta irmã `MyFinances_Front`, também o `.env` dele. As chaves de JWT e criptografia são geradas aleatoriamente. Arquivos existentes são preservados: repetir o setup não troca a chave usada para ler os dados financeiros. Os `.env` e os arquivos exportados ficam ignorados pelo Git.

`db:local` aguarda os serviços ficarem saudáveis. O MongoDB inicializa o replica set automaticamente e só fica saudável depois da eleição do PRIMARY, necessário às transações do Prisma.

Em outro terminal, na pasta `MyFinances_Front`:

```bash
npm install
npm run dev -- --hostname 127.0.0.1
```

## Conta e dados de teste

- E-mail: `teste@teste.com`
- Senha: `12345678`
- Nome: `Usuário de Teste`
- Dados: 200 transações de receitas e despesas dos últimos seis meses, identificadas pelo prefixo `[DEV-SEED]`.

O script existente adiciona 200 transações a cada execução. Execute-o uma vez ao preparar o banco; para retomar o mesmo ambiente, basta iniciar os serviços e a aplicação.

## Conferir antes do deploy

1. Entre em `http://localhost:3000` com a conta de teste.
2. Confira a listagem, os filtros e o saldo acumulado.
3. Em **Exportar transações**, gere PDF, CSV para abrir no Excel e Excel nativo `.xlsx`.
4. Aguarde a conclusão e baixe cada arquivo. A exportação da tela inclui todo o histórico da conta.
5. Confira categorias em português no PDF e XLSX, resumo financeiro do PDF, datas/valores tipados e filtros do XLSX.

Validações automatizadas do fluxo:

```bash
# API
npm test -- --runInBand --testPathPattern=exports

# Frontend
npm run test:exports
npm run test:connection
```

Os comandos `npm test` e `npm run test:*:integration` carregam o `.env` automaticamente (Node.js com suporte a `--env-file-if-exists`). As variáveis `CALENDAR_TEST_DATABASE_URL`, `IMPORT_TEST_DATABASE_URL`, `CARDS_TEST_DATABASE_URL`, `NOTIFICATIONS_TEST_DATABASE_URL` e `WISHLIST_TEST_DATABASE_URL` apontam para `mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true`, o MongoDB local acima. Cada suíte cria e remove um banco aleatório próprio, separado de `myfinances_local`; nunca usa `DATABASE_URL`. Variáveis definidas no terminal têm prioridade sobre o arquivo.

```bash
npm test -- --runInBand
npm run test:cards:integration
WISHLIST_TEST_DATABASE_URL='mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true' npm run test:wishlist:integration
```

## Parar e retomar

Encerre frontend/API com `Ctrl+C` nos seus terminais e execute `npm run db:local:stop` na API para parar os containers. Os volumes preservam os dados. Para retomar, execute `npm run db:local` e os comandos de desenvolvimento dos dois projetos.
