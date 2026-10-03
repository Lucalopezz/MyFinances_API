# Rotas da API

Base local: `http://localhost:3001`

Rotas protegidas exigem:

```http
Authorization: Bearer <accessToken>
```

Datas devem ser enviadas como string válida, preferencialmente `YYYY-MM-DD`.

---

## Health

`GET /health` é público e retorna `{ "status": "ok" }`. Não recebe body nem
credenciais e não consulta dados financeiros. É um sinal de disponibilidade
do processo, usado pela landing para iniciar o backend antes do login.

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

### `GET /transactions/summary`

Protegida e isolada pelo usuário. Exige `startDate` e `endDate` válidos e
inclusivos (`YYYY-MM-DD`); aceita `type`, `category` e `search`, com a mesma
semântica da busca. Retorna `{ totalIncome, totalExpense, balance, count }` para
todos os resultados do período. Percorre lotes de até 100 registros por cursor
indexado, soma em centavos e não transfere o histórico completo ao frontend.

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

## Wishlist — metas e compras (entregas D e E)

Implantação, migração e recuperação: [wishlist-reservations.md](wishlist-reservations.md).

Todas as rotas exigem autenticação e isolam dados pelo usuário. Valores monetários usam BRL em duas casas decimais; datas de entrada usam `YYYY-MM-DD` em UTC. `targetDate` é opcional (`null`).

- `POST /wishlist`: `{ name, desiredValue, targetDate? }` cria meta ativa com reserva zero. `savedAmount` enviado pelo cliente é ignorado/rejeitado pela validação.
- `GET /wishlist`: lista metas ativas e concluídas, mais movimentos. `GET /wishlist/:id` retorna uma meta.
- `GET /wishlist/summary`: `{ financialBalance, totalReserved, freeBalance, insufficient }`. Saldo financeiro soma transações realizadas; saldo livre = financeiro − reservas ativas. `insufficient` sinaliza despesas posteriores que consumiram o saldo livre sem apagar reservas.
- `PATCH /wishlist/:id`: altera `name`, `desiredValue` e/ou `targetDate` de meta ativa. Não altera reservas.
- `POST /wishlist/:id/movements`: `{ kind: "DEPOSIT" | "WITHDRAWAL", value, date, note? }`. Aporte exige saldo livre suficiente entre todas as metas; retirada não pode exceder a reserva da meta. Não cria transação. Valor e observação são criptografados.
- `POST /wishlist/settle-migration`: marca a distribuição inicial como concluída após o usuário decidir seus aportes. Nenhum valor antigo é convertido automaticamente.
- `POST /wishlist/:id/complete`: `{ value, date, category, description }`. Cria uma única despesa, consome até o valor pago da reserva e libera a sobra em operação atômica. Retorna `{ item, transaction, coveredAmount, releasedAmount, uncoveredAmount, alreadyCompleted }`. Repetir a conclusão retorna a compra original. `value` pode superar a reserva.
- `DELETE /wishlist/:id`: exclui apenas meta ativa e libera sua reserva sem criar despesa. Compra concluída permanece no histórico.

Cada meta retornada inclui `reservedAmount`, `remainingAmount`, `progressPercent`, `monthlySuggestion`, `deadlineState`, `legacySavedAmount`, `reservationMigrationState`, `status`, `completedAt`, `purchaseTransactionId` e `movements`. Um movimento inclui `id`, `kind`, `value`, `date`, `note` e `createdAt`. `kind` também pode ser `CONSUMPTION` ou `RELEASE` na conclusão. O saldo reservado é a soma dos aportes menos retiradas, consumo e liberação. A sugestão usa os meses civis de UTC, incluindo o mês atual e o mês do prazo, com divisão arredondada para cima em centavos. Meta alcançada, sem prazo ou vencida não recebe sugestão.

