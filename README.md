# SaaS Controle de Gastos

API do MyFinances para gerenciamento financeiro pessoal. A v2.2.0 inclui as entregas A–E do plano de evolução e cartões de crédito. O simulador de compras (item F) ficou fora desta versão.

---

## Funcionalidades

- **Categorias e regras:** categorias personalizadas, arquivamento e classificação sugerida por descrição.
- **Importação CSV/OFX:** prévia, categorias automáticas, revisão de duplicatas e confirmação idempotente. [Contrato e formatos](docs/transaction-imports.md).

- **Transações:** Criação, atualização, listagem e remoção de transações (entradas/saídas).
- **Dashboard:** Resumo financeiro com indicadores, gráficos interativos e comparativo mensal.
- **Calendário financeiro:** receitas recorrentes, despesas previstas e projeção diária. [Regras](docs/financial-calendar.md).
- **Wishlist:** metas com aportes e retiradas individuais; concluir uma compra gera uma única despesa e preserva o histórico. [Regras](docs/wishlist-reservations.md).
- **Cartões de crédito:** cadastro, limite disponível, compras parceladas, faturas por ciclo e pagamento integral. [Regras e implantação](docs/credit-cards.md).
- **Despesas Fixas:** Cadastro e controle de despesas recorrentes (ex.: aluguel), com:
  - Marcação de pagamento.
  - Notificações automáticas dias antes do vencimento.
  - Reset automático para o próximo ciclo após a data de vencimento.
- **Notificações:** Alertas automáticos para despesas pendentes e vencimentos próximos.

---

## Documentação

- [Escopo e validação da v2.2.0](docs/next-steps.md)
- [Rotas da API](docs/routes.md)
- [Plano de implementação — rodada anterior](docs/implementation-plan.md)
- [Documentação dos Models](docs/models.md)
- [Organização da API](docs/architecture.md)
- [Criptografia de Transações](docs/transaction-encryption.md)
- [Exportação assíncrona de transações](docs/transaction-exports.md)
- [V2](docs/v2.md)

---

## Tecnologias Utilizadas

### Back-end

- **NestJS** – Framework para Node.js.
- **Prisma** – ORM para o MongoDB.
- **Zod** – Validação de dados.
- **@nestjs/schedule** – Tarefas agendadas (para resetar despesas fixas e disparar notificações).

### Front-end

- **Next.js** (App Router)
- **TanStack Query** – Gerenciamento de dados e cache.
- **React Hook Form** – Manipulação de formulários.
- **Zod** – Validação de formulários.
- **Tailwind CSS & Shadcn/UI** – Estilização e componentes UI.
- **Recharts** – Visualização de gráficos.

---

## Estrutura do Projeto

```plaintext
├── src/
│   ├── common/       # Guards, validação e infraestrutura compartilhada
│   ├── modules/      # Auth, transações, categorias, importação, calendário,
│   │                 # wishlist, cartões e demais domínios
│   ├── prisma/       # Acesso ao MongoDB via Prisma
│   └── main.ts       # Entrada da API NestJS
├── prisma/           # Schema do banco
├── docs/             # Contratos, modelos e implantação
├── scripts/          # Utilitários de desenvolvimento
└── package.json
```

O frontend Next.js fica no repositório `MyFinances_Front`.

## Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/Lucalopezz/MyFinances_API.git
   cd MyFinances_API
   ```
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Copie `.env.example` para `.env` e configure MongoDB, JWT, chave de criptografia financeira e Redis. Os fluxos de pagamento e reserva usam transações MongoDB e exigem replica set.
4. Gere o Prisma Client:
   ```bash
   npx prisma generate
   ```
   Antes de publicar a v2.2.0, faça backup e sincronize o schema no ambiente de destino com `npx prisma db push`; siga os guias de implantação em `docs/`.
5. Inicie o servidor:
   ```bash
   npm run start:dev
   ```
