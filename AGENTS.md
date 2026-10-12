# AGENTS.md

Orientações para agentes de código trabalhando no backend MyFinances.

## Comentários e explicação da lógica

- O idioma padrão dos comentários explicativos é português em todo o projeto. Não misture explicações em inglês e português; ao alterar um trecho com comentários antigos em inglês, traduza essas explicações. Preserve nomes técnicos, identificadores, APIs e diretivas de ferramentas, como `eslint-disable` e `@ts-expect-error`.
- Ao implementar uma feature ou alterar uma regra, acrescente comentários em português explicando a lógica e o motivo da solução. Essa documentação faz parte da entrega.
- Mantenha o código bem comentado nos pontos de decisão: regras de negócio, cálculos financeiros, filtros, validações, paginação, criptografia, processamento assíncrono, tratamento de erros e integrações.
- Use JSDoc em serviços, funções e métodos que concentram uma funcionalidade para explicar sua responsabilidade, entradas relevantes e efeitos. Dentro deles, comente as etapas e decisões que precisam de contexto.
- Explique por que uma abordagem foi escolhida, quais condições ela considera e qual problema evita. Quando houver uma alternativa tentadora que produziria um comportamento incorreto, registre o motivo de não usá-la.
- Documente invariantes e detalhes pouco evidentes, como valores em centavos, datas em UTC, isolamento por usuário, consumo de memória, ordem de finalização de streams e compatibilidade entre formatos.
- Prefira comentários próximos ao trecho correspondente. Use blocos de poucas linhas para explicar o fluxo de uma feature e comentários menores para decisões específicas.
- Inclua exemplos curtos quando ajudarem a entender arredondamento, formatos de dados ou casos de borda.
- Nos testes, explique cenários e dados de entrada pouco evidentes e o comportamento que a regressão protege.
- Ao modificar uma implementação, revise seus comentários no mesmo momento para que continuem descrevendo o comportamento atual. Não deixe explicações antigas ou instruções de implementação já concluídas.
- Comentários devem acrescentar contexto: explique a regra e sua intenção, sem apenas repetir o nome do método ou narrar uma atribuição óbvia.

## Contexto e validação

- Consulte `README.md` e `docs/README.md` para localizar a documentação do domínio antes de alterar seu comportamento.
- Para exportações, consulte `docs/transaction-exports.md` e preserve o processamento em lotes e o isolamento dos dados do usuário.
- Use `npm`, pois o repositório mantém `package-lock.json`.
- Valide alterações de comportamento com os testes do domínio afetado e verificações proporcionais à mudança. Alterações apenas em comentários ou documentação exigem revisão do diff e da formatação; não precisam de novos testes nem de um build completo.
