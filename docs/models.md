# Modelos e Banco de Dados

Este documento descreve os modelos principais da aplicação, a estrutura do banco de dados e as funções mais importantes ligadas a cada domínio.

A aplicação usa **MongoDB** como banco de dados e **Prisma** como ORM. Todos os modelos usam `String` com `@db.ObjectId` como identificador, mapeado para `_id` no MongoDB.

---

## Visão Geral

| Modelo         | Coleção        | Responsabilidade                                                  |
| -------------- | -------------- | ----------------------------------------------------------------- |
| `User`         | `User`         | Armazena dados de cadastro e autenticação do usuário.             |
| `Transaction`  | `Transaction`  | Registra receitas e despesas do usuário.                          |
| `WishlistItem` | `WishlistItem` | Controla objetivos financeiros e progresso de economia.           |
| `FixedExpense` | `FixedExpense` | Controla despesas recorrentes, vencimentos e status de pagamento. |
| `Notification` | `Notification` | Armazena alertas, lembretes e informações exibidas ao usuário.    |
| `MonthlyBudget` | `MonthlyBudget` | Guarda limites mensais por categoria de despesa. |
| `TransactionExport` | `TransactionExport` | Guarda estado, filtros e formato de exportações assíncronas. |
| `TransactionImport` | `TransactionImport` | Guarda prévia criptografada de extrato com expiração. |
| `TransactionImportResult` | `TransactionImportResult` | Guarda recibos por linha para confirmação idempotente. |
| `CreditCard` | `CreditCard` | Guarda configuração e limite do cartão, com dados financeiros criptografados. |
| `CardPurchase` | `CardPurchase` | Guarda compras no crédito, sem criar transações no ato. |
| `CardInstallment` | `CardInstallment` | Guarda parcelas por ciclo e vencimento. |
| `CardPayment` | `CardPayment` | Guarda quitação de fatura e vínculos com transações realizadas. |

Os modelos de dados relacionados ao usuário possuem `userId`, garantindo que cada registro seja consultado e alterado apenas dentro do contexto do usuário autenticado.

---

## User

Representa o usuário cadastrado na plataforma.

### Campos

| Campo       | Tipo                  | Obrigatório | Descrição                       |
| ----------- | --------------------- | ----------- | ------------------------------- |
| `id`        | `String @db.ObjectId` | Sim         | Identificador único do usuário. |
| `email`     | `String`              | Sim         | E-mail único usado no login.    |
| `password`  | `String`              | Sim         | Senha armazenada como hash.     |
| `name`      | `String`              | Sim         | Nome do usuário.                |
| `createdAt` | `DateTime`            | Sim         | Data de criação do usuário.     |
| `updatedAt` | `DateTime`            | Sim         | Data da última atualização.     |

### Principais funções

- `POST /user`: cria um usuário, aplica hash na senha e impede e-mails duplicados.
- `GET /user/get-one`: retorna os dados públicos do usuário autenticado.
- `PATCH /user/update`: atualiza nome e/ou senha do usuário autenticado.
- `POST /auth`: valida e-mail e senha e retorna um `accessToken` JWT.

### Observações

- A senha nunca é retornada nas consultas públicas.
- O login usa o `email` como chave de busca e compara a senha informada com o hash salvo.

---

## Transaction

Representa uma movimentação financeira. Pode ser uma receita (`INCOME`) ou uma despesa (`EXPENSE`).

### Campos

| Campo           | Tipo                  | Obrigatório | Descrição                                                                |
| --------------- | --------------------- | ----------- | ------------------------------------------------------------------------ |
| `id`            | `String @db.ObjectId` | Sim         | Identificador único da transação.                                        |
| `encryptedData` | `Json`                | Sim         | Payload criptografado com `value`, `date`, `category` e `description`.   |
| `encryptedImportIdentity` | `String?` | Não | Origem e identificador externo criptografados para correspondências de importação. |
| `dateIndex`     | `Int`                 | Sim         | Índice operacional `YYYYMMDD` usado para filtro e ordenação por período. |
| `type`          | `TransactionType`     | Sim         | Define se é `INCOME` ou `EXPENSE`.                                       |
| `createdAt`     | `DateTime`            | Sim         | Data de criação do registro.                                             |
| `updatedAt`     | `DateTime`            | Sim         | Data da última atualização.                                              |
| `userId`        | `String @db.ObjectId` | Sim         | Dono da transação.                                                       |

### Enums

```ts
TransactionType = INCOME | EXPENSE;
```

Categorias de receita:

