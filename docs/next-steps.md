# Próximos passos do MyFinances

Atualizado em 28/09/2026.

Status: entrega A implementada e validada localmente; entregas B–F permanecem planejadas. A publicação e a sincronização do schema no ambiente de destino ainda não foram executadas. Este documento define a próxima rodada e substitui a ordem de prioridades dos planos anteriores; não altera os contratos atuais da API.

Este plano é mantido em `docs/next-steps.md` nos repositórios da API e do frontend. Atualizações de escopo e critérios de aceite devem ser replicadas nas duas cópias. O [plano anterior](implementation-plan.md) e o [planejamento V2](v2.md) permanecem como referências históricas.

## Objetivo

Reduzir o trabalho de registrar movimentações, antecipar compromissos financeiros e acompanhar metas com valores reservados individualmente. O escopo reúne os itens 3 a 7 selecionados e a conclusão de compras da wishlist com geração de despesa e saída da lista ativa.

## Ponto de partida

O código já contém busca global de transações, duplicação pelo formulário, orçamento mensal por categoria, projeção de despesas fixas pendentes, exportação PDF/CSV e marcação de notificações em lote. Isso indica implementação no repositório, não validação do ambiente de produção.

A entrega A adiciona catálogo de categorias personalizadas compatível com os códigos das listas fixas. A projeção atual cobre despesas fixas pendentes no mês. A wishlist aplica a mesma economia líquida anual a todos os itens; esse valor não representa aportes individuais e não deve ser migrado como dinheiro reservado em cada meta.

## Ordem proposta de entrega

A numeração original foi preservada na coluna de origem. A sequência abaixo considera dependências, não altera os itens escolhidos.

| Entrega | Origem | Funcionalidade | Dependência |
| --- | --- | --- | --- |
| A | Item 5 | Categorias personalizadas e regras automáticas | Compatibilidade com categorias existentes |
| B | Item 3 | Importação de extratos CSV/OFX | A para aplicar categorias e regras novas; prévia pode começar com categorias atuais |
| C | Item 4 | Calendário financeiro e receitas recorrentes | Reaproveita despesas fixas e projeção atuais |
| D | Item 6 | Metas com histórico de aportes | Substituição controlada do cálculo atual da wishlist |
| E | Pedido adicional | Concluir compra da wishlist | D para consumir/liberar reservas individuais; reutiliza criação de transação |
| F | Item 7 | Simulador de compras | C e D para considerar previsões e metas |

Cada entrega inclui API, interface e documentação. Contas bancárias, carteiras e gestão completa de cartões não são pré-requisitos desta rodada.

## A — Categorias personalizadas e regras automáticas

Implementação: catálogo, gestão em configurações, regras com teste, sugestão manual, validações nos fluxos existentes e documentação. A prévia de importação consumirá o resolvedor na entrega B. Critérios abaixo verificados em testes locais; persistência em MongoDB real e homologação/deploy continuam pendentes. Veja [evidências e limites da validação](delivery-a-validation.md).

### Comportamento esperado

- Permitir criar, editar e arquivar categorias de receita ou despesa, com nome, cor e ícone.
- Preservar categorias padrão e referências do histórico. Arquivar impede novos usos, mas mantém a leitura dos lançamentos antigos.
- Criar regras por usuário, como “descrição contém Uber → Transporte”, com prioridade e opção de ativar/desativar.
- Aplicar regras na prévia de importação e sugerir categoria em novos lançamentos manuais. A escolha explícita do usuário prevalece.
- Quando mais de uma regra corresponder, usar a primeira pela prioridade definida. A comparação deve tratar maiúsculas e acentos de forma consistente.
- Não recategorizar lançamentos antigos silenciosamente.

### API e dados

- Planejar entidades de categoria e regra com isolamento por usuário, tipo de movimentação e identificadores estáveis.
- Criar uma camada de resolução compatível com os códigos atuais; não substituir os enums sem uma transição para clientes e registros legados.
- Atualizar validações, filtros, despesas fixas, orçamento, comparativos, exportação e importação para aceitar categorias personalizadas.
- Executar regras sobre descrições no servidor, preservando a criptografia e evitando logs com dados financeiros.
- Validar que a categoria de destino existe, está ativa, pertence ao usuário ou ao catálogo padrão e aceita o tipo da transação.

### Frontend

- Adicionar gestão de categorias e regras em configurações.
- Substituir seletores limitados a constantes por catálogo retornado pela API, mantendo suporte aos registros antigos.
- Oferecer teste de regra com descrição de exemplo antes de salvar.

### Critérios de aceite

