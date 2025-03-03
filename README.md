# SaaS Controle de Gastos

Uma aplicação full-stack para gerenciamento financeiro pessoal, permitindo que os usuários controlem suas transações, acompanhem itens da wishlist, gerenciem despesas fixas e visualizem dashboards com comparativos mensais e indicadores financeiros.

---

## Funcionalidades

- **Transações:** Criação, atualização, listagem e remoção de transações (entradas/saídas).
- **Dashboard:** Resumo financeiro com indicadores, gráficos interativos e comparativo mensal.
- **Wishlist:** Gestão de itens desejados, com acompanhamento do progresso de economia.
- **Despesas Fixas:** Cadastro e controle de despesas recorrentes (ex.: aluguel), com:
    - Marcação de pagamento.
    - Notificações automáticas dias antes do vencimento.
    - Reset automático para o próximo ciclo após a data de vencimento.
- **Notificações:** Alertas automáticos para despesas pendentes e vencimentos próximos.

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
├── backend/                # Aplicação NestJS
│   ├── src/
│   │   ├── common/         # Filtros, guards, interceptors, pipes
│   │   ├── modules/        # Módulos por funcionalidade
│   │   │   ├── auth/       # Módulo de autenticação
│   │   │   ├── dashboard/  # Módulo do dashboard
│   │   │   ├── transactions/ # Módulo de transações
│   │   │   ├── wishlist/   # Módulo da wishlist
│   │   │   ├── fixed-expenses/ # Módulo de despesas fixas
│   │   │   ├── notifications/  # Módulo de notificações
│   │   ├── prisma/         # PrismaService e configurações
│   │   ├── app.module.ts   # Módulo raiz que importa os demais
│   │   └── main.ts         # Ponto de entrada da aplicação
│   ├── prisma/             # Schema Prisma e scripts de seed
│   └── package.json        # Configurações e dependências do backend
│
├── frontend/               # Aplicação Next.js
│   ├── app/                # Páginas (dashboard, transactions, wishlist, fixed-expenses, auth)
│   ├── components/         # Componentes compartilhados (Header, Sidebar, UI, Notifications)
│   ├── hooks/              # Hooks customizados (useUser, useTransactions, etc.)
│   ├── utils/              # Configurações de API e validações (Zod)
│   ├── styles/             # Configurações do Tailwind CSS
│   └── package.json        # Configurações e dependências do frontend
└── README.md
````
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
3. Configurar o Banco de Dados:
   - Crie um banco no MongoDB Atlas.
   - Adicione o link no `.env` file:
     ```
     DATABASE_URL=mongodb://user:password@/database_name
     ```
4. Rode as migrations:
   ```bash
   npx prisma generate
   ```
5. Inicie o servidor:
   ```bash
   npm run start:dev
   ```