Registros antigos preservam `savedAmount` como `legacySavedAmount` e começam com `reservationMigrationState: "PENDING"`; a reserva real inicia em zero. Novos registros começam em `SETTLED`. A mudança de schema exige sincronização do Prisma com MongoDB antes de ativar o frontend. Transações vinculadas a compras concluídas não podem ser editadas ou excluídas pelas rotas genéricas.

## Fixed Expenses

Todas as rotas de despesas fixas são protegidas.

Categorias aceitas: todas as categorias ativas de despesa do catálogo (`GET /categories`), incluindo personalizadas. Os códigos anteriores continuam válidos.

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

## Categorias personalizadas e regras (entrega A)

Todas as rotas abaixo exigem Bearer JWT e usam exclusivamente o usuário autenticado.

| Método e rota | Entrada / resposta |
| --- | --- |
| `GET /categories` | Catálogo padrão + categorias do usuário, incluindo arquivadas. Array de `{ id, name, type, color, icon, archived, isDefault }`. |
| `POST /categories` | `{ name, type, color, icon }`; retorna a categoria criada. |
| `PATCH /categories/:id` | Campos opcionais `name`, `color`, `icon`, `archived`. Apenas categorias personalizadas do usuário. Tipo imutável; sem exclusão física. |
| `GET /category-rules` | Array de `{ id, type, contains, category, priority, enabled }`, ordenado por `priority` crescente e `id` crescente. |
| `POST /category-rules` | `{ type, contains, category, priority, enabled }`; retorna a regra criada. |
| `PATCH /category-rules/:id` | Atualização parcial dos mesmos campos, limitada ao proprietário. |
| `DELETE /category-rules/:id` | Remove apenas a regra do usuário. |
| `POST /category-rules/test` | Campos completos da regra + `description`; retorna `{ matches, category }`, sem salvar. O teste verifica o trecho independentemente de `enabled`; não compara com outras regras. |
| `POST /categories/resolve` | `{ type, description, category? }`; retorna `{ category, ruleId, source }`. `source` é `manual`, `rule` ou `null`. Sem correspondência, os três valores são `null`. Não cria transação. |

`name`: 1–60 caracteres após trim. `color`: hexadecimal `#RRGGBB`. `type`: `INCOME` ou `EXPENSE`. `icon`: `Briefcase`, `Car`, `CircleDollarSign`, `CircleHelp`, `CreditCard`, `Dog`, `Film`, `Gift`, `GraduationCap`, `HandCoins`, `Heart`, `Home`, `Landmark`, `Plane`, `Receipt`, `Scissors`, `Shield`, `ShoppingBag`, `TrendingUp`, `Utensils` ou `Tag`.

`contains`: 1–100 caracteres, não vazio após normalização. `priority`: inteiro de 0 a 9999 (menor primeiro). `enabled`: booleano. `description` nos endpoints de teste/resolução: até 2000 caracteres. Comparação literal por trecho, com normalização NFD, remoção de marcas de acento, trim e minúsculas em português. Não usa expressões regulares fornecidas pelo usuário.

Os códigos padrão (`FOOD`, `SALARY` etc.) permanecem válidos. Categorias personalizadas usam ObjectId hexadecimal de 24 caracteres como referência estável no campo `category`. Os DTOs validam o formato; os serviços validam existência, proprietário, tipo e estado. Categorias padrão são imutáveis. Renomear uma categoria mantém todas as referências; rótulos do histórico refletem o nome atual, sem recategorizar transações.

Arquivamento impede novos lançamentos, novas associações de orçamento/despesa fixa e novos pagamentos com essa categoria. Edições de transações e despesas fixas podem manter a mesma categoria arquivada; em orçamento, também é necessário manter o mês. Para pagar uma despesa fixa arquivada, selecione uma categoria ativa ou restaure a anterior. Busca, relatórios e leituras preservam categorias arquivadas. Regras com destinos arquivados são ignoradas; é possível desativá-las, mas ativação requer destino ativo.

