# Organização da API

Consulte o [índice da documentação](README.md) para contratos e guias de domínio.

## Limites e convenções

A API é um monólito modular. Cada funcionalidade pertence a um módulo NestJS em
`src/modules`; a organização interna acompanha as responsabilidades reais, sem
exigir uma camada ou interface para cada classe.

- **Controller** recebe HTTP, aplica o guard, valida parâmetros com Zod e delega a operação.
- **Service** coordena uma operação da aplicação, verifica propriedade dos dados e combina regras e persistência. Serviços especializados ficam em `services/`; módulos pequenos podem manter o serviço junto do controller.
- **Domain** reúne cálculos, invariantes e decisões em funções ou classes sem dependência de NestJS, Prisma, HTTP ou criptografia. Recebe dados descriptografados e, quando necessário, a data atual explicitamente.
- **Repository** concentra consultas, mutações, travas e transações Prisma. Decisões financeiras e coordenação de fluxos pertencem aos serviços e ao domínio.
- **Mapper** converte representações de persistência, criptografia e resposta. Cálculos financeiros pertencem ao domínio, mesmo quando aparecem na resposta.
- **DTO** descreve e valida entradas HTTP em `dto/`. Tipos internos e resultados ficam em `types/` ou `models/`, sem importar contratos HTTP para executar regras.
- **Testes** ficam próximos da responsabilidade testada. Cálculos usam testes unitários; atomicidade, idempotência e concorrência usam as integrações do domínio.

O tamanho de um arquivo é um sinal de revisão, não um limite arbitrário. Uma
extração deve ganhar um nome e uma responsabilidade claros. Não são necessárias
interfaces de repository, classes base genéricas ou um caso de uso por método.

## Organização e dependências

`src/app.module.ts` compõe a aplicação. Módulos de funcionalidade não importam o
`AppModule`. Prisma e criptografia ficam em `src/infrastructure`, com módulos que
registram e exportam uma única instância de seus providers. `common/` contém
recursos transversais pequenos, como pipes, guards e operações de data e dinheiro.

Cada provider tem um módulo proprietário. Outros módulos importam esse módulo e
consomem apenas seus providers públicos, em vez de registrar classes de outra
funcionalidade novamente. Consultas públicas entregam dados próprios para seus
consumidores e evitam espalhar detalhes de criptografia pelo sistema.

Os limites funcionais são:

- **Auth e users:** autenticação e gerenciamento do usuário são responsabilidades distintas.
- **Categories:** catálogo e regras de classificação permanecem juntos; regras podem ter seus próprios serviços, contratos e controller.
- **Transactions:** lançamentos e consultas realizadas. Importação e exportação são submódulos em `transactions/imports` e `transactions/exports`, com seus ciclos próprios. A hierarquia de pastas não exige que `TransactionsModule` importe esses submódulos.
- **Cards:** cadastro, compras, parcelas, faturas, pagamentos e estornos permanecem no mesmo módulo, divididos internamente por responsabilidade.
- **Fixed expenses:** recorrência e pagamento de despesas fixas, incluindo a coordenação de sua contratação no cartão.
- **Recurring incomes:** cadastro, revisões e confirmação de receitas recorrentes. Calendário consome essas informações.
- **Wishlist e budgets:** reservas por meta e limites mensais por categoria possuem operações e regras distintas.
- **Calendar:** compõe a agenda e a projeção usando receitas recorrentes, despesas fixas, faturas e transações realizadas.
- **Dashboard:** compõe indicadores e comparativos, reutilizando consultas financeiras e a projeção do calendário.
- **Notifications:** histórico, recibos e sincronização de avisos. A integração com despesas fixas tem um único proprietário e não duplica providers dos dois módulos.

Novas extrações preservam os endpoints, os formatos das respostas e o schema do
banco. Renomear uma pasta não altera uma rota pública nem exige migrar dados.

## Estrutura de referência

```text
src/
├── app.module.ts
├── main.ts
├── common/                 # HTTP, datas, dinheiro e normalização textual
├── infrastructure/
│   ├── prisma/
│   └── encryption/
└── modules/
    ├── auth/
    ├── users/
    ├── categories/
    │   └── rules/
    ├── transactions/
    │   ├── imports/
    │   └── exports/
    ├── cards/
    ├── fixed-expenses/
    ├── recurring-incomes/
    ├── wishlist/
    ├── budgets/
    ├── calendar/
    ├── dashboard/
    └── notifications/
```

Os módulos mais extensos usam `services/`, `domain/`, `repositories/`,
`mappers/`, `types/` e `dto/`. Não é preciso criar pastas vazias em módulos
menores. Controllers e composição do módulo permanecem na raiz da funcionalidade.

## Invariantes das operações financeiras