- [x] Categorias atuais continuam aparecendo corretamente em todos os fluxos.
- [x] Categoria personalizada funciona em lançamento, busca, orçamento, comparativo e exportação.
- [x] Arquivar uma categoria não apaga nem invalida o histórico.
- [x] Prioridade das regras é determinística e a correção manual prevalece.
- [x] Categorias e regras de outro usuário não podem ser consultadas ou utilizadas.

## B — Importação de extratos CSV/OFX

### Comportamento esperado

1. Selecionar um arquivo CSV ou OFX.
2. Para CSV, mapear data, descrição, valor e, quando houver, colunas separadas de entrada/saída ou categoria. Permitir escolher delimitador e formato de data/decimal.
3. Normalizar registros e mostrar prévia com data, descrição, valor, tipo, categoria, erros e possíveis duplicatas.
4. Aplicar regras automáticas, permitir corrigir categorias individualmente ou em lote e desmarcar linhas.
5. Confirmar somente os registros selecionados e válidos.
6. Mostrar resumo de importados, ignorados e rejeitados, com motivo por linha.

### API e dados

- Separar análise/prévia da confirmação: enviar ou revisar um arquivo não cria transações.
- Suportar CSV e variantes OFX XML/SGML dentro de formatos documentados; informar erros de layout, codificação, moeda não suportada ou campos obrigatórios.
- Definir limites explícitos de tamanho e quantidade de linhas antes da implementação do upload.
- Identificar candidatos a duplicata dentro do arquivo e no histórico do usuário usando identificador externo, quando disponível, e combinação de data, valor, tipo e descrição normalizada.
- Identificadores externos precisam de contexto de origem; não tratá-los como únicos entre bancos ou extratos distintos. Correspondências aproximadas são sugestões, pois duas compras legítimas podem ter os mesmos dados.
- Na confirmação, revalidar linhas, categorias e candidatos contra o estado atual. Não confiar apenas na prévia enviada pelo navegador.
- Usar identificação de lote e de linha para que repetição de requisição, clique duplo ou retomada após falha não dupliquem transações.
- Registrar resultado por linha para permitir retomar apenas pendências em lotes parcialmente processados.
- Gravar pelo fluxo de criptografia e cálculos existente. Evitar persistir o arquivo bruto; se a prévia precisar de armazenamento temporário, definir expiração, proteção e descarte.

### Frontend

- Criar fluxo de importação na tela de transações, com etapas de arquivo, mapeamento, revisão e resultado.
- Exibir duplicatas suspeitas inicialmente desmarcadas, com opção explícita de importar se forem movimentações distintas.
- Manter erros visíveis por linha, impedir confirmação de linhas inválidas e atualizar listas e resumos após sucesso.

### Critérios de aceite

- [ ] CSV com vírgula/ponto e vírgula, acentos, aspas, valores negativos e formatos decimais documentados é interpretado corretamente.
- [ ] OFX extrai data, descrição, valor e identificador externo quando presente.
- [ ] Cancelar a prévia não cria transações.
- [ ] Correções de categoria e seleção de linhas são respeitadas.
- [ ] Reenviar a mesma confirmação não cria novos registros; reimportar arquivo sinaliza correspondências.
- [ ] Falha parcial informa o que já foi gravado e permite retomar sem duplicação.

## C — Calendário financeiro e receitas recorrentes

### Comportamento esperado

- Exibir calendário mensal e agenda por dia com despesas fixas e recebimentos previstos, pagos/recebidos e vencidos.
- Cadastrar receitas recorrentes, como salário, com descrição, valor, categoria, data inicial e periodicidade mensal ou anual.
- Permitir pausar recorrência e confirmar recebimento com valor e data reais.
- Distinguir previsão de movimentação efetivada e mostrar o primeiro dia com saldo projetado negativo, quando houver.

### API e dados

- Modelar recorrência e ocorrências por período, com vínculo entre recebimento confirmado e transação de receita.
- Confirmar cada ocorrência uma única vez, com proteção contra concorrência. Agendamento por si só não cria receita realizada.
- Gerar ocorrências no intervalo consultado; limitar o horizonte e usar uma convenção explícita de data/fuso.
- Para dia 29, 30 ou 31 inexistente no mês, usar o último dia válido. Alterações da recorrência afetam ocorrências futuras, preservando recebimentos realizados.
- Evoluir a projeção para linha diária: saldo-base + receitas previstas acumuladas − despesas previstas acumuladas.
- Definir saldo-base como saldo acumulado de transações realizadas até o dia anterior ao início da projeção, apresentado como saldo registrado no aplicativo. O resumo mensal atual não deve ser confundido com saldo bancário disponível.
- Exibir pendências vencidas separadamente e considerar seu impacto uma única vez no início da projeção, explicitando essa premissa.
- Excluir previsões já efetivadas para não contar novamente a transação gerada.

