# Plano de implementação — histórico

> Referência histórica da rodada anterior à v2.2.0. O escopo aprovado está implementado e descrito em [Escopo atual](features.md). Consulte o [changelog](../CHANGELOG.md) para as mudanças por versão.

Esta rodada introduziu duplicação pelo formulário, busca global com cursor, projeção de despesas fixas, orçamento mensal por categoria, leitura de notificações em lote e exportação CSV/PDF. A rodada seguinte está preservada no [registro de evolução da v2.2.0](next-steps.md).

A ordem, os critérios e as exclusões abaixo refletem o planejamento original. Para os contratos vigentes, consulte o [índice da documentação](README.md).

## Registro do planejamento original

Plano para evoluir a API e o frontend do MyFinances em entregas pequenas e compatíveis com a aplicação em produção.

## Objetivo e regras de segurança

- Preservar contratos e comportamentos atuais enquanto novas opções são adicionadas.
- Fazer alterações de banco somente para funcionalidades que realmente precisem persistir dados novos.
- Manter a regra de que o frontend acessa a API por Server Actions; o JWT não deve ir para o navegador.
- Não expor `encryptedData` nem registrar dados financeiros descriptografados em logs.
- Publicar primeiro suporte compatível na API; ativar a interface depois que a API estiver disponível.
- Atualizar a documentação de rotas da API e os modelos/contratos do frontend na mesma entrega.

## Estado na elaboração do plano anterior

- `GET /transactions` aceita paginação (`page` e `limit`); a busca e os filtros atuais do frontend atuam somente sobre a página carregada.
- O payload sensível de transações é criptografado. `dateIndex`, `type` e `userId` permanecem disponíveis para consultas operacionais.
- Marcar uma despesa fixa como paga cria uma transação vinculada por `paidTransactionId` dentro de uma transação do banco.
- A wishlist recalcula `savedAmount` com a economia líquida do ano e aplica o mesmo resultado aos itens do usuário. Este plano não altera essa regra.
- Exportação atual é assíncrona e gera PDF; os arquivos usam armazenamento local configurável.

## Ordem recomendada

| Etapa | Funcionalidade | Dependência de dados | Porte |
| --- | --- | --- | --- |
| 1 | Duplicar transação no formulário | Nenhuma | Pequeno |
| 2 | Consulta global de transações com cursor | Nenhuma | Médio |
| 3 | Projeção de despesas fixas no mês | Nenhuma | Pequeno/médio |
| 4 | Orçamento mensal por categoria | Nova coleção | Médio |
| 5 | Marcar todas as notificações como lidas | Nenhuma | Pequeno |
| 6 | Exportação CSV | Reutiliza fila de exportação; arquivo novo | Pequeno/médio |

As etapas podem ser liberadas separadamente. A etapa 1 pode ser entregue primeiro; a etapa 2 é a prioridade seguinte por corrigir a limitação de descoberta do histórico.

---

## Etapa 1 — Duplicar transação

### API

- Nenhuma mudança necessária.
- Continuar usando `POST /transactions` para gravar uma nova transação e executar os recálculos já existentes.

### Frontend (`MyFinances_Front`)

- Adicionar ação “Duplicar” nas ações de linha da transação.
- Abrir o formulário existente com tipo, categoria e descrição preenchidos; sugerir a data atual e manter o valor editável.
- Exigir confirmação normal no formulário antes de criar. Não gravar automaticamente.
- Usar a Server Action atual de criação e suas revalidações de cache.

### Critérios de aceite

- A transação original não é alterada.
- Cancelar o formulário não cria dados.
- Salvar gera um novo ID e atualiza listas, dashboard e comparativos pelo fluxo atual.

---

## Etapa 2 — Consulta global de transações com cursor

Filtros em campos criptografados não podem ser delegados ao MongoDB. Para evitar carregar todo o histórico no browser ou quebrar o `GET /transactions` atual, adicionar uma rota de busca separada e opcional.

### API

