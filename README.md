# MyFinances API

API de gerenciamento financeiro pessoal do MyFinances, construída com NestJS, Prisma e MongoDB. Centraliza os dados, as regras financeiras e a autenticação consumidos pelo [frontend](https://github.com/Lucalopezz/MyFinances_Front).

Versão de referência: **v2.2.2**. Consulte o [histórico de versões](CHANGELOG.md) para conhecer as mudanças de cada release.

## Funcionalidades

- **Autenticação e usuário:** cadastro, login com JWT, atualização de perfil e senha.
- **Transações:** receitas e despesas, edição, remoção, busca com cursor, totais por filtros e saldo acumulado.
- **Categorias e regras:** catálogo personalizado, arquivamento e sugestões de classificação por descrição.
- **Importação e exportação:** CSV/OFX com prévia e revisão de duplicatas; exportação assíncrona em PDF/CSV/XLSX.
- **Dashboard e comparativos:** resumo mensal, indicadores e análise de receitas, despesas e saldo.
- **Orçamentos:** limites mensais e acompanhamento de gastos por categoria.
- **Calendário financeiro:** receitas recorrentes, compromissos previstos e projeção diária de saldo.
- **Wishlist:** metas com aportes e retiradas individuais, histórico e conclusão de compras com uma única despesa.
- **Cartões de crédito:** limite por fatura, compras parceladas, despesas fixas no cartão, estorno, pagamento integral e arquivamento com pendências.
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
- PDFKit para relatórios PDF, ExcelJS para planilhas XLSX; Jest para testes.

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

Para testar os dois projetos com banco Docker e uma conta populada, siga o [guia de ambiente local](docs/local-development.md).

| Comando | Uso |
| --- | --- |
| `npm run start:dev` | Desenvolvimento com recarga |
| `npm run build` | Build de produção |
| `npm run start:prod` | Execução da build |
| `npm run test:unit` | Testes unitários, sem serviços externos |
| `npm run test:integration` | Integrações com MongoDB local descartável |
| `npm run test:e2e` | Fluxos HTTP da API |
| `npm run test:cov` | Cobertura dos testes unitários |
| `npm run test:cov:all` | Cobertura consolidada de unitários, integrações e E2E |
| `npm run test:all` | Unitários, integrações e E2E em sequência |
| `npm run test:calendar:integration` | Integração do calendário em banco descartável |
| `npm run test:imports:integration` | Integração da importação em banco descartável |
| `npm run test:wishlist:integration` | Integração de reservas, concorrência e conclusão de metas |

Consulte o [guia de testes](docs/testing.md) para preparar o ambiente, escolher as suítes e consultar a cobertura.

## Estrutura

```text
├── src/
│   ├── common/         # Autorização, validação, datas e valores compartilhados
│   ├── modules/        # Funcionalidades e suas regras de aplicação
│   ├── infrastructure/ # Módulos compartilhados de Prisma e criptografia
│   ├── app.module.ts   # Composição da aplicação
│   └── main.ts         # Entrada da API NestJS
├── prisma/           # Schema do banco
├── docs/             # Referências técnicas, guias e histórico
├── scripts/          # Utilitários de desenvolvimento
├── tests/            # Unitários, integração, E2E e auxiliares de teste
└── package.json
```
