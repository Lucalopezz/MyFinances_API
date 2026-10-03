# Importação de extratos CSV/OFX

Guia atual de formatos, prévia e confirmação. Consulte o [relatório histórico de validação](delivery-b-validation.md) para as evidências da implementação original. O botão “Importar” fica ao lado da exportação na tela de transações e abre o modal de revisão e confirmação. Todas as rotas `/transaction-imports` exigem `Authorization: Bearer <accessToken>` e usam exclusivamente o usuário do token.

## Limites e armazenamento

- Um arquivo por requisição, até **2 MiB (2.097.152 bytes)**, **1.000 registros** e **100 colunas**. Linhas vazias de CSV não contam; cabeçalho não conta como registro.
- Upload `multipart/form-data`: arquivo no campo `file` e um campo `options` contendo JSON (até 8 KiB). Não se usa nome/extensão/MIME para decidir o parser; `format` é obrigatório e o conteúdo é validado.
- UTF-8 (padrão, BOM opcional) ou Windows-1252, selecionado explicitamente. Não há detecção automática de codificação. UTF-16, bytes inválidos, arquivos vazios e caracteres de controle não suportados são rejeitados.
- Datas civis de `1900-01-01` a `9999-12-31`, persistidas à meia-noite UTC. Valor positivo de até R$ 9.999.999.999,99, precisão de até dois decimais, sem arredondar frações extras. O sinal determina o tipo; valor persistido é absoluto. Valor zero é rejeitado.
- Descrição obrigatória com até 2.000 caracteres; identificador externo opcional com até 200. Erro estrutural rejeita o arquivo; erros de dados são associados ao `rowId`, sem impedir prévia das outras linhas.
- O arquivo bruto permanece apenas na memória da requisição. O lote guarda somente registros normalizados e origem, criptografados com AES-256-GCM e a mesma `FINANCIAL_DATA_ENCRYPTION_KEY` das transações.
- A prévia expira **24 horas** após criação, sem renovação. Após expiração, consulta não retorna dados de linhas e confirmação retorna `410`. O processo da API apaga o payload criptografado ao iniciar e a cada minuto; se estiver parado ou sem banco, o descarte físico acontece na próxima execução bem-sucedida. O cancelamento apaga imediatamente o payload.
- Metadados do lote e recibos de resultado por linha permanecem para consulta/idempotência, inclusive após exclusão de uma transação. Backups têm seu próprio ciclo de retenção. Não há arquivos temporários em disco nem logs com dados financeiros.

## Prévia: `POST /transaction-imports/preview`

Retorna `201`; não cria transações. Para corrigir o mapeamento, envie novamente o arquivo com outras opções e descarte a prévia anterior.

Exemplo de `options` para CSV:

```json
{
  "format": "CSV",
  "encoding": "utf-8",
  "source": "meu-banco:conta-principal",
  "csv": {
    "delimiter": ";",
    "dateFormat": "DD/MM/YYYY",
    "decimalSeparator": ",",
    "header": true,
    "columns": { "date": 0, "description": 1, "value": 2, "category": 3, "externalId": 4 }
  }
}
```

`source` é obrigatório, tem de 1 a 120 caracteres e identifica uma origem estável (instituição/conta). Reutilize-o para extratos da mesma origem, inclusive de meses diferentes. Não use um identificador novo a cada arquivo. Dois bancos podem fornecer o mesmo identificador externo; o contexto de origem impede tratar isso como identidade global.

### CSV

Índices de coluna começam em zero e devem ser distintos. Não se exige um nome específico no cabeçalho.

- `delimiter`: `,`, `;` ou tabulação (`\t`). Aspas duplas, aspas escapadas como `""`, CRLF/LF e quebras de linha dentro de campos entre aspas são aceitas. Aspas não fechadas, texto após aspas fechadas e layout inconsistente são informados como erro.
- `dateFormat`: `YYYY-MM-DD`, `DD/MM/YYYY` ou `MM/DD/YYYY`. O dia precisa existir no calendário. Neste primeiro contrato CSV não aceita timestamp ISO completo: exportações atuais da API exigem converter a coluna de data para `YYYY-MM-DD` antes da importação.
- `decimalSeparator`: `,` aceita `1234,56` ou `1.234,56`; `.` aceita `1234.56` ou `1,234.56`. Não aceita símbolos de moeda, notação científica, parênteses contábeis ou precisão acima de centavos. Se o separador decimal for também o delimitador, o campo deve estar entre aspas.
- `header`: padrão `true`; use `false` para arquivos sem cabeçalho.
- `columns.date` e `columns.description`: obrigatórios.
- Valores: use `columns.value` (negativo = `EXPENSE`, positivo = `INCOME`) **ou** `columns.income` e `columns.expense` (valores não negativos, apenas um lado positivo; vazio/zero significa ausência). As opções são mutuamente exclusivas.
- `columns.type`: opcional somente com `value`, aceita `INCOME`/`EXPENSE`. Permite valores absolutos positivos em arquivos que já têm tipo. Valor negativo com `INCOME` é rejeitado.
- `columns.category`: opcional; recebe o **código/ID estável** do catálogo, não o nome visível. Campo vazio permite aplicar regras. Categoria desconhecida, arquivada, alheia ou de tipo incompatível fica com erro corrigível na confirmação.
- `columns.externalId`: opcional.

