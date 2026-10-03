# Documentação da API

Este índice organiza as referências atuais do MyFinances API. O [README do projeto](../README.md) contém instalação, comandos e visão geral; o [changelog](../CHANGELOG.md) concentra as informações de versão.

## Referências atuais

| Documento | Quando consultar |
| --- | --- |
| [Escopo atual](features.md) | Para conhecer as funcionalidades implementadas e seus limites |
| [Rotas da API](routes.md) | Para integrar endpoints, parâmetros e respostas |
| [Modelos e banco de dados](models.md) | Para entender persistência, relacionamentos e índices |
| [Arquitetura](architecture.md) | Para trabalhar nos módulos e nas regras de domínio |

## Guias de domínio

| Documento | Conteúdo |
| --- | --- |
| [Criptografia financeira](transaction-encryption.md) | Campos protegidos, chave, leitura e manutenção |
| [Importação CSV/OFX](transaction-imports.md) | Formatos, limites, prévia, duplicatas e confirmação |
| [Exportação PDF/CSV](transaction-exports.md) | Fila, armazenamento e download |
| [Calendário financeiro](financial-calendar.md) | Recorrências, confirmações, projeção e implantação |
| [Reservas da wishlist](wishlist-reservations.md) | Aportes, transição de metas antigas e recuperação |
| [Cartões de crédito](credit-cards.md) | Ciclos, limite, parcelas, pagamentos e implantação |

## Histórico de planejamento e validação

Estes documentos preservam o contexto e as evidências das rodadas anteriores. Checklists e observações de validação refletem a data de cada registro; o estado funcional atual está em [Escopo atual](features.md).

- [Planejamento original da V2](v2.md).
- [Plano da rodada anterior](implementation-plan.md).
- [Registro de evolução da v2.2.0](next-steps.md).
- [Validação de categorias e regras](delivery-a-validation.md).
- [Validação de importação CSV/OFX](delivery-b-validation.md).
- [Validação de calendário financeiro](delivery-c-validation.md).

## Documentação do frontend

Consulte o [índice do frontend](https://github.com/Lucalopezz/MyFinances_Front/blob/main/docs/README.md) para telas, sessão e integrações no Next.js.