- `SALARY`
- `FREELANCE`
- `INVESTMENTS`
- `GIFTS_RECEIVED`
- `REFUNDS`
- `OTHER_INCOME`

Categorias de despesa:

- `FOOD`
- `TRANSPORT`
- `ENTERTAINMENT`
- `UTILITIES`
- `HEALTH`
- `EDUCATION`
- `SHOPPING`
- `SUBSCRIPTIONS`
- `HOUSING`
- `TRAVEL`
- `PETS`
- `TAXES`
- `INSURANCE`
- `PERSONAL_CARE`
- `DEBT_PAYMENT`
- `OTHER`

### Principais funções

- `POST /transactions`: cria uma transação do usuário autenticado.
- `GET /transactions`: lista as transações paginadas do usuário, ordenadas por `dateIndex` decrescente.
- `GET /transactions/search`: busca global com filtros, cursor e ordenação por `dateIndex` e `id` decrescentes; a resposta contém `data`, `nextCursor` e `hasMore`.
- `GET /transactions/:id`: busca uma transação específica do usuário.
- `PATCH /transactions/:id`: atualiza uma transação existente.
- `DELETE /transactions/:id`: remove uma transação.

### Regras de negócio

- A validação diferencia receitas e despesas usando `type`.
- As categorias permitidas mudam conforme o tipo da transação.
- Criar, atualizar ou remover uma transação altera o saldo financeiro disponível para novos aportes, sem modificar reservas existentes.
- A API descriptografa os dados sensíveis antes de responder, mantendo o contrato externo com `value`, `date`, `category` e `description`.

---

## Dashboard

O dashboard não possui uma coleção própria. Ele é calculado a partir das transações do usuário.

### Entrada

Os endpoints recebem:

| Campo       | Tipo       | Descrição                |
| ----------- | ---------- | ------------------------ |
| `startDate` | `DateTime` | Data inicial do período. |
| `endDate`   | `DateTime` | Data final do período.   |

### Principais funções

- `GET /dashboard`: retorna o resumo financeiro do período.
- `GET /dashboard/monthly-comparison`: retorna o comparativo mensal dentro do período informado.
- `GET /dashboard/forecast`: retorna saldo real do mês atual, despesas fixas pendentes até o fim do mês e saldo projetado, sem persistir lançamentos previstos.

### Cálculos

Resumo financeiro:

```ts
totalIncomes = soma das transacoes INCOME
totalExpenses = soma das transacoes EXPENSE
balance = totalIncomes - totalExpenses
```

Comparativo mensal:

- Agrupa as transações por mês no formato `YYYY-MM`.
- Calcula receitas e despesas totais de cada mês.
- Calcula a variação percentual do saldo em relação ao mês anterior quando houver mês anterior.

---

## WishlistItem e WishlistMovement

Operação e migração: [wishlist-reservations.md](wishlist-reservations.md).

`WishlistItem` guarda nome, valor desejado, prazo opcional, `status` (`ACTIVE` ou `COMPLETED`), `completedAt`, `purchaseTransactionId` e `userId`. O antigo `savedAmount` permanece como referência histórica; não é reserva. `reservationMigrationState` identifica metas antigas pendentes de distribuição (`PENDING`) e metas novas ou já revisadas (`SETTLED`). Campos novos são opcionais no schema para leitura dos documentos MongoDB anteriores à sincronização; a API interpreta ausência como `ACTIVE` e `PENDING`.

`WishlistMovement` guarda `userId`, `wishlistItemId`, `kind` (`DEPOSIT`, `WITHDRAWAL`, `CONSUMPTION`, `RELEASE`), `createdAt` e `encryptedData` com valor, data e observação criptografados em AES-256-GCM. A reserva é derivada do histórico em centavos; nenhuma transação é criada por aporte ou retirada.

O saldo registrado é a soma das transações descriptografadas do usuário; o total reservado soma apenas metas ativas; o saldo livre é a diferença. Aportes e conclusões concorrentes escrevem `User.reservationRevision` na mesma transação MongoDB para serializar atualizações de reservas. Conclusão cria despesa criptografada, movimentos de consumo/liberação e marca a meta concluída na mesma transação. Repetição retorna a transação vinculada. `Transaction` vinculada não pode ser editada ou excluída pelo CRUD genérico. Excluir uma meta ativa remove seus movimentos e libera a reserva; excluí-la após compra é bloqueado.

