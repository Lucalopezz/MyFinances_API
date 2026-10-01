# Validação da entrega B — importação CSV/OFX

Implementação e validação local em 29/09/2026, abrangendo API e frontend. Publicar API/schema antes da interface.

## Verificações executadas

- API: `npm test -- --runInBand` — 55 testes unitários passaram em 13 suítes. Inclui 25 casos novos de parser/schema, além da regressão de categorias, transações, orçamento e exportação. A suíte MongoDB opt-in fica ignorada sem variável própria.
- MongoDB 7 real, replica set descartável: `IMPORT_TEST_DATABASE_URL='mongodb://127.0.0.1:27028/?directConnection=true' npm run test:imports:integration` — 14 testes passaram. A suíte cria um banco aleatório, sincroniza o schema, testa os índices e remove somente esse banco no fim.
- Integração: prévia sem transação, criptografia, categoria padrão/personalizada, regras alteradas após prévia, sobrescrita manual e em lote, seleção, categorias arquivadas/incompatíveis/alheias, isolamento de lote, contexto de identificador externo, duplicatas e revalidação do histórico, cinco confirmações simultâneas, repetição depois de exclusão da transação, falha parcial e retomada, rollback quando falha o recibo, recálculo pendente, expiração/descarte e rotas HTTP autenticadas com limites de upload.
- Parser: CSV com vírgula/ponto e vírgula, BOM, UTF-8/Windows-1252, acentos, aspas escapadas, campos multilinha, valores negativos, separadores decimais e entrada/saída; OFX XML/SGML bancário/cartão, entidades básicas, FITID, datas, moeda não suportada e rejeição de layouts inválidos. Limites de bytes/colunas/registros e datas impossíveis são exercitados.
- Builds da API e do frontend passaram. Frontend também verificado por `tsc --noEmit` (o build existente ignora erros de tipos). ESLint passou nos arquivos TypeScript alterados da API.
- Chromium com frontend real, Server Actions, cookie HTTP-only e API local isolada usando os serviços/repositórios reais de importação em MongoDB: botão ao lado da exportação; envio CSV; categorias em lote respeitando tipo; possíveis duplicatas desmarcadas e aceite explícito; linha inválida bloqueada; confirmação dos totais; atualização de listagem/resumos; recuperação por `importBatch` depois de recarregar; falha transitória injetada em uma linha e retomada sem duplicação; importação OFX; descarte antes de confirmar sem alterar saldo; validação de arquivo vazio.
- Interface conferida em desktop (1440 px) e celular (390 px), incluindo botões da listagem, revisão longa paginada, resultado, tema escuro, confirmação e recuperação de prévia expirada. Dimensões do modal e rodapé sempre visível foram verificadas. Dados financeiros permanecem em memória; a URL contém somente o ID do lote.

## Limites e publicação

Nenhum banco existente de desenvolvimento ou produção foi modificado. `db push` foi executado somente em bancos aleatórios descartáveis. A homologação com extratos reais dos bancos usados pelo usuário e o deploy permanecem pendentes. Formatos aceitos são os documentados; não há suporte universal a variantes bancárias, conversão cambial ou Open Finance.

A idempotência é por lote/linha. Candidatos de outros lotes são sugestões: confirmações simultâneas de lotes diferentes podem não enxergar gravações ainda em andamento. O payload expira em 24h; a limpeza física depende da API/banco em funcionamento, executando na inicialização e a cada minuto. Recibos são preservados.

A API de navegação usada no teste visual fornece usuário/notificações/exportação de teste e simula o recálculo da wishlist; importação, categorias e transações usam serviços reais e persistência MongoDB. A suíte de integração verifica também a chamada e repetição do recálculo. O navegador reproduziu o aviso de hidratação preexistente do tema (React #418, já registrado na entrega A), sem impedir os fluxos de importação.

O E2E legado `test/app.e2e-spec.ts` da API continua fora destas evidências, pois referencia um módulo inexistente. O frontend não tem ESLint configurado para execução não interativa; build, TypeScript e navegação automatizada foram usados na validação.

Para publicação: backup do MongoDB e da chave financeira, `npx prisma generate`, revisão de mudanças e `npx prisma db push` no destino com replica set; verificar o índice único de recibos, publicar API, então frontend. Manter recibos e chave em eventual rollback. Consultar `docs/models.md` e `docs/transaction-imports.md` da API para detalhes operacionais.
