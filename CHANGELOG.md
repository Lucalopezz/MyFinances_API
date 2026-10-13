# Histórico de versões

Este arquivo concentra as mudanças por release. O [escopo atual](docs/features.md) e o [índice da documentação](docs/README.md) descrevem a aplicação e seus contratos.

## Não lançado
- Previsão com saldo acumulado sem repetir movimentos do mês e pendências deduplicadas entre a agenda e os atrasados.
- Cartões integrados às despesas fixas, ao calendário e aos lançamentos: limite por fatura, contratação anual parcelada, estorno integral e arquivamento com pendências.
- Validações e erros públicos em português; downloads com mês e data de geração. URLs locais de integração carregadas do `.env`.


- Notificações sob demanda em qualquer tela privada, com sincronização a cada cinco minutos em uso, alertas de atraso, prevenção transacional de duplicatas e histórico de resolução/reabertura.
- Janela de vencimento inclui o terceiro dia inteiro e respeita o dia financeiro de São Paulo; mutações de despesas atualizam os avisos imediatamente.

- Módulo de exportações reorganizado por responsabilidade, com geradores PDF/CSV/XLSX separados, leitura em lotes e fábrica de escritores; layout e tabela do PDF extraídos do serviço principal.
- Exportação nativa em XLSX pela mesma fila de PDF/CSV, com datas e valores tipados, categorias em português, filtros nas colunas e cabeçalho fixo.
- Validação do novo formato, download com extensão e tipo correspondentes e geração em fluxo para históricos extensos.
- Ambiente local com MongoDB em replica set, Redis, geração de `.env` e guia para usar a conta de teste com 200 transações.
- Preparo assíncrono dos bancos das suítes de integração, mantendo MongoDB real e os guardas de isolamento local.
- Atualização de `jwa` para 1.4.2 no lockfile, corrigindo a inicialização da autenticação no Node atual com comparação nativa de assinaturas.

## [v2.2.2](https://github.com/Lucalopezz/MyFinances_API/tree/v2.2.2) — 03/10/2026

- Novo endpoint autenticado `GET /transactions/balance` para o saldo acumulado de todo o histórico do usuário, independente do mês, filtros e paginação.
- Reutilização do cálculo em centavos e da leitura em lotes do resumo mensal, mantendo seu contrato.
- Testes para histórico com múltiplos meses e mais de 100 registros, isolamento entre usuários, precisão monetária, saldo negativo e histórico vazio.

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
