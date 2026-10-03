# MyFinances API

API de gerenciamento financeiro pessoal do MyFinances, construída com NestJS, Prisma e MongoDB. Centraliza os dados, as regras financeiras e a autenticação consumidos pelo [frontend](https://github.com/Lucalopezz/MyFinances_Front).

Versão de referência: **v2.2.2**. Consulte o [histórico de versões](CHANGELOG.md) para conhecer as mudanças de cada release.

## Funcionalidades

- **Autenticação e usuário:** cadastro, login com JWT, atualização de perfil e senha.
- **Transações:** receitas e despesas, edição, remoção, busca com cursor, totais por filtros e saldo acumulado.
- **Categorias e regras:** catálogo personalizado, arquivamento e sugestões de classificação por descrição.
- **Importação e exportação:** CSV/OFX com prévia e revisão de duplicatas; exportação assíncrona em PDF/CSV.
- **Dashboard e comparativos:** resumo mensal, indicadores e análise de receitas, despesas e saldo.
- **Orçamentos:** limites mensais e acompanhamento de gastos por categoria.
- **Calendário financeiro:** receitas recorrentes, compromissos previstos e projeção diária de saldo.
- **Wishlist:** metas com aportes e retiradas individuais, histórico e conclusão de compras com uma única despesa.
- **Cartões de crédito:** limite, compras parceladas, faturas, pagamento integral e arquivamento de cartões quitados.
- **Despesas fixas e notificações:** recorrências, pagamentos vinculados a transações e lembretes de vencimento.

O [escopo atual](docs/features.md) reúne os comportamentos disponíveis e seus limites.

## Documentação

Comece pelo [índice da documentação](docs/README.md). As referências principais são:

| Referência | Conteúdo |
| --- | --- |
| [Escopo atual](docs/features.md) | Funcionalidades implementadas e regras gerais |
| [Rotas da API](docs/routes.md) | Endpoints, entradas e respostas |
| [Modelos e banco](docs/models.md) | Persistência, relacionamentos e índices |
| [Arquitetura](docs/architecture.md) | Organização dos módulos e regras de integração |
| [Histórico de versões](CHANGELOG.md) | Mudanças por release |

Os guias de domínio, implantação e os registros históricos estão organizados no índice.

## Tecnologias

- NestJS e TypeScript.
- Prisma e MongoDB com replica set.
- Zod para validação e JWT para autenticação.
- AES-256-GCM para proteção dos dados financeiros sensíveis.
- BullMQ e Redis para processamento de exportações.
- PDFKit para relatórios PDF; Jest para testes.

## Instalação e execução

Pré-requisitos: Node.js com npm, MongoDB com replica set e Redis. O replica set é necessário para as operações financeiras atômicas.

1. Clone o repositório e instale as dependências:

   ```bash
   git clone https://github.com/Lucalopezz/MyFinances_API.git
   cd MyFinances_API
   npm install
   ```

2. Copie o exemplo de configuração:

   ```bash
   cp .env.example .env
   ```

   Configure `DATABASE_URL`, as variáveis JWT, `FINANCIAL_DATA_ENCRYPTION_KEY` e `REDIS_URL`. O exemplo também contém a porta e as opções de exportação. A [documentação de criptografia](docs/transaction-encryption.md) explica a geração e a preservação da chave financeira.

3. Gere o Prisma Client e sincronize o schema no banco configurado:

   ```bash
   npx prisma generate
   npx prisma db push
   ```

   Para bancos existentes, faça backup e siga os [guias de implantação por domínio](docs/README.md#guias-de-domínio) antes de sincronizar coleções e índices. O MongoDB não usa Prisma Migrate.

4. Inicie a API:

   ```bash
   npm run start:dev
   ```

   A URL local padrão é `http://localhost:3001`. `GET /health` é público e informa a disponibilidade do processo.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run start:dev` | Desenvolvimento com recarga |
| `npm run build` | Build de produção |
| `npm run start:prod` | Execução da build |
| `npm test -- --runInBand` | Suítes de testes; integrações dependem de configuração própria |
| `npm run test:calendar:integration` | Integração do calendário em banco descartável |
| `npm run test:imports:integration` | Integração da importação em banco descartável |

As variáveis e os limites dos testes de integração estão nos respectivos guias de domínio.

## Estrutura

```text
├── src/
│   ├── common/       # Autorização, validação e infraestrutura compartilhada
│   ├── modules/      # Módulos de domínio e composição da aplicação
│   ├── prisma/       # Acesso ao MongoDB via Prisma
│   └── main.ts       # Entrada da API NestJS
├── prisma/           # Schema do banco
├── docs/             # Referências técnicas, guias e histórico
├── scripts/          # Utilitários de desenvolvimento
├── test/             # Configuração e testes E2E
└── package.json
```