Valores são calculados em centavos, preservando os arredondamentos atuais e o
rateio do restante das parcelas. Datas civis respeitam o fuso
`America/Sao_Paulo`; conversões para UTC são explícitas. Chaves já normalizadas
em UTC, incluindo o cálculo legado de prazo da wishlist, preservam o contrato
existente. Helpers compartilhados
não devem depender de um módulo de funcionalidade.

Toda consulta ou mutação de dados pessoais inclui `userId` ou valida sua
propriedade no mesmo fluxo. Uma operação que grava um lançamento e seu recibo,
pagamento ou consumo de reserva continua atômica. Ao atravessar serviços ou
repositories, o fluxo reutiliza o mesmo contexto transacional; extrair arquivos
não pode criar commits independentes. Revisões, índices únicos, retentativas e
recibos duráveis preservam concorrência e idempotência.

Consultas e exportações em lotes mantêm seus limites de memória e a filtragem
após descriptografia. Avisos auxiliares não transformam um pagamento confirmado
em falha financeira. A refatoração não muda essas garantias.

As transações mantêm os campos sensíveis criptografados. O mapper existente converte entre o registro persistido e os dados usados pelas regras; `TransactionsRepository` consulta apenas os índices operacionais. Busca global, orçamento e exportação descriptografam no servidor após ler lotes de candidatos. A wishlist calcula reservas individuais pelos movimentos; o progresso anual anterior permanece somente como referência de migração.

Despesas fixas mantêm repositório e serviços especializados. `FixedExpenseRecurrenceModule` é o proprietário da persistência e renovação de ciclos, compartilhado com notificações sem dependências circulares. O pagamento usa `FixedExpensePaymentsRepository` para manter criação/remoção da transação vinculada e atualização da despesa na mesma transação do MongoDB. `FixedExpenseRawFieldsService` permanece como adaptador para os campos legados manipulados por comandos raw.

O schema dos domínios inclui as coleções e os índices necessários às funcionalidades atuais. A sincronização no ambiente de destino exige backup, `prisma generate` e `prisma db push` antes de ativar o frontend. Consulte [reservas da wishlist](wishlist-reservations.md), [calendário](financial-calendar.md), [importação](transaction-imports.md) e [cartões](credit-cards.md).

## Importação de extratos

`ImportsModule` expõe `/transaction-imports`. O parser local interpreta apenas os formatos documentados em [Importação de extratos](transaction-imports.md), com limites explícitos de bytes e registros. `ImportsService` compõe prévia/resultado, `ImportHistoryService` resolve o histórico em lotes pela consulta pública de transações e `ImportConfirmationService` coordena a confirmação por linha. `ImportsRepository` grava cada transação e recibo atomicamente, usando um índice único por usuário/lote/linha. O domínio usa duas coleções e metadados de origem criptografados na transação; requer sincronização aditiva do schema antes da publicação.

Prévia e confirmação são distintas. O arquivo bruto não é persistido; dados normalizados ficam criptografados por até 24h de disponibilidade. `ImportCleanupService` apaga payloads expirados na inicialização e a cada minuto. Metadados e recibos permanecem para consulta e idempotência. O fluxo usa o mapper de transações; importações não alteram reservas da wishlist nem lançamentos antigos pela aplicação de regras.

## Cartões de crédito

`CardsModule` concentra cadastro, compras, parcelas e pagamento de faturas. A fachada `CardsService` delega a catálogo, compras/estornos e faturas/pagamentos em `services/`. Os cálculos e as invariantes ficam em `domain/`, envelopes criptográficos em `mappers/` e persistência em `repositories/`. Compras comprometem limite, sem criar `Transaction`; o pagamento de uma fatura fechada cria as despesas e um recibo único na mesma operação MongoDB. O calendário incorpora faturas pendentes como previsões. O contrato e os limites estão em [Cartões de crédito](credit-cards.md).

## Consultas e integração entre funcionalidades

`TransactionsModule` exporta `TransactionQueriesService`. Dashboard, orçamentos,
calendário, histórico de importação e leitores de exportação usam essa API para
obter registros descriptografados. O repository de transações permanece interno.
Busca e totais compartilham os mesmos filtros e cursores; exportação e
importação continuam consumindo lotes limitados. Leituras da wishlist que
participam da trava de reserva permanecem no contexto transacional do próprio
repository, sem abrir uma consulta independente fora da transação.

`RecurringIncomesModule` mantém `/calendar/incomes` e exporta a consulta de
ocorrências. `CalendarModule` reúne essas previsões com despesas, recibos,
faturas e realizados. `CalendarRepository` é um modelo de leitura de despesas
e recibos; ele não modifica os módulos de origem. Recibos de despesas e
receitas continuam disponíveis na mesma coleção.

`NotificationsModule` é dono de `NotificationSyncService` e de seus recibos. O
serviço renova ciclos antes da sincronização solicitada pelo app e usa regras
puras para decidir criação, resolução e reabertura. Mutações financeiras usam
a integração best-effort de despesas fixas para forçar uma nova avaliação.

Esta reorganização não altera o schema Prisma nem exige migração de dados.