A sugestão mensal divide o valor restante pelos meses civis de UTC desde o mês atual até o mês do prazo, ambos incluídos, arredondando para cima em centavos. Prazo passado, ausente ou meta alcançada não produz divisão. Migração preserva nome, valor e prazo; o usuário escolhe seus aportes iniciais e confirma a distribuição. A economia anual antiga nunca vira aporte automaticamente.

---

## FixedExpense

Representa uma despesa fixa recorrente, como aluguel, assinatura, financiamento ou conta mensal.

### Campos

| Campo                     | Tipo                  | Obrigatório | Descrição                                                                                                  |
| ------------------------- | --------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `id`                      | `String @db.ObjectId` | Sim         | Identificador único da despesa fixa.                                                                       |
| `name`                    | `String`              | Sim         | Nome da despesa.                                                                                           |
| `amount`                  | `Float`               | Sim         | Valor da despesa.                                                                                          |
| `category`                | `String`              | Sim         | Categoria usada na transação criada ao marcar como paga. Aceita `UTILITIES`, `SUBSCRIPTIONS` ou `HOUSING`. |
| `dueDate`                 | `DateTime`            | Sim         | Data de vencimento.                                                                                        |
| `isPaid`                  | `Boolean`             | Sim         | Indica se a despesa foi paga no ciclo atual.                                                               |
| `paidAt`                  | `DateTime?`           | Não         | Data em que a despesa fixa foi marcada como paga.                                                          |
| `paidTransactionId`       | `String`              | Não         | Transação criada ao marcar a despesa fixa como paga.                                                       |
| `recurrence`              | `RecurrenceType`      | Sim         | Recorrência mensal ou anual.                                                                               |
| `lastNotificationDueDate` | `DateTime?`           | Não         | Último vencimento para o qual foi enviada notificação.                                                     |
| `createdAt`               | `DateTime`            | Sim         | Data de criação.                                                                                           |
| `updatedAt`               | `DateTime`            | Sim         | Data da última atualização.                                                                                |
| `userId`                  | `String @db.ObjectId` | Sim         | Dono da despesa fixa.                                                                                      |

### Enums

```ts
RecurrenceType = MONTHLY | YEARLY;
```

### Principais funções

- `POST /fixed-expenses`: cria uma despesa fixa.
- `GET /fixed-expenses`: lista as despesas fixas do usuário.
- `GET /fixed-expenses/:id`: busca uma despesa fixa específica.
- `PATCH /fixed-expenses/:id`: atualiza dados cadastrais da despesa fixa.
- `PATCH /fixed-expenses/:id/payment`: marca ou desmarca a despesa fixa como paga.
- `DELETE /fixed-expenses/:id`: remove a despesa fixa.

### Regras de negócio

- A data de vencimento é normalizada para o início do dia.
- O valor precisa ser positivo.
- A categoria precisa ser uma das categorias permitidas para despesas fixas.
- Marcar como paga cria uma transação de despesa vinculada pela própria despesa fixa, usando a categoria cadastrada na despesa fixa.
- Desmarcar como paga remove somente a transação vinculada por `paidTransactionId`.
- A data de vencimento não pode estar no passado na criação.
- Ao consultar ou atualizar despesas fixas, a aplicação executa a atualização automática de recorrência.
- Quando uma despesa recorrente está paga e o vencimento já passou, a aplicação:
  - calcula o próximo vencimento;
  - define `isPaid` como `false`;
  - limpa `lastNotificationDueDate`.
- A aplicação cria notificações de lembrete para despesas não pagas que vencem em até 3 dias.
- O campo `lastNotificationDueDate` evita repetir lembretes para o mesmo vencimento.

---

## Notification

Representa uma notificação exibida ao usuário.

### Campos

| Campo       | Tipo                  | Obrigatório | Descrição                           |
| ----------- | --------------------- | ----------- | ----------------------------------- |
| `id`        | `String @db.ObjectId` | Sim         | Identificador único da notificação. |
| `title`     | `String`              | Sim         | Título da notificação.              |
| `message`   | `String`              | Sim         | Mensagem detalhada.                 |
| `type`      | `NotificationType`    | Sim         | Tipo da notificação.                |
| `read`      | `Boolean`             | Sim         | Indica se a notificação foi lida.   |
| `createdAt` | `DateTime`            | Sim         | Data de criação.                    |
| `userId`    | `String @db.ObjectId` | Sim         | Dono da notificação.                |

### Enums

```ts
NotificationType = ALERT | REMINDER | INFO;
```

### Principais funções

