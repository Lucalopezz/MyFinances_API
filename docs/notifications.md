# Notificações sob demanda

O processamento ocorre durante requisições autenticadas, sem cron, fila ou worker de notificações. O app fechado não executa verificações: ao retornar, a sincronização recupera despesas ainda não pagas, inclusive atrasadas.

## Fluxo e regras

- `POST /notifications/sync` usa exclusivamente o usuário do token, atualiza ciclos pagos e avalia suas despesas. Não aceita `userId` nem `force` do cliente.
- A sincronização usa `NotificationSyncState` para processar no máximo uma vez a cada cinco minutos por usuário. A virada do dia financeiro em `America/Sao_Paulo` ignora esse intervalo. Criar, editar, pagar/desmarcar ou excluir despesas força uma avaliação na API.
- Vencimentos são datas civis `YYYY-MM-DD`, preservando a convenção UTC do calendário. A janela inclui hoje e os próximos três dias inteiros, independentemente do horário armazenado.
- Uma despesa não paga gera `UPCOMING`/`REMINDER` nessa janela ou `OVERDUE`/`ALERT` após o vencimento. Atrasados não têm limite de idade; um atraso gera um único evento por vencimento, sem repetição diária.
- O texto de um aviso existente é atualizado quando mudam nome/valor ou quantos dias faltam/passaram. Isso não altera seu estado de leitura.
- Pagamento resolve os avisos do ciclo na própria transação financeira. Exclusão, mudança de vencimento e substituição de lembrete por atraso também resolvem avisos durante a avaliação. O histórico é preservado com `resolvedAt`, `resolution` e `read: true`.
- Desmarcar pagamento ou restaurar um vencimento reabre o aviso existente como não lido. Excluir explicitamente uma notificação mantém seu recibo e impede recriar aquele evento.

## Concorrência e recuperação

`NotificationDelivery` possui índice único por usuário/despesa/vencimento/evento. O recibo é separado para não exigir um índice único sobre campos opcionais de notificações legadas no MongoDB. A escrita do estado por usuário serializa rodadas concorrentes; avisos, recibos e timestamp são confirmados na mesma transação. As despesas avaliadas são tocadas nessa transação para detectar edição/pagamento concorrente. Conflitos `P2002`/`P2034` permitem até quatro tentativas. Pagamentos e avanço de recorrências repetem somente conflitos transacionais com rollback garantido. Consultas concorrentes não avançam o mesmo ciclo duas vezes.

Uma falha na rota de sincronização é devolvida ao frontend e não confirma o timestamp da rodada. A avaliação auxiliar após uma mutação registra a falha sem transformar um pagamento já confirmado em erro financeiro. A próxima avaliação pode recuperar as pendências; consultas normais continuam sujeitas ao intervalo da última rodada concluída.

O frontend monta a consulta no cabeçalho privado, sincroniza antes de listar e compartilha o cache com configurações. Consulta a cada cinco minutos somente com a aba visível, ao recuperar foco/conexão/disponibilidade e ao abrir o sininho. Após mutações em despesas e pagamentos pelo calendário, invalida o cache de notificações. Falhas transitórias preservam os avisos já carregados.

## Compatibilidade e implantação

Os novos campos de `Notification` são opcionais. Avisos antigos sem vínculo com a despesa permanecem como histórico e não recebem resolução automática: não é seguro inferir identidade pelo texto. `lastNotificationDueDate` é respeitado ao criar o recibo de um lembrete legado, evitando reenviar o mesmo vencimento. Novos alertas de atraso usam recibos independentes.

Antes de publicar:

1. Fazer backup do MongoDB, incluindo despesas, notificações e transações.
2. Gerar o client (`npx prisma generate`) e sincronizar o schema no ambiente correto (`npx prisma db push`). Usar replica set; revisar o diff sem autorizar remoções de dados.
3. Confirmar as coleções `NotificationDelivery` e `NotificationSyncState`, o índice único de entregas e o índice de notificações por usuário/despesa. Não habilitar a nova API antes dos índices.
4. Publicar a API e então o frontend. Não há cron, nova variável de produção ou migração automática de avisos antigos.

A implementação não executa sincronização de schema nem altera dados de produção.

## Validação

- `npm test -- --runInBand --runTestsByPath tests/unit/modules/notifications/domain/notification-rules.spec.ts tests/unit/modules/notifications/notifications.service.spec.ts tests/unit/modules/fixed-expenses/services/fixed-expense-payment.service.spec.ts` cobre dias civis, janela completa, fuso, intervalo e resolução transacional no pagamento.
- `npm run test:notifications:integration` carrega `NOTIFICATIONS_TEST_DATABASE_URL` do `.env`, apontando para o MongoDB local de desenvolvimento. Cria e remove somente um banco aleatório; nunca usa `DATABASE_URL`. Cobre autenticação, três chamadas simultâneas, índice único real, recuperação de atraso, pagamento concorrente, desmarcação, edição, exclusão, legado, rollback e atualização de ciclo.
- No frontend, `npm run test:notifications` valida a política real do Query Core com relógio controlado, pausa em segundo plano, foco/rede, habilitação por sessão/disponibilidade, cache compartilhado, resolução e transporte server-side autenticado.