### OFX

Opções: `{ "format": "OFX", "encoding": "utf-8", "source": "meu-banco:conta-principal" }`.

Suporta um extrato bancário (`STMTRS`) ou de cartão (`CCSTMTRS`) por arquivo, com um `BANKTRANLIST`. Aceita XML com tags fechadas e SGML com cabeçalho `OFXHEADER:100` e fechamento omitido em campos de texto. Tags de agregados, inclusive `STMTTRN`, precisam ser fechadas. Tags sem atributos; profundidade máxima 32. DTD, CDATA, comentários, entidades externas e extensões de marcação não são suportados. Entidades XML básicas e referências numéricas são decodificadas sem acesso à rede.

- `CURDEF` obrigatório e igual a `BRL`. Campos `CURRENCY`/`ORIGCURRENCY` de uma movimentação também precisam indicar `CURSYM: BRL`; caso contrário a linha é rejeitada. Não há conversão de moeda.
- `ACCTID` obrigatório; `BANKID`, `BRANCHID` e `ACCTTYPE`, quando presentes, compõem o contexto de origem junto com `source`. Esses dados ficam criptografados.
- `DTPOSTED` obrigatório, `YYYYMMDD` ou `YYYYMMDDHHmmss[.fração][offset:fuso]`. Preserva o dia escrito pelo banco; não desloca o dia por conversão de fuso.
- `TRNAMT` obrigatório, sinal e decimal com ponto. O sinal determina receita/despesa.
- A descrição combina `NAME` e `MEMO` com ` - `; ao menos um deve estar preenchido.
- `FITID` vira identificador externo quando presente. A ausência não impede importação.

### Resposta de prévia

```json
{
  "batchId": "64f000000000000000000010",
  "expiresAt": "2026-09-29T12:00:00.000Z",
  "rows": [
    {
      "rowId": 1,
      "date": "2026-09-28",
      "description": "Uber viagem",
      "value": 25.5,
      "type": "EXPENSE",
      "category": "TRANSPORT",
      "categorySource": "rule",
      "ruleId": "64f000000000000000000020",
      "externalId": "123",
      "errors": [],
      "duplicates": [],
      "selected": true
    }
  ]
}
```

`rowId` é a posição do registro (base 1) após remover cabeçalho/linhas vazias; não é número da linha física quando há campos multilinha. Campos indisponíveis em registros inválidos podem estar ausentes. `errors` contém mensagens por linha; `categoryError` indica erro corrigível pelo seletor de categoria. Nunca há campos criptografados na resposta.

Prioridade: categoria explícita no arquivo/confirmação → primeira regra ativa por prioridade/ID → `OTHER` para despesa ou `OTHER_INCOME` para receita. `categorySource` é `manual`, `rule`, `default` ou `null` em erros. Regras são carregadas uma vez por requisição e reavaliadas na confirmação; envie `category` para preservar uma escolha explícita da revisão.

`duplicates` contém sugestões `{ kind: "FILE", rowId, reason }` ou `{ kind: "HISTORY", transactionId, reason }`. `reason` é `EXTERNAL_ID` (mesma origem + ID) ou `FINGERPRINT` (data, centavos, tipo e descrição sem diferenças de caixa, acentos ou espaços repetidos). Retorna até 20 candidatos de cada contexto por linha. Duas compras legítimas podem coincidir. Linhas com erro ou suspeitas começam com `selected: false`. Para pares repetidos dentro do arquivo, ambas começam desmarcadas.

O histórico é percorrido em páginas de 200 registros do usuário, descriptografando no servidor; o custo depende do tamanho do histórico. A identidade externa fica criptografada na transação e continua disponível após expiração da prévia. Alterar a transação não apaga essa identidade; excluir a transação remove-a da busca de candidatos.

## Confirmação: `POST /transaction-imports/:id/confirm`

JSON, limite de corpo 256 KiB:

```json
{
  "rows": [
    { "rowId": 1, "selected": true, "category": "TRANSPORT", "allowDuplicate": false },
    { "rowId": 2, "selected": false },
    { "rowId": 3, "selected": true, "category": "FOOD", "allowDuplicate": true }
  ]
}
```

