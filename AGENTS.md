# AGENTS.md

Orientações para agentes de código trabalhando no backend MyFinances.

## Comentários e explicação da lógica

- Escreva as explicações pensando em novos desenvolvedores, inclusive juniores que ainda não conhecem o domínio financeiro ou os fluxos do projeto. Explique os termos e as relações entre etapas quando esse contexto não estiver evidente no código.
- O idioma padrão dos comentários explicativos é português em todo o projeto. Não misture explicações em inglês e português; ao alterar um trecho com comentários antigos em inglês, traduza essas explicações. Preserve nomes técnicos, identificadores, APIs e diretivas de ferramentas, como `eslint-disable` e `@ts-expect-error`.
- Ao implementar uma feature ou alterar uma regra, acrescente comentários em português explicando a lógica e o motivo da solução. Essa documentação faz parte da entrega.
- Mantenha o código bem comentado nos pontos de decisão: regras de negócio, cálculos financeiros, filtros, validações, paginação, criptografia, processamento assíncrono, tratamento de erros e integrações.
- Use JSDoc em serviços, funções e métodos que concentram uma funcionalidade para explicar sua responsabilidade, entradas relevantes e efeitos. Dentro deles, comente as etapas e decisões que precisam de contexto.
- Explique por que uma abordagem foi escolhida, quais condições ela considera e qual problema evita. Quando houver uma alternativa tentadora que produziria um comportamento incorreto, registre o motivo de não usá-la.
- Documente invariantes e detalhes pouco evidentes, como valores em centavos, datas em UTC, isolamento por usuário, consumo de memória, ordem de finalização de streams e compatibilidade entre formatos.
- Prefira comentários próximos ao trecho correspondente. Use blocos de poucas linhas para explicar o fluxo de uma feature e comentários menores para decisões específicas.
- Em fluxos com várias etapas, documente a sequência principal e a divisão de responsabilidades entre controller, service, domínio, mapper e repository. Explique o que apenas consulta ou prevê valores, o que grava movimentações reais e quais gravações precisam ocorrer na mesma transação de banco.
- Inclua exemplos curtos quando ajudarem a entender arredondamento, formatos de dados ou casos de borda.
- Nos testes, explique cenários e dados de entrada pouco evidentes e o comportamento que a regressão protege.
- Ao modificar uma implementação, revise seus comentários no mesmo momento para que continuem descrevendo o comportamento atual. Não deixe explicações antigas ou instruções de implementação já concluídas.
- Ao trabalhar em código existente, acrescente o contexto que falta nas regras e decisões complexas do fluxo afetado. Não limite essa melhoria a arquivos novos nem faça refatorações sem relação com a tarefa para adicionar comentários.
- Comentários devem acrescentar contexto: explique a regra e sua intenção, sem apenas repetir o nome do método ou narrar uma atribuição óbvia.

## Contexto e validação

- Antes de finalizar, confira se as regras e decisões não evidentes da feature estão explicadas em português e se os comentários continuam corretos. Essa revisão faz parte da entrega, inclusive em alterações de código existente.
- Consulte `README.md` e `docs/README.md` para localizar a documentação do domínio antes de alterar seu comportamento.
- Para exportações, consulte `docs/transaction-exports.md` e preserve o processamento em lotes e o isolamento dos dados do usuário.
- Use `npm`, pois o repositório mantém `package-lock.json`.
- Valide alterações de comportamento com os testes do domínio afetado e verificações proporcionais à mudança. Alterações apenas em comentários ou documentação exigem revisão do diff e da formatação; não precisam de novos testes nem de um build completo.

## Testes e TDD

- Siga TDD em toda alteração de comportamento: escreva primeiro o teste, execute-o e confirme que falha pelo comportamento esperado (vermelho); implemente a menor mudança necessária para passar (verde); depois refatore mantendo os testes passando. Erros de compilação ou configuração não substituem a falha de comportamento.
- Toda correção de bug deve incluir um teste de regressão que reproduza o problema antes da correção e passe depois dela. Escolha a camada adequada; para problemas entre módulos ou no contrato HTTP, acrescente integração ou E2E.
- Ao ampliar a cobertura de comportamentos já existentes, escreva os testes antes de qualquer ajuste na implementação. Testes de caracterização podem passar de imediato; só altere o comportamento com uma expectativa apoiada nas regras do domínio.
- Todos os testes e seus auxiliares, fixtures e configurações devem ficar em `tests/` ou em uma pasta `__tests__`. Não coloque arquivos de teste junto do código de produção em `src/` nem crie a pasta singular `test/`.
- Organize as suítes por camada (`tests/unit`, `tests/integration`, `tests/e2e`) e preserve os caminhos dos módulos quando isso facilitar a localização. Unitários isolam dependências externas; integrações verificam componentes reais juntos; E2E exercitam os fluxos pela interface HTTP com autenticação e persistência reais.
- Bancos de testes devem ser locais, descartáveis e separados do banco da aplicação. Nunca use `DATABASE_URL` para escolher o banco a limpar. Finalize conexões, filas e arquivos temporários nas rotinas de encerramento.
- Execute as suítes afetadas antes de concluir e informe quais comandos passaram, eventuais impedimentos e testes não executados. Não apresente suítes ignoradas como validação realizada.