- Criar `GET /transactions/search` protegido pelo mesmo guard.
- Registrar a rota estática `/search` antes da rota dinâmica `/:id` no controller.
- Aceitar `cursor` opaco, `limit`, `startDate`, `endDate`, `type`, `category` e `search` (descrição/categoria).
- Ordenar de forma estável por `dateIndex` e `id`, usando os índices operacionais disponíveis para restringir o conjunto candidato.
- Aplicar filtros criptografados depois de descriptografar em lotes limitados. Continuar a leitura em lotes até preencher a página ou esgotar os candidatos; não carregar a coleção inteira de uma vez.
- Retornar `{ data, nextCursor, hasMore }`. Não prometer total exato nesta primeira versão, pois filtros sobre campos criptografados não têm contagem barata no banco.
- Manter `GET /transactions?page=...&limit=...` e seu formato sem alteração para consumidores existentes.
- Validar limite máximo por página, intervalos de data e formato/tamanho dos parâmetros de busca.

### Frontend (`MyFinances_Front`)

- Adicionar Server Action para a nova rota e modelo de resposta próprio, sem reaproveitar `PaginatedTransactions` se isso tornar o contrato ambíguo.
- Enviar filtros pela URL para permitir recarregar, compartilhar e voltar à mesma busca.
- Trocar a navegação por número de página por “Anterior/Próxima” baseada em cursores, guardando o cursor anterior para voltar.
- Exibir quantidade da página e estado “mais resultados”; remover a afirmação de que a busca cobre apenas as 50 transações carregadas quando o novo fluxo estiver ativo.
- Manter a exportação PDF atual como ação separada para relatórios completos.

### Critérios de aceite

- Busca por período/tipo/categoria/descrição encontra registros fora da página inicial.
- Busca vazia continua usando ordenação cronológica e paginação estável.
- O endpoint antigo e a listagem atual continuam funcionando sem parâmetros novos.
- Nenhum dado descriptografado ou token é gravado em logs ou persistido no browser.

### Rollout

1. Publicar e documentar a nova rota na API.
2. Verificar a API com consultas pequenas e com períodos extensos; ajustar o tamanho dos lotes e limite da página.
3. Publicar o frontend consumindo a rota nova.
4. Manter o endpoint antigo disponível durante toda a transição.

---

## Etapa 3 — Projeção de despesas fixas no mês

### API

- Adicionar bloco opcional de projeção ao dashboard, ou criar `GET /dashboard/forecast` para manter o contrato atual do dashboard estável.
- Calcular despesas fixas ainda não pagas com vencimento até o fim do mês, incluindo vencidas e pendentes.
- Retornar separadamente valores reais e projetados, por exemplo: `currentBalance`, `pendingFixedExpenses` e `projectedBalance`.
- Usar o vínculo `paidTransactionId`/`isPaid` já existente para não descontar novamente despesas pagas que já geraram transação.
- Não criar lançamentos previstos na coleção de transações.

### Frontend (`MyFinances_Front`)

- Mostrar um card “Projeção do mês”, com saldo atual, total pendente e saldo estimado no fechamento.
- Identificar o resultado como previsão e listar as despesas incluídas com nome, valor e vencimento.
- Revalidar/refazer a consulta após marcar ou desmarcar pagamento de despesa fixa.

### Critérios de aceite

- Marcar uma despesa como paga a remove do total pendente e a transação criada permanece contabilizada no saldo real.
- A projeção não altera dados nem interfere nos cálculos existentes do dashboard.
- Estado sem despesas pendentes aparece como projeção igual ao saldo atual.

---

## Etapa 4 — Orçamento mensal por categoria

### API e banco

- Adicionar modelo independente `MonthlyBudget` com `userId`, `monthKey` (`YYYY-MM`), `category`, `limitAmount` e datas de auditoria.
- Criar unicidade por usuário, mês e categoria para impedir orçamentos duplicados.
- Criar endpoints protegidos para listar/criar/atualizar/remover orçamento e obter resumo de gastos do mês.
- Calcular gasto por categoria filtrando o período com `dateIndex` e descriptografando os candidatos no servidor.
- Validar que categoria informada é categoria de despesa e que o limite é positivo.
- Não alterar o schema nem o fluxo de criação/edição das transações existentes.

