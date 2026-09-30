# Calendário financeiro — entrega C

Implementado em 30/09/2026. A publicação e sincronização do schema do ambiente de destino não fazem parte da execução local.

## Contrato e datas

Todas as rotas exigem Bearer JWT; o `sub` define o proprietário. O frontend mantém o token no cookie HTTP-only e usa Server Actions.

| Método e rota | Entrada | Resultado |
| --- | --- | --- |
| `GET /calendar?month=YYYY-MM` | Mês entre -12 e +12 meses do atual | `month`, `today`, `timezone`, `events`, `overdue`, `projection` |
| `GET /calendar/incomes` | — | Recorrências com `id`, `revision`, descrição, valor, categoria, data inicial, periodicidade, pausa e vigência |
| `POST /calendar/incomes` | `description`, `amount`, `category`, `startDate`, `recurrence`, `paused?` | Recorrência criada, sem criar transação |
| `PATCH /calendar/incomes/:id` | Campos editáveis e `revision` obrigatória | Nova versão; conflito de revisão retorna 409 |
| `POST /calendar/incomes/:id/occurrences/:date/confirm` | `amount`, `date` reais | Ocorrência realizada, com transação vinculada; repetição retorna o recibo original |

`recurrence`: `MONTHLY` ou `YEARLY`. Datas civis: `YYYY-MM-DD`, de 2000 a 2100, validadas sem normalizar datas inexistentes. Valores positivos, até 999.999.999, com no máximo duas casas decimais. Descrição de 1 a 120 caracteres. Categorias de receita são revalidadas por proprietário/tipo/estado. Categorias arquivadas não podem ser usadas em novos recebimentos; reative a categoria antes de confirmar uma pendência antiga.

O dia atual segue `America/Sao_Paulo`. Datas civis de novas transações confirmadas e novos vencimentos fixos são armazenadas ao meio-dia UTC para evitar mudança de dia; o índice legado das transações continua baseado em UTC. Uma confirmação não aceita data real futura. É possível receber antecipadamente uma previsão válida, dentro do horizonte de confirmação (até dezembro do próximo ano).

Uma ocorrência traz `id`, `sourceId`, `dueDate`, `periodKey`, `description`, `amount`, `category`, `type` (`INCOME`/`EXPENSE`) e `status` (`PENDING`/`OVERDUE`/`SETTLED`). Realizadas incluem `actualDate`, `actualAmount`, `transactionId`. `events` contém vencimentos do mês; `overdue` contém previsões não realizadas anteriores ao início da projeção. No mês atual há sobreposição intencional entre agenda e pendências anteriores a hoje; a projeção recebe cada ocorrência uma única vez.

## Recorrência e atomicidade

- Datas 29/30/31 são ajustadas ao último dia válido sem perder o dia de origem nos ciclos seguintes; 29/02 anual é ajustado em anos não bissextos.
- Alterações e pausas de receitas valem a partir de amanhã. Revisões com vigência ficam criptografadas; datas passadas e recibos realizados são preservados. Retomar não recria previsões dos períodos pausados.
- A ocorrência prevista é derivada, não persistida por uma leitura. O recibo realizado é persistido com snapshot criptografado. O índice único por usuário/origem/período garante um recebimento por competência mensal ou anual, mesmo após mudança do dia de vencimento. Também há unicidade por usuário/origem/data.
- A confirmação usa transação MongoDB para atualizar a revisão da recorrência, criar a receita criptografada e gravar o recibo. Conflitos concorrentes são repetidos até quatro tentativas. Qualquer falha dentro dessa operação desfaz tudo. O recálculo legado de wishlist ocorre depois; se falhar, repetir a confirmação reexecuta o recálculo sem criar receita adicional.
- Edição/exclusão genérica de transações vinculadas a recibos é bloqueada para preservar os totais e o vínculo. Despesas podem ser desmarcadas pelo fluxo específico enquanto o ciclo está acessível. Recebimentos realizados não possuem fluxo de estorno nesta entrega.
- Pagamentos de despesas fixas passam a salvar recibos na mesma transação. O ciclo pago avança somente uma competência, preservando meses não pagos. `recurrenceDay` mantém o dia original nos novos cadastros. Leitura de calendário não avança ciclos nem grava dados.

## Projeção diária

No mês atual o intervalo começa hoje; em outros meses, no primeiro dia. Termina no último dia do mês solicitado.

1. `baseBalance`: soma de todas as receitas realizadas menos despesas realizadas antes do início; é **saldo registrado no aplicativo**, não saldo bancário.
2. `overdueImpact`: receitas previstas menos despesas previstas anteriores ao início, incluídas uma única vez no primeiro dia.
3. Cada dia soma movimentações realizadas na data real e previsões ainda não realizadas na data prevista. Recibos realizados excluem a previsão da mesma competência.
4. `days` expõe `date`, `balance`, `income`, `expense`, `realized` (líquido). Cálculos usam centavos inteiros.
5. `firstNegativeDate` é o primeiro fechamento diário abaixo de zero, ou `null`; `projectedBalance` é o fechamento final.

O endpoint antigo `/dashboard/forecast` permanece compatível. O novo card do dashboard usa `/calendar` para apresentar o saldo acumulado e a projeção diária. Filtros da agenda não alteram os valores projetados. Compromissos não cadastrados não são estimados.

## Implantação e recuperação

1. Faça backup consistente do MongoDB (incluindo `FixedExpense`, `Transaction` e novas coleções) e preserve a chave de criptografia existente.
2. Use um replica set; valide em homologação. Execute `npx prisma generate` e `npx prisma db push` com a URL do ambiente correto. Os índices únicos das novas coleções são pré-requisito para habilitar as rotas.
3. Publique a API antes do frontend. Novas coleções: `RecurringIncome`, `CalendarReceipt`; campo opcional novo: `FixedExpense.recurrenceDay`. Não há conversão de valores legados em receitas nem alteração de documentos por simples deploy.
4. O último pagamento legado com vínculo é preservado em recibo quando seu ciclo avança. Ciclos antigos já sobrescritos pela versão anterior não podem ser reconstruídos com segurança; as transações existentes continuam no saldo-base. Para despesas antigas sem `recurrenceDay`, o dia do vencimento disponível é o ponto de partida.
5. Em rollback, retire primeiro o frontend novo e interrompa mutações enquanto restaura uma versão compatível com os vínculos/índices. Não remova recibos nem recrie receitas para "corrigir" previsões. Restaure backup em ambiente isolado antes de substituir dados se houver inconsistência; restaurar backup após novas movimentações exige reconciliação.

## Validação local

- `npm test -- --runInBand` inclui datas, centavos, pausa, realizado versus previsto, base acumulada e regressões existentes.
- `CALENDAR_TEST_DATABASE_URL='mongodb://127.0.0.1:27028/?directConnection=true' npm run test:calendar:integration` cria um banco aleatório local, sincroniza índices, testa concorrência/rollback/autorização/pagamentos e apaga somente esse banco ao terminar. Nunca usa `DATABASE_URL` como destino.
