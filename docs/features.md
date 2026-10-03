# Escopo atual do MyFinances

Atualizado em 03/10/2026. As funcionalidades previstas no escopo aprovado estão implementadas na API e no frontend. Este documento descreve o produto disponível; os registros de planejamento e validação anteriores estão no [índice da documentação](README.md#histórico-de-planejamento-e-validação). As mudanças por versão estão no [changelog](../CHANGELOG.md).

## Funcionalidades implementadas

| Domínio | Comportamento disponível | Referência |
| --- | --- | --- |
| Autenticação e usuário | Cadastro, login JWT, perfil e senha; isolamento por usuário | [Rotas](routes.md#auth) |
| Transações | Receitas e despesas, CRUD, busca global com cursor, filtros e totais; duplicação pelo formulário no frontend | [Rotas](routes.md#transactions) |
| Categorias e regras | Categorias personalizadas, arquivamento/restauração, prioridades e sugestão por descrição | [Rotas](routes.md#categorias-personalizadas-e-regras) |
| Importação | CSV/OFX com mapeamento, prévia, revisão de categorias/duplicatas e confirmação idempotente | [Guia](transaction-imports.md) |
| Exportação | PDF/CSV assíncronos, acompanhamento e download autenticado | [Guia](transaction-exports.md) |
| Dashboard e comparativos | Resumo mensal, indicadores, comparação de períodos e despesas por categoria | [Rotas](routes.md#dashboard) |
| Orçamentos | Limites mensais por categoria, gasto realizado e valor restante | [Rotas](routes.md#budgets) |
| Calendário | Agenda, receitas mensais/anuais, edição/pausa, confirmação de recebimento e projeção diária | [Guia](financial-calendar.md) |
| Wishlist | Reserva individual, aportes, retiradas, sugestão mensal, histórico e conclusão com despesa vinculada | [Reservas](wishlist-reservations.md) e [rotas](routes.md#wishlist--metas-e-compras) |
| Cartões | Cadastro, limite, parcelas, faturas, pagamento integral e arquivamento de cartões quitados | [Guia](credit-cards.md) |
| Despesas fixas | Recorrências, pagamentos/desmarcações vinculados e avanço de ciclos | [Rotas](routes.md#fixed-expenses) |
| Notificações | Alertas de vencimento, consulta, exclusão e leitura individual ou em lote | [Rotas](routes.md#notifications) |

## Regras gerais

- O saldo registrado é calculado a partir das transações realizadas no aplicativo. A projeção considera os compromissos cadastrados e explicita suas premissas.
- Uma previsão de receita ou despesa não cria uma transação por si só. Confirmar recebimentos e pagamentos substitui a previsão pelo realizado.
- Aportes reservam dinheiro para uma meta e retiradas liberam essa reserva. A conclusão de uma compra cria uma única despesa e preserva o histórico.
- Compras no cartão comprometem limite; as despesas realizadas são criadas no pagamento da fatura.
- Dados financeiros sensíveis são criptografados no backend. O frontend usa sessão em cookie HTTP-only e chamadas autenticadas no servidor.

## Limites de escopo

O simulador de compras foi retirado do planejamento anterior. Open Finance, contas bancárias/carteiras, OCR, categorização por IA e compartilhamento familiar não integram o escopo aprovado. Cartões têm pagamento integral; pagamento parcial, estorno, edição de cartão/compra, juros e conciliação de extrato não estão disponíveis. A conclusão de compras da wishlist e recebimentos recorrentes não possuem fluxo específico de estorno.

Os limites de arquivo, datas, retenção e operação estão nos guias de domínio.