### Frontend (`MyFinances_Front`)

- Criar seção simples “Orçamento do mês” com seleção do mês, limite, gasto e valor restante.
- Permitir editar/remover um orçamento e apresentar estado sem orçamentos.
- Exibir indicação visual ao chegar perto ou ultrapassar o limite. Na primeira versão, não gerar notificações persistidas automaticamente.
- Revalidar orçamento e dashboard após qualquer mutação de transação.

### Critérios de aceite

- Limite e gasto são isolados por usuário, mês e categoria.
- Edição de transação recalcula a categoria/período afetado na próxima leitura.
- Usuários sem orçamento continuam usando o sistema sem mudança visual ou funcional nas demais telas.

### Rollout

1. Fazer backup antes da sincronização do schema em produção.
2. Aplicar a nova coleção e gerar o client Prisma; nenhuma migração de registros existentes é necessária.
3. Publicar endpoints antes de liberar a seção do frontend.
4. Acompanhar tempo de resposta dos resumos, pois as categorias precisam ser avaliadas após descriptografia.

---

## Etapa 5 — Marcar todas as notificações como lidas

### API

- Adicionar `PATCH /notifications/mark-all-as-read`, sempre limitado ao `userId` do token.
- Atualizar apenas registros não lidos e retornar a quantidade alterada.
- Preservar a rota atual `PATCH /notifications/:id/mark-as-read`.

### Frontend (`MyFinances_Front`)

- Adicionar ação no popover de notificações, visível apenas quando houver notificações não lidas.
- Atualizar cache/contador após sucesso; apresentar erro sem limpar o estado local quando a API falhar.

### Critérios de aceite

- A operação não altera notificações de outro usuário.
- Executar a ação mais de uma vez é seguro e não cria registros.

---

## Etapa 6 — Exportação CSV

### API

- Estender o job de exportação existente com formato `PDF` ou `CSV`, mantendo `PDF` como padrão para clientes antigos.
- Persistir o formato solicitado no registro de exportação e validar extensão/content-type no download.
- Usar o processamento em lotes existente e aplicar os mesmos filtros e isolamento por usuário.
- Gerar CSV com cabeçalho estável, datas ISO e valores numéricos sem formatação localizada; escapar delimitadores, aspas e quebras de linha.
- Documentar que o armazenamento atual é local/efêmero e que links podem deixar de funcionar após reinicialização/deploy.

### Frontend (`MyFinances_Front`)

- Adicionar seletor de formato PDF/CSV no fluxo de exportação.
- Preservar estado de processamento, erros e download atuais.
- Usar CSV para análise em planilha; manter PDF para leitura/impressão.

### Critérios de aceite

- Solicitações antigas sem formato continuam gerando PDF.
- Exportação CSV respeita os filtros e contém apenas dados do usuário autenticado.
- Arquivos CSV podem ser abertos em planilha sem corromper descrições com vírgulas, aspas ou acentos.

---

## Checklist de entrega para cada etapa

- [ ] Atualizar `docs/routes.md` e, quando aplicável, `docs/models.md` na API.
- [ ] Atualizar `MyFinances_Front/docs/api-routes.md`, modelos e actions correspondentes.
- [ ] Preservar chamadas e respostas existentes ou manter compatibilidade explícita.
- [ ] Revisar autorização por usuário em todas as consultas e mutações.
- [ ] Revisar loading, erro, vazio e feedback de sucesso na interface.
- [ ] Fazer rollout API primeiro quando houver alteração de contrato.
- [ ] Validar o fluxo afetado em ambiente de homologação antes da publicação.

## Fora do escopo da rodada anterior

- Importação automática de extrato bancário, cartões/parcelas e integração com instituições financeiras.
- Alterar o cálculo atual da wishlist ou converter objetivos existentes em metas com aportes individuais.
- Trocar a criptografia das transações ou introduzir índice cego para categoria/descrição sem uma avaliação própria de privacidade e desempenho.