- `POST /notifications`: cria uma notificação para o usuário autenticado.
- `GET /notifications`: lista notificações do usuário, ordenadas por `createdAt` decrescente.
- `PATCH /notifications/:id/mark-as-read`: marca uma notificação como lida.
- `PATCH /notifications/mark-all-as-read`: marca como lidas apenas as notificações não lidas do usuário e retorna a quantidade alterada.
- `DELETE /notifications/:id`: remove uma notificação.

### Regras de negócio

- Notificações são sempre vinculadas a um usuário.
- O tipo `REMINDER` é usado automaticamente para avisos de despesas fixas próximas do vencimento.
- A marcação como lida altera apenas o campo `read`.

---

## MonthlyBudget

Orçamento independente por usuário, mês (`YYYY-MM`) e categoria de despesa. Campos: `id`, `userId`, `monthKey`, `category`, `limitAmount`, `createdAt` e `updatedAt`. Há índice único em `(userId, monthKey, category)` e índice de consulta em `(userId, monthKey)`. O limite deve ser positivo. O gasto não é armazenado: `GET /budgets/summary` percorre transações de despesa do mês em lotes, descriptografa a categoria no servidor e retorna `spentAmount` e `remainingAmount` por orçamento.

## TransactionExport

Exportação assíncrona do usuário com `status` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), `progress`, filtros opcionais, `format` (`PDF` ou `CSV`, padrão `PDF`), `fileName`, erro e datas. O formato fica no registro para controlar a extensão e o content-type do download. Arquivos são locais e efêmeros.

---

## Relacionamentos Lógicos

O schema atual não declara relações Prisma formais entre os modelos, mas a aplicação usa `userId` como relacionamento lógico entre o usuário e seus dados.

```plaintext
User
├── Transaction[]
├── WishlistItem[]
├── WishlistMovement[]
├── CreditCard[]
├── CardPurchase[]
├── CardInstallment[]
├── CardPayment[]
├── FixedExpense[]
├── Notification[]
├── MonthlyBudget[]
└── TransactionExport[]
```

### Fluxos importantes

- **Transação alterada:** modifica o saldo livre calculado; reservas existentes permanecem.
- **Despesa fixa consultada:** atualiza ciclos vencidos e dispara lembretes próximos do vencimento.
- **Despesa fixa paga e vencida:** no próximo ciclo, volta para `isPaid = false`.
- **Dashboard consultado:** calcula tudo em tempo de execução a partir das transações.

---

## Observações para Evolução

- Como `userId` é usado como vínculo lógico, todo endpoint protegido deve filtrar por `userId`.
- O dashboard depende da consistência das datas das transações.
- A wishlist usa transações realizadas para calcular saldo financeiro e movimentos próprios para calcular reservas.
- O pagamento de despesas fixas cria transações vinculadas; pagamentos de faturas criam transações próprias e protegidas contra edição/exclusão genérica.

## Category e CategoryRule — entrega A

`Category` guarda `id`, `userId`, `type`, `encryptedName`, `color`, `icon`, `archived`, `createdAt` e `updatedAt`, com índice `[userId, type]`. Apenas categorias personalizadas são persistidas. O catálogo padrão é estático na API e mantém os códigos legados. Tipo é imutável e arquivamento é reversível.

`CategoryRule` guarda `id`, `userId`, `type`, `category`, `encryptedContains`, `priority`, `enabled`, `createdAt` e `updatedAt`, com índice `[userId, type, enabled, priority, id]`. `category` aceita código padrão ou ID personalizado. A ordenação é `priority ASC, id ASC`; regras desativadas ou com destino arquivado são ignoradas.

Nomes de categorias e trechos de regras usam o mesmo AES-256-GCM de `FinancialDataEncryptionService`. A chave `FINANCIAL_DATA_ENCRYPTION_KEY` deve ser preservada em backups e deploys. Cor, ícone, tipo, prioridade, vínculos e estado são metadados operacionais. A descrição de exemplo é transitória e não é persistida. O campo de categoria das transações continua criptografado; nenhum registro legado é reescrito.

### Atualização do banco e publicação

1. Fazer backup do MongoDB e preservar a chave de criptografia; verificar a restauração no processo operacional de deploy.
2. Gerar o client com `npx prisma generate` e sincronizar as novas coleções/índices com `npx prisma db push` no ambiente de destino. MongoDB não usa Prisma Migrate. Conferir o diff e não aceitar remoções de dados.
3. Publicar a API e verificar catálogo, isolamento e uso de categoria personalizada; publicar o frontend em seguida.
4. Não é necessário backfill de transações. Em rollback, preservar as duas coleções e manter uma API capaz de ler IDs personalizados já usados; clientes antigos não oferecem essas categorias nos seletores.

