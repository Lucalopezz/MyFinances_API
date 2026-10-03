# Organização da API

Consulte o [índice da documentação](README.md) para contratos e guias de domínio.

Cada domínio NestJS fica em `src/modules/<domínio>`:

- **Controller** recebe HTTP, aplica o guard e valida os parâmetros com Zod.
- **Service** executa regras de negócio, autorização contextual e composição de respostas.
- **Repository** concentra consultas e mutações Prisma. Os métodos novos incluem `userId` nas operações sobre dados do usuário; alguns fluxos legados de despesas fixas validam a propriedade no serviço antes da mutação.
- **Model** descreve resultados de domínio, como `MonthlyBudgetSummaryModel` e `ForecastModel`. DTOs descrevem entradas HTTP.

As transações mantêm os campos sensíveis criptografados. O mapper existente converte entre o registro persistido e os dados usados pelas regras; `TransactionsRepository` consulta apenas os índices operacionais. Busca global, orçamento e exportação descriptografam no servidor após ler lotes de candidatos. A wishlist calcula reservas individuais pelos movimentos; o progresso anual anterior permanece somente como referência de migração.

Despesas fixas já possuíam repositório e serviços especializados. O pagamento usa `FixedExpensePaymentsRepository` para manter criação/remoção da transação vinculada e atualização da despesa na mesma transação do MongoDB. `FixedExpenseRawFieldsService` permanece como adaptador para os campos legados manipulados por comandos raw.

O schema dos domínios inclui as coleções e os índices necessários às funcionalidades atuais. A sincronização no ambiente de destino exige backup, `prisma generate` e `prisma db push` antes de ativar o frontend. Consulte [reservas da wishlist](wishlist-reservations.md), [calendário](financial-calendar.md), [importação](transaction-imports.md) e [cartões](credit-cards.md).

## Importação de extratos

`ImportsModule` expõe `/transaction-imports`. O parser local interpreta apenas os formatos documentados em [Importação de extratos](transaction-imports.md), com limites explícitos de bytes e registros. `ImportsService` resolve categorias em lote, percorre o histórico criptografado em páginas e compõe prévia/resultado. `ImportsRepository` grava cada transação e recibo atomicamente, usando um índice único por usuário/lote/linha. O domínio usa duas coleções e metadados de origem criptografados na transação; requer sincronização aditiva do schema antes da publicação.

Prévia e confirmação são distintas. O arquivo bruto não é persistido; dados normalizados ficam criptografados por até 24h de disponibilidade. Um ciclo de limpeza na inicialização e a cada minuto apaga payloads expirados. Metadados e recibos permanecem para consulta e idempotência. O fluxo usa o mapper de transações; importações não alteram reservas da wishlist nem lançamentos antigos pela aplicação de regras.

## Cartões de crédito

`CardsModule` concentra cadastro, compras, parcelas e pagamento de faturas. Compras comprometem limite, sem criar `Transaction`; o pagamento de uma fatura fechada cria as despesas e um recibo único na mesma operação MongoDB. O calendário incorpora faturas pendentes como previsões. O contrato e os limites estão em [Cartões de crédito](credit-cards.md).