### Frontend

- Adicionar calendário e alternativa em lista para telas pequenas.
- Permitir navegar entre meses, filtrar receitas/despesas e confirmar recebimento.
- Evoluir o card de projeção com detalhamento diário, premissas e indicação dos dias negativos.

### Critérios de aceite

- [ ] Receita mensal no dia 31 gera ocorrência válida em fevereiro.
- [ ] Confirmar duas vezes o mesmo recebimento cria apenas uma receita.
- [ ] Confirmar pagamento/recebimento troca previsão por realizado sem duplicar valores.
- [ ] Calendário inclui pendências e respeita limites de período e usuário.
- [ ] Projeção explica seu saldo-base e identifica corretamente o primeiro dia negativo.

## D — Metas com histórico de aportes

### Comportamento esperado

- Evoluir itens da wishlist para metas com valor desejado, prazo opcional e saldo reservado individual.
- Registrar aportes e retiradas com valor, data e observação, mantendo histórico.
- Mostrar valor restante, progresso e sugestão de aporte mensal para cumprir o prazo.
- Tratar aporte/retirada como reserva/liberação de dinheiro já existente: essas operações não são receitas ou despesas.

### API e dados

- Criar histórico de movimentos da meta e calcular saldo reservado pela soma de aportes menos retiradas e consumo na conclusão.
- Impedir retirada acima do saldo da meta; validar valores positivos e arredondamento monetário consistente.
- Calcular sugestão como valor restante dividido pelos meses de contribuição até o prazo, com convenção documentada e arredondamento para cima em centavos. Sem prazo, não sugerir valor mensal; prazo vencido exige revisão e não produz divisão inválida.
- Separar saldo financeiro, total reservado e saldo livre para evitar que o mesmo dinheiro apareça disponível para várias metas.
- Validar disponibilidade de novos aportes considerando todas as reservas, inclusive em requisições concorrentes. Despesas posteriores podem gerar insuficiência, que deve ser sinalizada sem apagar aportes.
- Encerrar o recálculo que sobrescreve todas as metas com a economia anual. Novas transações não alteram automaticamente o histórico de aportes.
- Migrar preservando nome, valor desejado e prazo; guardar o valor legado como referência, sem convertê-lo automaticamente em aporte.
- Solicitar distribuição inicial das reservas pelo usuário, sem replicar a economia anual em cada item. Manter o estado de migração identificável.

### Frontend

- Exibir saldo individual e histórico por meta, com ações de aportar e retirar.
- Explicar a transição do progresso antigo para reservas efetivas e permitir distribuir o saldo inicial.
- Atualizar progresso, saldo livre e projeções relacionadas após movimentações.

### Critérios de aceite

- [ ] Aporte de R$ 100 em uma meta altera apenas essa meta e o total reservado.
- [ ] Aportar/retirar não gera receita/despesa nem muda o saldo financeiro total.
- [ ] Retiradas e aportes concorrentes respeitam limites de saldo.
- [ ] Metas existentes não recebem aportes fictícios na migração.
- [ ] A sugestão mensal trata meta atingida, ausência de prazo e prazo vencido.

## E — Concluir compra da wishlist e gerar transação

### Comportamento esperado

- Adicionar ação “Concluir compra” ao item ativo.
- Abrir confirmação com valor efetivamente pago, data da compra, categoria de despesa e descrição sugerida a partir do nome.
- Após confirmar, gerar uma transação do tipo despesa e retirar o item da lista ativa.
- Preservar o item como concluído no histórico, com data e vínculo da transação. “Tirar da lista” significa sair dos objetivos ativos sem perder a rastreabilidade da compra.
- Atingir 100% da meta não conclui automaticamente uma compra. Excluir um objetivo sem comprar continua sendo uma ação distinta e não gera despesa.

### API e dados

- Persistir estado ativo/concluído, data da conclusão e identificador da transação gerada.
- Criar a despesa, consumir/liberar a reserva e concluir o item em uma única operação atômica.
- Proteger por usuário e garantir uma única conclusão mesmo com chamadas simultâneas ou repetidas.
- Usar valor real pago, que pode diferir do valor desejado. Permitir conclusão com reserva insuficiente, informando a diferença.
- Consumir da reserva no máximo o valor da compra e liberar eventual sobra; o item concluído fica sem reserva ativa.
- Não registrar uma segunda despesa pelo consumo do aporte: somente a transação de compra reduz o saldo financeiro.
- Preservar o vínculo e a consistência ao editar/excluir a transação vinculada; bloquear essas operações genéricas inicialmente e informar o motivo, até existir fluxo específico de correção.
- Em falha, manter o item ativo e não deixar despesa ou consumo de reserva parcial.

### Frontend

