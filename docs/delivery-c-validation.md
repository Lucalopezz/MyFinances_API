# Entrega C — validação local

> Relatório histórico: testes, contagens e limitações refletem a data da entrega. Consulte o [escopo atual](features.md) e o [changelog](../CHANGELOG.md) para o estado vigente.

Data: 30/09/2026. Implementação no frontend e backend; não representa homologação ou publicação em produção.

## Evidências

- API: `npm run build` passou.
- API: `npm test -- --runInBand` — 59 testes passaram em 14 suítes; suítes de integração opt-in não fazem parte desse total.
- MongoDB 7 real em replica set descartável: **10 testes passaram** na suíte `calendar.integration.spec.ts` verifica armazenamento criptografado sem lançamento implícito, confirmações simultâneas/repetidas, isolamento por usuário, limite de período, conflitos de revisão, preservação de histórico, rollback, pagamentos/desmarcações e projeção com saldo-base. Verifica também competência após mudança de vencimento e categoria arquivada. O banco aleatório criado pela suíte é removido ao final; os dados do ambiente do usuário não são usados.
- Frontend: `npm run build` passou com a rota `/calendar`; como a configuração existente pula a validação de tipos no build, foi executado também `npx tsc --noEmit`, que passou.
- Regras de fim do mês, ano bissexto, pausa/retomada, centavos, impacto de vencidos uma única vez e primeiro dia negativo são cobertas por `calendar-calculation.spec.ts`.

## Interface implementada e limite da verificação

Calendário mensal no desktop, agenda no celular, navegação de meses limitada ao horizonte da API, filtros, seleção de dias por teclado, formulários com validação, temas claro/escuro, estados de carregamento/vazio/erro/sucesso, gráfico e tabela diária. Menu móvel fecha após navegação.

A sessão não disponibilizou navegador: o inventário retornou vazio e a tentativa de abrir o navegador integrado retornou `Browser is not available: iab`. Portanto **não foram executados inspeção visual por screenshot nem testes de interação reais no desktop/mobile**. Responsividade e acessibilidade foram revisadas no código e precisam de homologação visual, especialmente em 360/390/768/1440 px, nos dois temas e com descrições longas.

## Implantação e limites conhecidos

- Executar os índices/schema e publicar API antes do frontend, conforme [financial-calendar.md](financial-calendar.md). Nenhum schema de produção foi alterado.
- Coleções novas exigem replica set e índices únicos. Conservar a chave de criptografia e fazer backup antes do rollout.
- Ciclos de despesas fixas já sobrescritos antes desta entrega não são reconstruídos; transações legadas continuam no saldo-base.
- Recebimentos confirmados não têm estorno nesta entrega; sua edição/exclusão genérica é bloqueada. Categorias arquivadas precisam ser reativadas para registrar novos recebimentos pendentes.
- Saldo registrado não equivale ao saldo bancário. Previsões dependem dos compromissos cadastrados.
