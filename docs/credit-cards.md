# Cartões de crédito

Funcionalidade da v2.2.0. A interface fica em `/cards` e no formulário de nova despesa do frontend. O simulador de compras do plano anterior não integra esta versão.

## Modelo e regras

`CreditCard` guarda nome, limite e anuidade criptografados; dias de fechamento e vencimento são índices do ciclo. `CardPurchase` guarda descrição, valor, categoria e número de parcelas criptografados. `CardInstallment` guarda valor criptografado e competência/data de vencimento. `CardPayment` guarda o pagamento da fatura, seus IDs de transações realizadas e valor/data criptografados. Todos os registros pertencem ao usuário do JWT.

- A compra compromete o limite pelo valor total, mas não cria `Transaction`.
- A compra feita no dia de fechamento entra no próximo ciclo. Dias 29 a 31 são ajustados ao último dia válido do mês, mantendo a âncora original nos meses seguintes.
- O primeiro centavo excedente é distribuído entre as primeiras parcelas. Cada parcela tem pelo menos um centavo.
- A anuidade é cobrada no primeiro ciclo do cartão e no mesmo mês dos anos seguintes. Ciclos futuros ainda não emitidos não ocupam o limite. A anuidade é configurada no cadastro do cartão.
- Faturas são agregadas por competência a partir de parcelas e anuidade. Leituras não criam transações nem faturas persistidas.
- Somente fatura fechada pode ser paga. Nesta versão, o pagamento é integral. Uma operação MongoDB cria uma transação de despesa por parcela (preservando sua categoria), uma transação de anuidade quando aplicável e um recibo único por usuário/cartão/ciclo. Repetir o pagamento devolve a fatura paga; chamadas simultâneas não podem duplicar o recibo.
- Transações do pagamento não podem ser editadas nem excluídas pela rota genérica.
- Remover um cartão grava `archivedAt` e o oculta da listagem, de novas compras e do calendário. Compras, parcelas, recibos e transações realizadas permanecem no banco. É necessário quitar todas as parcelas e anuidades já fechadas; anuidades futuras deixam de ser previstas. A operação usa a revisão do cartão em uma transação MongoDB, como compras e pagamentos, para evitar remover um cartão que recebeu uma compra simultaneamente. Cartões antigos sem `archivedAt` continuam ativos.
- Faturas pendentes entram no calendário como uma única previsão por fatura. Ao pagar, a previsão é removida do saldo projetado; as transações realizadas entram na data do pagamento.

## Rotas

Todas exigem Bearer JWT.

| Método | Rota | Entrada | Resultado |
| --- | --- | --- | --- |
| GET | `/cards` | — | Cartões com limite e faturas |
| POST | `/cards` | `name`, `limit`, `closingDay`, `dueDay`, `annualFee` | Cartão criado |
| GET | `/cards/:id` | — | Cartão, compras, parcelas agrupadas por fatura, limite disponível |
| DELETE | `/cards/:id` | — | Cartão arquivado; `{ message }`; `400` se houver parcelas ou anuidades fechadas pendentes |
| POST | `/cards/:id/purchases` | `description`, `amount`, `date`, `category`, `installments` | Compra e parcelas previstas |
| POST | `/cards/:id/invoices/:cycle/pay` | `date` | Fatura quitada e transações realizadas |

Datas civis usam `YYYY-MM-DD` e o dia atual usa `America/Sao_Paulo`. `cycle` usa `YYYY-MM`. Valores monetários aceitam até duas casas decimais. O frontend envia chamadas autenticadas por Server Actions.

## Implantação

Gerar o Prisma Client e sincronizar o schema MongoDB no ambiente de destino após backup: `npx prisma generate` e `npx prisma db push`. Novas coleções: `CreditCard`, `CardPurchase`, `CardInstallment`, `CardPayment`. O índice único de `CardPayment` por usuário/cartão/ciclo é necessário antes de expor a rota de pagamento. Publicar a API antes do front. Não há migração automática de transações antigas ou extratos de cartão.

## Limites desta entrega

Pagamento parcial, estorno, edição de cartão/compra, juros, conciliação de extrato e vínculo a conta bancária ficam para evolução posterior. O saldo do aplicativo continua derivado das transações realizadas; categorias de compras aparecem no dashboard quando a fatura é paga. O endpoint legado `/dashboard/forecast` não incorpora faturas; a projeção diária de `/calendar` incorpora.

## Validação

`npm test -- --runInBand --runTestsByPath src/modules/cards/card-calculation.spec.ts` verifica datas e centavos. A suíte `cards.integration.spec.ts` usa `CARDS_TEST_DATABASE_URL` apontando para MongoDB local com replica set; cria e remove somente um banco de teste aleatório.
