# Rotas da API

Base local: `http://localhost:3001`

Rotas protegidas exigem:

```http
Authorization: Bearer <accessToken>
```

Datas devem ser enviadas como string válida, preferencialmente `YYYY-MM-DD`.

---

## Auth

### `POST /auth`

Faz login e retorna o token JWT.

Entrada:

```json
{
  "email": "user@email.com",
  "password": "12345678"
}
```

Resposta:

```json
{
  "accessToken": "jwt.token.aqui"
}
```

---

## User

### `POST /user`

Cria um usuário.

Entrada:

```json
{
  "name": "Lucas Lopes",
  "email": "lucas@email.com",
  "password": "12345678"
}
```

Resposta:

```json
{
  "message": "Usuário criado com sucesso",
  "user": {
    "id": "64f000000000000000000001",
    "name": "Lucas Lopes",
    "email": "lucas@email.com",
    "createdAt": "2026-07-06T12:00:00.000Z"
  }
}
```

### `GET /user/get-one`

Protegida. Retorna o usuário autenticado.

Entrada: não possui body.

Resposta:

```json
{
  "id": "64f000000000000000000001",
  "name": "Lucas Lopes",
  "email": "lucas@email.com",
  "createdAt": "2026-07-06T12:00:00.000Z"
}
```

### `PATCH /user/update`

Protegida. Atualiza nome e/ou senha.

Entrada:

```json
{
  "name": "Lucas Atualizado",
  "password": "novaSenha123"
}
```

Resposta:

```json
{
  "message": "Usuário atualizado com sucesso",
  "user": {
    "id": "64f000000000000000000001",
    "name": "Lucas Atualizado",
    "email": "lucas@email.com"
  }
}
```

---

## Transactions

Todas as rotas de transações são protegidas.

Categorias de `INCOME`: `SALARY`, `FREELANCE`, `INVESTMENTS`, `GIFTS_RECEIVED`, `REFUNDS`, `OTHER_INCOME`.

Categorias de `EXPENSE`: `FOOD`, `TRANSPORT`, `ENTERTAINMENT`, `UTILITIES`, `HEALTH`, `EDUCATION`, `SHOPPING`, `SUBSCRIPTIONS`, `HOUSING`, `TRAVEL`, `PETS`, `TAXES`, `INSURANCE`, `PERSONAL_CARE`, `DEBT_PAYMENT`, `OTHER`.

### `POST /transactions`

Cria uma transação.

Entrada:

```json
{
  "type": "EXPENSE",
  "value": 120.5,
  "date": "2026-07-06",
  "category": "FOOD",
  "description": "Mercado"
}
```

Resposta:

