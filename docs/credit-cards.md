# Cartões de crédito

Guia atual de limite, compras, parcelas e faturas. A interface fica em `/cards` e no formulário de nova despesa do frontend. Consulte também o [contrato HTTP](routes.md#cartões-de-crédito).

## Modelo e regras

`CreditCard` guarda nome, limite e anuidade criptografados; dias de fechamento e vencimento são índices do ciclo. `CardPurchase` guarda descrição, valor, categoria e número de parcelas criptografados. `CardInstallment` guarda valor criptografado e competência/data de vencimento. `CardPayment` guarda o pagamento da fatura, seus IDs de transações realizadas e valor/data criptografados. Todos os registros pertencem ao usuário do JWT.

- Cada parcela compromete o limite da sua fatura; a compra não cria `Transaction`.
- A compra feita no dia de fechamento entra no próximo ciclo. Dias 29 a 31 são ajustados ao último dia válido do mês, mantendo a âncora original nos meses seguintes.
- O primeiro centavo excedente é distribuído entre as primeiras parcelas. Cada parcela tem pelo menos um centavo.
- A anuidade é cobrada no primeiro ciclo do cartão e no mesmo mês dos anos seguintes. Cada ciclo inclui sua anuidade na validação do limite. A anuidade é configurada no cadastro do cartão.
- Faturas são agregadas por competência a partir de parcelas e anuidade. Leituras não criam transações nem faturas persistidas.
- Somente fatura fechada pode ser paga. Nesta versão, o pagamento é integral. Uma operação MongoDB cria uma transação de despesa por parcela (preservando sua categoria), uma transação de anuidade quando aplicável e um recibo único por usuário/cartão/ciclo. Repetir o pagamento devolve a fatura paga; chamadas simultâneas não podem duplicar o recibo.
- Transações do pagamento não podem ser editadas nem excluídas pela rota genérica.
- Remover um cartão grava `archivedAt` e bloqueia novas compras. Cartão, parcelas, recibos e transações permanecem disponíveis; faturas pendentes continuam no calendário e podem ser pagas. Novas anuidades após o arquivamento deixam de ser previstas. A revisão serializa o arquivamento com compras e pagamentos concorrentes. Cartões antigos sem `archivedAt` continuam ativos.
- Faturas pendentes entram no calendário como uma única previsão por fatura. Ao pagar, a previsão é removida do saldo projetado; as transações realizadas entram na data do pagamento.

## Rotas

Todas exigem Bearer JWT.

| Método | Rota | Entrada | Resultado |
| --- | --- | --- | --- |
| GET | `/cards` | — | Cartões com limite e faturas |
| POST | `/cards` | `name`, `limit`, `closingDay`, `dueDay`, `annualFee` | Cartão criado |
| GET | `/cards/:id` | — | Cartão, compras, parcelas agrupadas por fatura, limite disponível |
| DELETE | `/cards/:id` | — | Cartão arquivado; `{ message }`; faturas pendentes permanecem acessíveis |
| POST | `/cards/:id/purchases` | `description`, `amount`, `date`, `category`, `installments` | Compra e parcelas previstas |
| POST | `/cards/:id/invoices/:cycle/pay` | `date` | Fatura quitada e transações realizadas |

Datas civis usam `YYYY-MM-DD` e o dia atual usa `America/Sao_Paulo`. `cycle` usa `YYYY-MM`. Valores monetários aceitam até duas casas decimais. O frontend envia chamadas autenticadas por Server Actions.

## Implantação

Gerar o Prisma Client e sincronizar o schema MongoDB no ambiente de destino após backup: `npx prisma generate` e `npx prisma db push`. Novas coleções: `CreditCard`, `CardPurchase`, `CardInstallment`, `CardPayment`. O índice único de `CardPayment` por usuário/cartão/ciclo é necessário antes de expor a rota de pagamento. Publicar a API antes do front. Não há migração automática de transações antigas ou extratos de cartão.

## Limites do escopo atual

Pagamento parcial, edição de cartão/compra, juros, conciliação de extrato e vínculo a conta bancária não estão disponíveis no escopo atual. O saldo do aplicativo continua derivado das transações realizadas; categorias de compras aparecem no dashboard quando a fatura é paga. As previsões de `/dashboard/forecast` e `/calendar` incorporam as mesmas faturas.

## Validação

`npm test -- --runInBand --runTestsByPath tests/unit/modules/cards/domain/card-calculation.spec.ts` verifica datas e centavos. A suíte `cards.integration.spec.ts` usa `CARDS_TEST_DATABASE_URL` apontando para MongoDB local com replica set; cria e remove somente um banco de teste aleatório.

## Limite por fatura

O limite é validado por ciclo: parcelas, compras à vista e anuidade no mesmo mês não podem ultrapassá-lo. Uma compra de R$ 1.200 em 12 parcelas de R$ 100 cabe num limite de R$ 100 se não houver outros valores nesses ciclos. O limite em uso é a maior fatura pendente, sem somar meses diferentes. Essa é a regra de acompanhamento do aplicativo.

## Arquivamento com pendências

Remover arquiva o cartão e bloqueia novas compras. Compras e faturas continuam acessíveis com `archived: true`, inclusive para pagamento e calendário. A anuidade deixa de gerar novos ciclos após o arquivamento; faturas já fechadas são preservadas.

O estorno integral remove parcelas pendentes das faturas e registra receita apenas pelo valor já pago. Compras estornadas permanecem no histórico com a data do estorno.

Despesas fixas podem ser contratadas no cartão. Para um plano anual de R$ 1.200 em 12 parcelas, cadastre valor total R$ 1.200, recorrência anual e 12 parcelas. Registre a contratação em cada renovação; o calendário prevê as parcelas e passa a usar as faturas reais após o registro. A confirmação é manual, sem efetuar cobrança no banco.