A implementação local não executa `db push` nem modifica dados de produção automaticamente.

## TransactionImport e TransactionImportResult — entrega B (backend)

`TransactionImport` contém `id`, `userId`, `encryptedData` opcional, `expiresAt`, `rowCount`, `revision`, `createdAt` e `updatedAt`. Índices: `[userId, id]` e `[expiresAt]`. O payload é um único envelope AES-256-GCM com origem e registros normalizados; o arquivo bruto nunca é persistido. A prévia dura 24 horas. Descarte manual ou limpeza de expirados tornam `encryptedData` nulo; o cabeçalho operacional permanece. `revision` é incrementado na transação de cada resultado para serializar gravações com cancelamento e expiração.

`TransactionImportResult` contém `id`, `batchId`, `userId`, `rowId`, `status`, `reason`, `transactionId` e `updatedAt`. Índice **único** `[userId, batchId, rowId]`, além de `[userId, batchId]`. Estados persistidos: `IMPORTED`, `IGNORED`, `REJECTED`. `PENDING` é resposta derivada para linhas sem resultado ou com falha transitória. Motivos são códigos fixos, sem descrição/valor/origem em texto aberto. Cada gravação de transação e recibo usa uma única transação MongoDB; recibos importados são definitivos e sobrevivem à exclusão da transação, impedindo recriação pelo mesmo lote/linha.

`Transaction.encryptedImportIdentity` é opcional, não retornado pelo mapper público. Contém `{ source, externalId }`, criptografado com a chave financeira, permitindo buscar correspondências após a prévia expirar. Transações antigas e manuais não precisam desse campo. Edição genérica preserva-o.

### Atualização e recuperação da entrega B

1. Preservar backup e chave financeira. Revisar `schema.prisma`; mudanças são aditivas, sem conversão de registros existentes.
2. Executar `npx prisma generate` e, no destino correto, `npx prisma db push`. MongoDB precisa de replica set (Atlas é compatível). Confirmar o índice único dos recibos antes de atender confirmações.
3. Publicar a API e verificar prévia sem gravação, confirmação repetida, consulta de resultado e limpeza de expirados; publicar frontend depois da API.
4. Em rollback, desativar rotas de importação e preservar as duas coleções, recibos, transações e chave. Não apagar recibos para repetir lotes. Clientes anteriores continuam lendo transações pelo mapper existente. Se a versão anterior da API não executa limpeza, o descarte de payloads expirados precisa ser mantido operacionalmente.

Nesta entrega, `db push` é executado pelos testes apenas em banco local descartável, com nome aleatório. Nenhum schema de desenvolvimento existente ou produção é sincronizado automaticamente. Detalhes de retenção, limitações e retomada em [Importação de extratos](transaction-imports.md).


## Entrega C — RecurringIncome e CalendarReceipt

`RecurringIncome`: ObjectId, userId, encryptedData (revisões de descrição/valor/categoria/data inicial/periodicidade/pausa/vigência), revision e timestamps. `CalendarReceipt`: ObjectId, userId, sourceId, dueDate civil, periodKey (`MONTHLY:YYYY-MM` ou `YEARLY:YYYY`), type, transactionId e snapshot encryptedData. Unicidade por usuário/origem/período e por usuário/origem/data; índice por usuário/transação.

`FixedExpense.recurrenceDay` é opcional e mantém a âncora do dia de vencimento. Recibos de pagamento preservam ciclos realizados após o avanço. Histórico já sobrescrito pela versão anterior não é inferido. Transações novas mantêm o esquema de criptografia existente. Veja [calendário financeiro](financial-calendar.md) para implantação e recuperação.

## Cartões de crédito — v2.2.0

`CreditCard` guarda `userId`, dias de fechamento/vencimento, revisão para concorrência e payload criptografado com nome, limite e anuidade. `CardPurchase` guarda cartão, data civil e payload criptografado com descrição, valor, categoria e número de parcelas. `CardInstallment` vincula compra e cartão à parcela, competência e vencimento, com valor criptografado; o índice único por usuário/compra/número impede parcela repetida.

`CardPayment` registra usuário, cartão, competência, IDs das transações realizadas e valor/data criptografados. O índice único `(userId, cardId, cycle)` protege a quitação idempotente. Compras não criam `Transaction`; a quitação da fatura cria as despesas vinculadas em operação atômica. Consulte [Cartões de crédito](credit-cards.md) para cálculo do ciclo, limite, calendário e implantação.