Uma categoria explícita em `/categories/resolve` prevalece sobre todas as regras e também é validada. `POST /transactions` continua exigindo categoria explícita: o formulário oferece a sugestão com “Usar sugestão”. Nenhuma regra altera histórico ou edições automaticamente. O mesmo resolvedor é usado na prévia e na confirmação da importação da entrega B.

Transações, busca por código/nome, despesas fixas, orçamentos, dashboard e comparativos aceitam as referências personalizadas. Exportações filtram pelo mesmo identificador em `categoryId`; PDF mostra o nome atual, CSV preserva a coluna `category` com código/ID estável e o cabeçalho existente.

Erros: `400` para categoria inexistente, de outro usuário, incompatível ou arquivada em novo uso; `404` para edição de categoria/regra não pertencente ao usuário; `401` sem autenticação. Respostas nunca incluem campos criptografados.


## Importação de extratos — entrega B

Rotas implementadas, protegidas por Bearer e isoladas por usuário:

| Método e rota | Contrato |
| --- | --- |
| `POST /transaction-imports/preview` | Multipart: `file` (até 2 MiB) e `options` (JSON, até 8 KiB). Retorna `201` com `batchId`, `expiresAt`, `rows`. Não cria transações. |
| `GET /transaction-imports/:id` | Retorna `batchId`, `expiresAt`, `expired`, `rows`, `results`, `summary`. Permite recuperar um lote após falha. |
| `POST /transaction-imports/:id/confirm` | JSON `{ rows: [{ rowId, selected, category?, allowDuplicate? }] }`. Retorna resultados por linha, resumo e `recalculationPending`. Repetir lote/linha não duplica transações. |
| `DELETE /transaction-imports/:id` | Descarta a prévia sem apagar transações já importadas. |

Opções CSV de exemplo:

```json
{ "format": "CSV", "encoding": "utf-8", "source": "banco:conta", "csv": { "delimiter": ";", "dateFormat": "DD/MM/YYYY", "decimalSeparator": ",", "header": true, "columns": { "date": 0, "description": 1, "value": 2 } } }
```

Opções OFX: `{ "format": "OFX", "encoding": "utf-8", "source": "banco:conta" }`. `source` é um nome estável de origem (banco/conta), repetido nos próximos extratos da mesma conta. Codificações: `utf-8` (padrão) e `windows-1252`. OFX aceita um extrato XML/SGML bancário ou de cartão em BRL. Limite: 1.000 registros; até 100 colunas no CSV. Prévia disponível por 24h, com dados criptografados e descarte automático do payload expirado.

CSV aceita delimitador vírgula, ponto e vírgula ou tabulação; datas `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`; decimal `,` ou `.`. Índices começam em zero. Em lugar de `value`, podem ser usadas `income` e `expense` (positivos, apenas um lado preenchido). Opcionais: `category` (código/ID), `externalId`, `type` (INCOME/EXPENSE, com `value`). Datas CSV não incluem horário. Aspas escapadas, acentos e campos multilinha são suportados.

Cada linha de prévia contém `rowId`, campos normalizados disponíveis (`date`, `description`, `value`, `type`, `externalId`), `category`, `categorySource`, `ruleId`, `errors`, `categoryError`, `duplicates` e `selected`. Categorias inválidas podem ser corrigidas; erros em data/valor/descrição exigem corrigir o arquivo. Categoria explícita prevalece sobre regras; sem correspondência usa `OTHER`/`OTHER_INCOME`. Duplicatas por origem/ID externo ou data/valor/tipo/descrição normalizada vêm desmarcadas. `duplicates` usa `{ kind: "FILE", rowId, reason }` ou `{ kind: "HISTORY", transactionId, reason }`, com motivo `EXTERNAL_ID`/`FINGERPRINT`.