```json
{
  "id": "64f000000000000000000010",
  "value": 120.5,
  "date": "2026-07-06T00:00:00.000Z",
  "category": "FOOD",
  "description": "Mercado",
  "type": "EXPENSE",
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:00:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `GET /transactions`

Lista as transações do usuário com paginação.

Query params opcionais:

- `page`: página solicitada (inteiro positivo; padrão: `1`).
- `limit`: quantidade de itens por página (inteiro positivo; padrão: `20`).

Resposta:

```json
{
  "data": [
    {
      "id": "64f000000000000000000010",
      "value": 120.5,
      "date": "2026-07-06T00:00:00.000Z",
      "category": "FOOD",
      "description": "Mercado",
      "type": "EXPENSE",
      "createdAt": "2026-07-06T12:00:00.000Z",
      "updatedAt": "2026-07-06T12:00:00.000Z",
      "userId": "64f000000000000000000001"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 248,
    "totalPages": 13
  }
}
```

### `GET /transactions/:id`

Busca uma transação pelo id.

Entrada: não possui body.

Resposta:

```json
{
  "id": "64f000000000000000000010",
  "value": 120.5,
  "date": "2026-07-06T00:00:00.000Z",
  "category": "FOOD",
  "description": "Mercado",
  "type": "EXPENSE",
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:00:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `PATCH /transactions/:id`

Atualiza uma transação. O campo `type` é obrigatório para validar a categoria correta.

Entrada:

```json
{
  "type": "EXPENSE",
  "value": 150,
  "date": "2026-07-06",
  "category": "FOOD",
  "description": "Mercado atualizado"
}
```

Resposta:

```json
{
  "id": "64f000000000000000000010",
  "value": 150,
  "date": "2026-07-06T00:00:00.000Z",
  "category": "FOOD",
  "description": "Mercado atualizado",
  "type": "EXPENSE",
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:10:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `DELETE /transactions/:id`

Remove uma transação.

Entrada: não possui body.

Resposta:

```json
{
  "message": "Deletado com sucesso!"
}
```

---

## Wishlist

Todas as rotas de wishlist são protegidas.

### `POST /wishlist`

Cria um item na wishlist.

Entrada:

```json
{
  "name": "Notebook",
  "desiredValue": 5000,
  "savedAmount": 0,
  "targetDate": "2026-12-31"
}
```

Resposta:

```json
{
  "id": "64f000000000000000000020",
  "name": "Notebook",
  "desiredValue": 5000,
  "savedAmount": 1200,
  "targetDate": "2026-12-31T00:00:00.000Z",
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:00:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `GET /wishlist`

Lista os itens da wishlist.

Entrada: não possui body.

Resposta:

```json
[
  {
    "id": "64f000000000000000000020",
    "name": "Notebook",
    "desiredValue": 5000,
    "savedAmount": 1200,
    "targetDate": "2026-12-31T00:00:00.000Z",
    "createdAt": "2026-07-06T12:00:00.000Z",
    "updatedAt": "2026-07-06T12:00:00.000Z",
    "userId": "64f000000000000000000001"
  }
]
```

### `GET /wishlist/:id`

Busca um item da wishlist.

Entrada: não possui body.

Resposta:

```json
{
  "id": "64f000000000000000000020",
  "name": "Notebook",
  "desiredValue": 5000,
  "savedAmount": 1200,
  "targetDate": "2026-12-31T00:00:00.000Z",
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:00:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `PATCH /wishlist/:id`

Atualiza um item da wishlist.

Entrada:

```json
{
  "name": "Notebook novo",
  "desiredValue": 6000,
  "targetDate": "2027-01-31"
}
```

Resposta:

```json
{
  "id": "64f000000000000000000020",
  "name": "Notebook novo",
  "desiredValue": 6000,
  "savedAmount": 1200,
  "targetDate": "2027-01-31T00:00:00.000Z",
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:10:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `DELETE /wishlist/:id`

Remove um item da wishlist.

Entrada: não possui body.

Resposta:

```json
{
  "id": "64f000000000000000000020",
  "name": "Notebook novo",
  "desiredValue": 6000,
  "savedAmount": 1200,
  "targetDate": "2027-01-31T00:00:00.000Z",
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:10:00.000Z",
  "userId": "64f000000000000000000001"
}
```

---

## Fixed Expenses

Todas as rotas de despesas fixas são protegidas.

Categorias aceitas: `UTILITIES`, `SUBSCRIPTIONS`, `HOUSING`.

Recorrências aceitas: `MONTHLY`, `YEARLY`.

### `POST /fixed-expenses`

Cria uma despesa fixa.

Entrada:

```json
{
  "name": "Aluguel",
  "amount": 1800,
  "category": "HOUSING",
  "dueDate": "2026-08-10",
  "recurrence": "MONTHLY"
}
```

Resposta:

```json
{
  "id": "64f000000000000000000030",
  "name": "Aluguel",
  "amount": 1800,
  "category": "HOUSING",
  "dueDate": "2026-08-10T00:00:00.000Z",
  "isPaid": false,
  "paidAt": null,
  "paidTransactionId": null,
  "recurrence": "MONTHLY",
  "lastNotificationDueDate": null,
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:00:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `GET /fixed-expenses`

Lista as despesas fixas.

Entrada: não possui body.

Resposta:

```json
[
  {
    "id": "64f000000000000000000030",
    "name": "Aluguel",
    "amount": 1800,
    "category": "HOUSING",
    "dueDate": "2026-08-10T00:00:00.000Z",
    "isPaid": false,
    "paidAt": null,
    "paidTransactionId": null,
    "recurrence": "MONTHLY",
    "lastNotificationDueDate": null,
    "createdAt": "2026-07-06T12:00:00.000Z",
    "updatedAt": "2026-07-06T12:00:00.000Z",
    "userId": "64f000000000000000000001"
  }
]
```

### `GET /fixed-expenses/:id`

Busca uma despesa fixa.

Entrada: não possui body.

Resposta:

```json
{
  "id": "64f000000000000000000030",
  "name": "Aluguel",
  "amount": 1800,
  "category": "HOUSING",
  "dueDate": "2026-08-10T00:00:00.000Z",
  "isPaid": false,
  "paidAt": null,
  "paidTransactionId": null,
  "recurrence": "MONTHLY",
  "lastNotificationDueDate": null,
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:00:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `PATCH /fixed-expenses/:id`

Atualiza uma despesa fixa.

Entrada:

```json
{
  "name": "Aluguel reajustado",
  "amount": 1900,
  "category": "HOUSING",
  "dueDate": "2026-08-10",
  "recurrence": "MONTHLY"
}
```

Resposta:

```json
{
  "id": "64f000000000000000000030",
  "name": "Aluguel reajustado",
  "amount": 1900,
  "category": "HOUSING",
  "dueDate": "2026-08-10T00:00:00.000Z",
  "isPaid": false,
  "paidAt": null,
  "paidTransactionId": null,
  "recurrence": "MONTHLY",
  "lastNotificationDueDate": null,
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:10:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `PATCH /fixed-expenses/:id/payment`

Marca ou desmarca uma despesa fixa como paga.

Entrada:

```json
{
  "isPaid": true
}
```

Resposta:

```json
{
  "id": "64f000000000000000000030",
  "name": "Aluguel reajustado",
  "amount": 1900,
  "category": "HOUSING",
  "dueDate": "2026-08-10T00:00:00.000Z",
  "isPaid": true,
  "paidAt": "2026-07-06T12:15:00.000Z",
  "paidTransactionId": "64f000000000000000000010",
  "recurrence": "MONTHLY",
  "lastNotificationDueDate": null,
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:15:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `DELETE /fixed-expenses/:id`

Remove uma despesa fixa.

Entrada: não possui body.

Resposta:

```json
{
  "id": "64f000000000000000000030",
  "name": "Aluguel reajustado",
  "amount": 1900,
  "category": "HOUSING",
  "dueDate": "2026-08-10T00:00:00.000Z",
  "isPaid": true,
  "paidAt": "2026-07-06T12:15:00.000Z",
  "paidTransactionId": "64f000000000000000000010",
  "recurrence": "MONTHLY",
  "lastNotificationDueDate": null,
  "createdAt": "2026-07-06T12:00:00.000Z",
  "updatedAt": "2026-07-06T12:15:00.000Z",
  "userId": "64f000000000000000000001"
}
```

---

## Notifications

Todas as rotas de notificações são protegidas.

Tipos aceitos: `ALERT`, `REMINDER`, `INFO`.

### `POST /notifications`

Cria uma notificação para o usuário autenticado. O `userId` enviado no body é sobrescrito pelo usuário do token.

Entrada:

```json
{
  "title": "Conta próxima do vencimento",
  "message": "A despesa Aluguel vence em breve.",
  "type": "REMINDER",
  "userId": "64f000000000000000000001"
}
```

Resposta:

```json
{
  "id": "64f000000000000000000040",
  "title": "Conta próxima do vencimento",
  "message": "A despesa Aluguel vence em breve.",
  "type": "REMINDER",
  "read": false,
  "createdAt": "2026-07-06T12:00:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `GET /notifications`

Lista as notificações do usuário.

Entrada: não possui body.

Resposta:

```json
[
  {
    "id": "64f000000000000000000040",
    "title": "Conta próxima do vencimento",
    "message": "A despesa Aluguel vence em breve.",
    "type": "REMINDER",
    "read": false,
    "createdAt": "2026-07-06T12:00:00.000Z",
    "userId": "64f000000000000000000001"
  }
]
```

### `PATCH /notifications/:id/mark-as-read`

Marca uma notificação como lida.

Entrada:

```json
{
  "read": true
}
```

Resposta:

```json
{
  "id": "64f000000000000000000040",
  "title": "Conta próxima do vencimento",
  "message": "A despesa Aluguel vence em breve.",
  "type": "REMINDER",
  "read": true,
  "createdAt": "2026-07-06T12:00:00.000Z",
  "userId": "64f000000000000000000001"
}
```

### `DELETE /notifications/:id`

Remove uma notificação.

Entrada: não possui body.

Resposta:

```json
{
  "id": "64f000000000000000000040",
  "title": "Conta próxima do vencimento",
  "message": "A despesa Aluguel vence em breve.",
  "type": "REMINDER",
  "read": true,
  "createdAt": "2026-07-06T12:00:00.000Z",
  "userId": "64f000000000000000000001"
}
```

---

## Dashboard

Todas as rotas de dashboard são protegidas.

### `GET /dashboard?startDate=2026-07-01&endDate=2026-07-31`

Retorna o resumo financeiro do período.

Entrada via query params:

```json
{
  "startDate": "2026-07-01",
  "endDate": "2026-07-31"
}
```

Resposta:

```json
{
  "balance": 2500,
  "totalIncomes": 5000,
  "totalExpenses": 2500,
  "economyRate": 50,
  "highestSpendingCategory": {
    "category": "HOUSING",
    "total": 1800
  },
  "period": {
    "start": "2026-07-01T00:00:00.000Z",
    "end": "2026-07-31T00:00:00.000Z"
  }
}
```

### `GET /dashboard/monthly-comparison?startDate=2026-01-01&endDate=2026-07-31`

Retorna o comparativo mensal do período.

Entrada via query params:

```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-07-31"
}
```

Resposta:

```json
{
  "months": [
    {
      "month": "2026-07",
      "totalExpenses": 2500,
      "totalIncomes": 5000,
      "balance": 2500,
      "economyRate": 50,
      "percentageChange": 12.5
    }
  ],
  "bestMonth": {
    "month": "2026-07",
    "balance": 2500,
    "economyRate": 50
  },
  "worstMonth": {
    "month": "2026-06",
    "balance": 1000,
    "economyRate": 20
  }
}
```