Até 1.000 decisões sem `rowId` repetido. Linha omitida equivale a desmarcada, exceto se já importada, caso em que seu recibo é preservado. `category` é opcional e `allowDuplicate` tem padrão `false`. Para correção em lote, envie a mesma categoria nas decisões das linhas desejadas. Data, valor, tipo, descrição e usuário não podem ser sobrescritos pelo cliente; campos extras retornam `400`.

O servidor usa o payload criptografado do lote, revalida dados e categorias e consulta novamente candidatos no histórico. Suspeitas sem `allowDuplicate: true` são ignoradas com motivo. Categorias inválidas e erros de dados rejeitam somente a linha. Cada transação e seu recibo são gravados na **mesma transação MongoDB**, protegidos por índice único `(userId, batchId, rowId)`. Conflitos concorrentes são repetidos até quatro tentativas; pendências podem ser reenviadas. A confirmação não é atômica para o lote inteiro: falhas preservam linhas já gravadas.

Retorna `201`, inclusive quando há rejeições ou pendências:

```json
{
  "batchId": "64f000000000000000000010",
  "results": [
    { "rowId": 1, "status": "IMPORTED", "reason": null, "transactionId": "64f000000000000000000030" },
    { "rowId": 2, "status": "IGNORED", "reason": "NOT_SELECTED", "transactionId": null },
    { "rowId": 3, "status": "PENDING", "reason": "RETRY_REQUIRED", "transactionId": null }
  ],
  "summary": { "imported": 1, "ignored": 1, "rejected": 0, "pending": 1 },
  "recalculationPending": false
}
```

Estados: `IMPORTED`, `IGNORED`, `REJECTED` e `PENDING`. Motivos: `NOT_SELECTED`, `DUPLICATE_REQUIRES_APPROVAL`, `INVALID_CATEGORY`, `INVALID_ROW`, `RETRY_REQUIRED`, `EXPIRED_OR_CANCELLED`; a consulta também usa `NOT_PROCESSED` quando ainda não há recibo. Mensagens financeiras e erros internos não são persistidos como motivo.

`summary.imported` conta todos os recibos importados do lote, inclusive de chamadas anteriores. Não somar esse valor a cada tentativa. `IMPORTED` é definitivo: repetir com outra categoria ou depois de excluir a transação não recria/altera o lançamento. `IGNORED` e `REJECTED` podem ser corrigidos e reenviados enquanto a prévia estiver válida. Após timeout ou conexão interrompida, consultar o lote e repetir a mesma confirmação é seguro.

Usa o mapper de criptografia existente e recalcula a wishlist ao fim da confirmação. Se o recálculo falhar, `recalculationPending: true`; repetir confirmação com o mesmo lote tenta novamente sem duplicar lançamentos. Dashboard, comparativos e orçamento passam a incluir transações nas próximas leituras. Não existe recálculo da wishlist agendado após expiração: resolver pendências antes de 24h.

Idempotência é por **lote e linha**, não por arquivo em todos os lotes. Reenviar o arquivo cria outra prévia e sinaliza correspondências; a busca de candidatos não é uma restrição única global. Confirmações simultâneas de lotes diferentes podem não enxergar gravações ainda não confirmadas. Cancelamento concorrente preserva linhas já concluídas e impede novas gravações após sua efetivação.

## Consulta e descarte

- `GET /transaction-imports/:id`: `200` com `batchId`, `expiresAt`, `expired`, `rows`, `results`, `summary`. Enquanto válida, reavalia regras e candidatos; após expiração/cancelamento, `rows: []`, mantendo recibos e pendências operacionais. Consultar não cria transações nem renova o prazo. Na interface, recibos `IMPORTED` devem ficar bloqueados para nova seleção.
- `DELETE /transaction-imports/:id`: `200`, descarta prévia sem apagar transações já importadas. Cancelar antes da confirmação não movimenta valores.
- `401`: sem autenticação. `404`: lote inexistente, ID inválido ou outro usuário. `410`: confirmação de prévia expirada/cancelada. `413`: upload/corpo maior que o limite. `400`: opções, layout ou JSON inválido, moeda não suportada, codificação incompatível ou linha desconhecida.

## Publicação e teste

Antes de ativar: backup do banco e da chave, `npx prisma generate`, revisão e execução de `npx prisma db push` no destino. Requer MongoDB com replica set (incluindo Atlas). A sincronização é aditiva: duas coleções, índices e um campo opcional na transação; não há backfill de registros antigos. Ver [modelos](models.md).

Validação de parser: `npm test -- --runInBand`. Integração opt-in com MongoDB local descartável:

```bash
IMPORT_TEST_DATABASE_URL='mongodb://127.0.0.1:27028/?directConnection=true' npm run test:imports:integration
```

A suíte só aceita host local, cria um banco com nome aleatório, aplica o schema e apaga somente esse banco ao terminar; ignora `DATABASE_URL` do projeto. Sem a variável, a suíte de integração fica ignorada. Evidências: [validação da entrega B](delivery-b-validation.md).