Confirmação aceita até 1.000 decisões sem linhas repetidas. Dados financeiros não podem ser reescritos pelo navegador. Linhas omitidas são ignoradas; recibos já importados permanecem definitivos. Suspeitas exigem `allowDuplicate: true`. Para categoria em lote, envie a mesma referência nas decisões compatíveis. O servidor revalida antes de gravar.

Resultado: `results: [{ rowId, status, reason, transactionId }]`, `summary: { imported, ignored, rejected, pending }`, `recalculationPending`. Estados: `IMPORTED`, `IGNORED`, `REJECTED`, `PENDING`. Motivos: `NOT_SELECTED`, `DUPLICATE_REQUIRES_APPROVAL`, `INVALID_CATEGORY`, `INVALID_ROW`, `RETRY_REQUIRED`, `EXPIRED_OR_CANCELLED`, `NOT_PROCESSED`. Contagens são cumulativas do lote, não devem ser somadas a cada tentativa. Falhas parciais preservam linhas já importadas; repetir tenta pendências. `recalculationPending` é mantido por compatibilidade e retorna `false`; reservas não são recalculadas por importações.

Erros globais: `400` opções/layout/linhas inválidos; `401` sessão inválida; `404` lote inexistente ou alheio; `410` confirmação expirada/cancelada; `413` tamanho excedido. Depois da expiração, GET retorna `rows: []` e preserva recibos. Idempotência é por lote/linha; reenvio do arquivo cria outro lote com sugestões de duplicatas. Confirmações simultâneas de lotes distintos não têm restrição única global.

Formatos, exemplos, segurança e publicação: [Importação de extratos](transaction-imports.md).


## Calendário financeiro e receitas recorrentes (entrega C)

Implementado: `GET /calendar?month=YYYY-MM`, `GET /calendar/incomes`, `POST /calendar/incomes`, `PATCH /calendar/incomes/:id` e `POST /calendar/incomes/:id/occurrences/:date/confirm`. Todas as rotas exigem autenticação e isolamento por usuário. Não é criado lançamento por cadastrar ou consultar uma previsão.

Consulte [contrato completo, exemplos de campos, datas, projeção e implantação](financial-calendar.md). A API retorna agenda mensal, pendências anteriores e linha diária com saldo-base acumulado, impacto das pendências e primeiro dia negativo. Confirmações criam uma única transação criptografada por competência.

O endpoint legado `/dashboard/forecast` é mantido; o novo dashboard do frontend usa `/calendar`. Transações vinculadas a recibos não podem ser editadas/excluídas pelas rotas genéricas; pagamento de despesa pode ser desmarcado pelo fluxo específico.

## Cartões de crédito — v2.2.0

Todas as rotas exigem Bearer JWT e isolam dados pelo usuário autenticado.

| Método e rota | Contrato |
| --- | --- |
| `GET /cards` | Lista cartões com compras, faturas e limites total, em uso e disponível. |
| `POST /cards` | `{ name, limit, closingDay, dueDay, annualFee }`; cadastra cartão. |
| `GET /cards/:id` | Detalha cartão, compras e faturas por competência. |
| `DELETE /cards/:id` | Arquiva o cartão do usuário e retorna `{ message }`. Parcelas ou anuidades fechadas não quitadas retornam `400`; cartão ausente/de outro usuário retorna `404`. |
| `POST /cards/:id/purchases` | `{ description, amount, date, category, installments }`; cria compra e parcelas, sem criar transação realizada. |
| `POST /cards/:id/invoices/:cycle/pay` | `{ date }`; quita integralmente fatura fechada e cria as transações de despesa correspondentes. Repetição não duplica o pagamento. |

`date` usa `YYYY-MM-DD`, `cycle` usa `YYYY-MM`; a categoria da compra aceita categorias de despesa ativas. A compra compromete o limite total imediatamente. Faturas pendentes entram como previsão no calendário; após o pagamento, as despesas entram no saldo pela data efetiva. [Regras, limites e implantação](credit-cards.md).