- Desabilitar envio enquanto a conclusão está em andamento e exibir feedback com acesso à transação criada.
- Remover da lista ativa somente após sucesso e disponibilizar filtro/histórico de concluídos.
- Atualizar wishlist, transações, dashboard, orçamento, comparativos e projeções afetadas.

### Critérios de aceite

- [ ] Concluir uma compra de R$ 500 cria uma única despesa de R$ 500 e remove o item da lista ativa.
- [ ] Cancelar o diálogo ou falhar a operação mantém o item e os valores anteriores.
- [ ] Clique duplo e repetição da requisição não geram despesas extras.
- [ ] Meta com R$ 600 reservados e compra de R$ 500 libera R$ 100, sem duplicar a despesa.
- [ ] Item concluído mantém histórico de aportes e vínculo com a transação.
- [ ] Excluir um objetivo sem concluir compra não gera transação; sua reserva é liberada.

## F — Simulador de compras

### Comportamento esperado

- Informar valor total a pagar, quantidade de parcelas e data da primeira parcela.
- Comparar cenário atual com cenário da compra mês a mês, considerando receitas recorrentes, despesas previstas e reservas/aportes planejados das metas.
- Mostrar valor de cada parcela, menor saldo projetado, primeiro período negativo e saldo livre após reservas.
- Permitir abrir o simulador a partir da wishlist com valor preenchido.

### API e cálculo

- Reutilizar a projeção do calendário e os saldos das metas, mantendo resultados determinísticos.
- Ratear centavos sem alterar o total: as parcelas somadas devem coincidir com o valor informado.
- Tratar o valor informado como total final a pagar, inclusive juros se houver; não estimar taxas de crédito.
- Diferenciar compromissos reais cadastrados, aportes apenas sugeridos e entradas manuais do cenário. Permitir incluir/desativar aportes sugeridos e mostrar a premissa.
- Reservas atuais reduzem saldo livre, não o saldo financeiro total; aportes futuros não devem virar despesas.
- Se a compra corresponde a uma meta existente, liberar/consumir a reserva dessa meta no cenário para não descontá-la duas vezes.
- Permitir informar compromissos parcelados existentes manualmente enquanto não houver módulo de cartões. Deixar explícito que parcelas não cadastradas não entram no cálculo.
- Simular sem criar transações, concluir metas ou modificar reservas.

### Frontend

- Exibir comparação antes/depois em tabela ou gráfico e permitir ajustar valor, parcelas e data.
- Apresentar hipóteses, período analisado e aviso de dados insuficientes quando faltar base para a projeção.
- Manter a conclusão efetiva da compra no fluxo E; a simulação não dispara a compra.

### Critérios de aceite

- [ ] Compra de R$ 600 em 6 vezes acrescenta R$ 100 a cada período correspondente.
- [ ] Divisões com centavos mantêm o total e vencimentos válidos.
- [ ] Cenário inclui receitas, despesas e metas sem duplicar previsões já realizadas.
- [ ] Alterar ou cancelar a simulação não modifica dados persistidos.
- [ ] Limitações sobre saldo registrado e compromissos não cadastrados ficam visíveis.

## Regras de entrega e validação

- Manter autenticação por cookie HTTP-only no frontend e chamadas autenticadas via Server Actions.
- Preservar criptografia de transações e definir proteção equivalente para novos dados financeiros sensíveis.
- Isolar leituras e mutações por usuário, inclusive lotes, regras, ocorrências e aportes.
- Planejar migrações compatíveis, backup e recuperação antes de alterar dados existentes.
- Publicar suporte na API antes de ativar interfaces dependentes.
- Na implementação, atualizar `docs/routes.md` e `docs/models.md` da API, `docs/api-routes.md` e `docs/doc.md` do frontend, além de modelos, schemas, actions, hooks e revalidações afetados.
- Documentar novas rotas como disponíveis apenas quando forem implementadas; este plano não é um contrato HTTP vigente.
- Validar regras monetárias, datas, concorrência e idempotência com testes proporcionais; verificar migração da wishlist, importação parcial e conclusão atômica.
- Validar interfaces em desktop/mobile com estados de carregamento, vazio, erro e sucesso.
- Marcar entregas como concluídas somente após implementação e validação dos critérios; atualizar as duas cópias deste plano.

## Fora desta rodada

- Sincronização bancária automática/Open Finance: o item B importa arquivos fornecidos pelo usuário.
- Gestão completa de contas, cartões, faturas e compras parceladas reais: o item F apenas simula parcelas.
- OCR de comprovantes, categorização por IA, recomendações de investimentos e compartilhamento familiar.
- Desfazer conclusão de compra por fluxo dedicado; a primeira entrega preserva o histórico e protege o vínculo.
