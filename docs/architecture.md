# Organização da API

Cada domínio NestJS fica em `src/modules/<domínio>`:

- **Controller** recebe HTTP, aplica o guard e valida os parâmetros com Zod.
- **Service** executa regras de negócio, autorização contextual e composição de respostas.
- **Repository** concentra consultas e mutações Prisma. Os métodos novos incluem `userId` nas operações sobre dados do usuário; alguns fluxos legados de despesas fixas validam a propriedade no serviço antes da mutação.
- **Model** descreve resultados de domínio, como `MonthlyBudgetSummaryModel` e `ForecastModel`. DTOs descrevem entradas HTTP.

As transações mantêm os campos sensíveis criptografados. O mapper existente converte entre o registro persistido e os dados usados pelas regras; `TransactionsRepository` consulta apenas os índices operacionais. Busca global, orçamento e exportação descriptografam no servidor após ler lotes de candidatos. A wishlist mantém o cálculo anual existente.

Despesas fixas já possuíam repositório e serviços especializados. O pagamento usa `FixedExpensePaymentsRepository` para manter criação/remoção da transação vinculada e atualização da despesa na mesma transação do MongoDB. `FixedExpenseRawFieldsService` permanece como adaptador para os campos legados manipulados por comandos raw.

Este refactor não altera coleções, documentos, índices, rotas ou formato de resposta. O schema novo de orçamento e formato de exportação pertence à implementação funcional descrita em `implementation-plan.md`; sua sincronização em produção exige o backup previsto naquele plano.
