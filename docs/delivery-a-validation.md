# Validação da entrega A

> Relatório histórico: testes, contagens e limitações refletem a data da entrega. Consulte o [escopo atual](features.md) e o [changelog](../CHANGELOG.md) para o estado vigente.

Implementação concluída em 28/09/2026. API e frontend devem ser publicados nessa ordem.

## Verificações executadas

- API: `npm test -- --runInBand` — 12 suítes, 30 testes passando. Inclui catálogo legado, isolamento por usuário, criptografia de nomes/regras, categorias incompatíveis/arquivadas, renomeação/restauração, prioridade e desempate por ID, normalização de acentos, escolha explícita, teste de regra sem gravação, transações criptografadas, busca por nome, orçamento e bloqueio de novo pagamento com categoria arquivada.
- Exportação: geração efetiva de arquivos CSV/PDF com categoria padrão e personalizada, filtro por ID, CSV com referência estável e PDF com nome resolvido.
- `npm run build` passou nos dois repositórios. Front também validado com `npx tsc --noEmit`, pois sua configuração existente permite ignorar erros de tipo no build.
- ESLint passou nos arquivos TypeScript alterados da API. `npm run lint` do front solicita configurar ESLint interativamente; não há configuração funcional pronta no repositório.
- Chromium/Playwright com API local isolada, serviço real de categorias e repositório em memória: criar/editar/arquivar/restaurar categoria; criar/testar/editar/ativar/desativar/excluir regra; aplicar sugestão explicitamente; preservar escolha manual; impedir seleção de arquivada em novo lançamento; renomear sem perder vínculo da regra.
- Interface conferida em desktop (1440 px) e celular (390 px), incluindo formulário no tema escuro. Configurações sem overflow horizontal; estados vazios, confirmação e mensagens de sucesso foram exercitados.

## Limites da validação local

Não foi executado `prisma db push`, nem alteração em bancos existentes. Não havia MongoDB local em execução nem imagem `mongo:7` disponível para um container descartável. Os testes de persistência usam repositórios simulados; a validação com MongoDB real e a homologação do deploy permanecem operacionais.

O navegador também identificou um aviso preexistente de hidratação no `ThemeToggleButton` (ícone claro/escuro diferente entre servidor e cliente); ele não impediu os fluxos testados. O componente de tema não foi alterado nesta entrega.

O teste E2E legado em `test/app.e2e-spec.ts` ainda referencia um `src/app.module` inexistente e espera “Hello World!”; não representa a API atual e não foi usado como evidência desta entrega.

## Publicação

Seguir a seção de atualização de banco em `docs/models.md` da API: backup, `npx prisma generate`, sincronização aditiva do schema/índices via `npx prisma db push`, publicação da API e então do frontend. A importação CSV/OFX segue pertencendo à entrega B; seu motor de classificação já está disponível em `POST /categories/resolve`.
