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

### `GET /transactions/search`

Busca global por transações do usuário, em ordem de `dateIndex` e `id` decrescente. Rota separada; `GET /transactions` permanece igual.

Query params opcionais: `cursor` (retornado na página anterior), `limit` (padrão `20`, máximo `100`), `startDate` e `endDate` (`YYYY-MM-DD`, inclusivas), `type` (`INCOME` ou `EXPENSE`), `category` (uma das categorias de transação) e `search` (texto de 1 a 100 caracteres, busca sem diferenciar maiúsculas em descrição ou categoria). Datas devem formar um intervalo válido. Categoria e texto são filtrados no servidor após descriptografia em lotes. Um cursor só pode ser reutilizado com os mesmos filtros e usuário.

Resposta:

```json
{
  "data": [{ "id": "64f000000000000000000010", "value": 120.5, "date": "2026-07-06T00:00:00.000Z", "category": "FOOD", "description": "Mercado", "type": "EXPENSE", "createdAt": "2026-07-06T12:00:00.000Z", "updatedAt": "2026-07-06T12:00:00.000Z", "userId": "64f000000000000000000001" }],
  "nextCursor": "eyJ2IjoxLC4uLn0",
  "hasMore": true
}
```

Na última página, `nextCursor` é `null` e `hasMore` é `false`. Não há total exato. A ordenação é estável para registros sem alterações; mudanças nas transações entre requisições podem alterar o conjunto percorrido.

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

## Budgets

Todas as rotas de orçamento são protegidas e isoladas por usuário. `monthKey` e o parâmetro `month` seguem `YYYY-MM`; `category` deve ser uma categoria de despesa e `limitAmount` deve ser positivo.

- `GET /budgets?month=2026-07`: lista os orçamentos cadastrados no mês, ordenados por categoria.
- `POST /budgets`: cria orçamento com `{ "monthKey": "2026-07", "category": "FOOD", "limitAmount": 800 }`. A combinação usuário, mês e categoria é única; duplicação retorna `409`.
- `PATCH /budgets/:id`: altera `monthKey`, `category` e/ou `limitAmount` com as mesmas validações; requer ao menos um campo.
- `DELETE /budgets/:id`: remove e retorna o orçamento removido.
- `GET /budgets/summary?month=2026-07`: retorna os orçamentos do mês com `spentAmount` e `remainingAmount` calculados na leitura. A resposta é `[]` quando não há orçamentos.

Exemplo de item no resumo:

```json
{ "id": "64f000000000000000000050", "userId": "64f000000000000000000001", "monthKey": "2026-07", "category": "FOOD", "limitAmount": 800, "createdAt": "2026-07-01T00:00:00.000Z", "updatedAt": "2026-07-01T00:00:00.000Z", "spentAmount": 650, "remainingAmount": 150 }
```

O gasto inclui apenas transações `EXPENSE` do mês, identificadas por `dateIndex`; a categoria é avaliada após descriptografia. Atualizar uma transação altera o próximo resumo sem atualização persistida do orçamento.

---

## Exports

Todas as rotas de exportação são protegidas. O armazenamento é local e efêmero: arquivos podem desaparecer após reinicialização ou deploy.

- `POST /exports/transactions`: aceita filtros opcionais `startDate`, `endDate`, `categoryId`, `type` e `format` (`PDF` ou `CSV`; padrão `PDF`). Retorna `202` com `id`, `status`, `progress` e `format`.
- `GET /exports/status`: retorna o job mais recente do usuário, incluindo `format`, progresso, datas e eventual mensagem de erro.
- `GET /exports/:id/download`: baixa o arquivo concluído do usuário com `application/pdf` ou `text/csv; charset=utf-8`, conforme o formato persistido. Retorna `404` se o arquivo não existir mais.

CSV usa UTF-8 com BOM, cabeçalho `id,date,type,category,description,value`, datas ISO e números sem formatação localizada. Aspas, vírgulas e quebras de linha nos campos são escapadas. Os mesmos filtros e a leitura em lotes do PDF se aplicam ao CSV.

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

### `PATCH /notifications/mark-all-as-read`

Marca como lidas apenas as notificações ainda não lidas do usuário autenticado. Não recebe body. Retorna `{ "count": 3 }` com a quantidade alterada; chamadas repetidas retornam `{ "count": 0 }`.

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

### `GET /dashboard/forecast`

Projeta o fechamento do mês UTC atual. `currentBalance` é o saldo real das transações do primeiro dia do mês até hoje; `pendingFixedExpenses` soma despesas fixas do usuário ainda não pagas com vencimento anterior ao primeiro dia do mês seguinte, inclusive vencidas de meses anteriores. Despesas pagas não são descontadas novamente. A rota não cria transações.

```json
{
  "month": "2026-07",
  "currentBalance": 2500,
  "pendingFixedExpenses": 800,
  "projectedBalance": 1700,
  "expenses": [{ "id": "64f000000000000000000030", "name": "Aluguel", "amount": 800, "dueDate": "2026-07-10T00:00:00.000Z" }]
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
