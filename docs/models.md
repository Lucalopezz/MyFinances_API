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
- `GET /transactions/:id`: busca uma transação específica do usuário.
- `PATCH /transactions/:id`: atualiza uma transação existente.
- `DELETE /transactions/:id`: remove uma transação.

### Regras de negócio

- A validação diferencia receitas e despesas usando `type`.
- As categorias permitidas mudam conforme o tipo da transação.
- Ao criar, atualizar ou remover uma transação, a aplicação recalcula a economia dos itens da wishlist.
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

## WishlistItem

Representa um objetivo financeiro do usuário, como um produto, viagem ou meta de compra.

### Campos

| Campo          | Tipo                  | Obrigatório | Descrição                                   |
| -------------- | --------------------- | ----------- | ------------------------------------------- |
| `id`           | `String @db.ObjectId` | Sim         | Identificador único do item.                |
| `name`         | `String`              | Sim         | Nome do objetivo.                           |
| `desiredValue` | `Float`               | Sim         | Valor desejado para atingir a meta.         |
| `savedAmount`  | `Float`               | Sim         | Valor economizado calculado pela aplicação. |
| `targetDate`   | `DateTime?`           | Não         | Data alvo para alcançar a meta.             |
| `createdAt`    | `DateTime`            | Sim         | Data de criação do item.                    |
| `updatedAt`    | `DateTime`            | Sim         | Data da última atualização.                 |
| `userId`       | `String @db.ObjectId` | Sim         | Dono do item.                               |

### Principais funções

- `POST /wishlist`: cria um item na wishlist.
- `GET /wishlist`: lista os itens do usuário.
- `GET /wishlist/:id`: busca um item específico.
- `PATCH /wishlist/:id`: atualiza um item.
- `DELETE /wishlist/:id`: remove um item.

### Regras de negócio

- O campo `savedAmount` é atualizado com base na economia anual calculada pelas transações.
- A economia anual considera transações do ano atual:

```ts
savedAmount = totalIncomeAnoAtual - totalExpensesAnoAtual;
```

- Sempre que uma transação é criada, atualizada ou excluída, os itens da wishlist são recalculados.

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
- `DELETE /notifications/:id`: remove uma notificação.

### Regras de negócio

- Notificações são sempre vinculadas a um usuário.
- O tipo `REMINDER` é usado automaticamente para avisos de despesas fixas próximas do vencimento.
- A marcação como lida altera apenas o campo `read`.

---

## Relacionamentos Lógicos

O schema atual não declara relações Prisma formais entre os modelos, mas a aplicação usa `userId` como relacionamento lógico entre o usuário e seus dados.

```plaintext
User
├── Transaction[]
├── WishlistItem[]
├── FixedExpense[]
└── Notification[]
```

### Fluxos importantes

- **Transação alterada:** recalcula a economia da wishlist.
- **Despesa fixa consultada:** atualiza ciclos vencidos e dispara lembretes próximos do vencimento.
- **Despesa fixa paga e vencida:** no próximo ciclo, volta para `isPaid = false`.
- **Dashboard consultado:** calcula tudo em tempo de execução a partir das transações.

---

## Observações para Evolução

- Como `userId` é usado como vínculo lógico, todo endpoint protegido deve filtrar por `userId`.
- O dashboard depende da consistência das datas das transações.
- A wishlist usa `createdAt` das transações para cálculo anual, enquanto o dashboard usa `date`.
- A v2 pode evoluir o modelo de despesas fixas para criar transações automaticamente quando uma despesa for marcada como paga.
