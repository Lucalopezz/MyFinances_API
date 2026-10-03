# Histórico de versões

Este arquivo concentra as mudanças por release. O [escopo atual](docs/features.md) e o [índice da documentação](docs/README.md) descrevem a aplicação e seus contratos.

## [v2.2.1](https://github.com/Lucalopezz/MyFinances_API/tree/v2.2.1) — 03/10/2026

### Documentação

- README reorganizado em visão geral, funcionalidades, referências técnicas e execução.
- Índice da documentação e referência de escopo atual adicionados.
- Planejamentos e relatórios de validação anteriores identificados como históricos.
- Referências de versão centralizadas neste changelog; guias atuais organizados por domínio.
- Stack, estrutura e referências técnicas alinhadas ao código existente.

### Ajustes incluídos desde v2.2.0

- Totais de transações calculados para todos os resultados dos filtros, independentemente da página.
- Arquivamento de cartões quitados, preservando os registros financeiros.
- Endpoint público `GET /health` para verificar disponibilidade do processo.
- Importação do módulo de autenticação corrigida no módulo de cartões.

Esta atualização documental não altera o código da aplicação nem executa mudanças no banco. Os ajustes funcionais acima já estavam em `main` antes da revisão da documentação.

## [v2.2.0](https://github.com/Lucalopezz/MyFinances_API/tree/v2.2.0) — 01/10/2026

- Categorias personalizadas e regras automáticas de classificação.
- Importação CSV/OFX com prévia, revisão de duplicatas e confirmação idempotente.
- Calendário financeiro, receitas recorrentes e projeção diária.
- Metas com reservas individuais, aportes/retiradas e conclusão de compras.
- Cartões de crédito com limite, parcelas, faturas e pagamento integral.

O planejamento e as evidências dessa rodada estão no [histórico da documentação](docs/README.md#histórico-de-planejamento-e-validação).

## Versões anteriores

Consulte as [tags do repositório](https://github.com/Lucalopezz/MyFinances_API/tags) para os marcos anteriores.
