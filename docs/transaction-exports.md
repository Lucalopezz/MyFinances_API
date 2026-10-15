# Exportação assíncrona de transações

As exportações em PDF, CSV ou XLSX são processadas pelo BullMQ dentro do mesmo processo da API NestJS. O Redis local pode ser iniciado com:

```bash
docker compose up -d redis
```

Configure `REDIS_URL`, `EXPORT_STORAGE_PATH` e `TRANSACTION_EXPORT_BATCH_SIZE`. Em desenvolvimento, o diretório padrão é `./storage/exports`. Na Render, use:

```env
EXPORT_STORAGE_PATH=/tmp/exports
```

Depois de alterar o schema Prisma, sincronize o MongoDB e gere o client:

```bash
npx prisma db push
npx prisma generate
```

O armazenamento é local e efêmero. Na Render gratuita, os arquivos podem desaparecer quando a instância reiniciar ou quando ocorrer um novo deploy. Nesse caso, o download retorna uma mensagem informando que o arquivo não está mais disponível e uma nova exportação deve ser solicitada.

## Organização do módulo

`src/modules/transactions/exports` separa as responsabilidades do fluxo:

```text
exports/
├── exports.controller.ts          # Contrato HTTP e autenticação
├── exports.module.ts              # Composição das dependências do Nest
├── constants/                     # Fila, nomes de jobs e metadados dos formatos
├── dto/                          # Validação dos filtros e do formato
├── types/                         # Payload do job e contrato do escritor
├── repositories/                  # Persistência de status, progresso e arquivos
├── processors/                    # Coordenação do job, gravação e limpeza de falhas
├── services/                      # Agendamento/download, leitura em lotes e fábrica de escritores
├── helpers/                       # Categorias e formatação compartilhada
└── generators/
    ├── csv/                       # Serialização CSV e contrapressão do stream
    ├── pdf/                       # Documento, tabela paginada, layout e estado do relatório
    └── xlsx/                      # Documento, configuração de abas e tipos do writer
```

O processador controla as transições de status e só anuncia `COMPLETED` depois de confirmar a gravação. `TransactionExportReaderService` concentra paginação e filtro de categoria; `TransactionQueriesService` entrega os lotes descriptografados. `TransactionExportWriterFactory` escolhe o gerador e oferece as operações de adicionar lançamento, finalizar e cancelar; o leitor não precisa conhecer o documento específico de cada formato.

No PDF, o serviço mantém os totais e o ciclo do documento; a tabela mede e divide as células; o layout desenha identificação, resumo e rodapé. No XLSX, a configuração de abas e os tipos ficam separados da escrita das linhas. Os testes permanecem junto à implementação que verificam; casos de falha do processador têm arquivo próprio.

## Rotas

Todas as rotas exigem o mesmo Bearer token usado nas demais áreas da API.

- `POST /exports/transactions`: cria uma exportação e retorna `202 Accepted`. Aceita `startDate`, `endDate`, `categoryId`, `type` e `format` (`PDF`, `CSV` ou `XLSX`, padrão `PDF`) como campos opcionais.
- `GET /exports/status`: consulta status, progresso e eventual erro seguro da exportação mais recente do usuário autenticado.
- `GET /exports/:id/download`: baixa PDF, CSV ou XLSX quando o status for `COMPLETED`, com o content-type correspondente. XLSX usa `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` e extensão `.xlsx`.

Como a categoria é criptografada com IV aleatório, esse filtro é aplicado durante a leitura em lotes, após a descriptografia. Período e tipo são filtrados diretamente no MongoDB por `dateIndex` e `type`.

CSV contém cabeçalho `id,date,type,category,description,value`, datas ISO e valores numéricos sem formatação local. O arquivo é UTF-8 com BOM para compatibilidade com planilhas; campos são escapados conforme CSV e textos que poderiam ser interpretados como fórmula recebem um apóstrofo inicial.

## Relatório PDF

O PDF usa datas em `pt-BR`, valores em reais e horário de geração de Brasília. O cabeçalho informa período, tipo e categoria selecionados; as categorias padrão aparecem em português e as personalizadas usam o nome do catálogo do usuário, inclusive quando arquivadas. Referências que não existem mais no catálogo aparecem como `Categoria indisponível`.

A tabela tem linhas alternadas, cores para receitas e despesas, cabeçalhos repetidos e numeração de páginas. Descrições longas continuam na página seguinte sem truncamento. Ao final, o resumo mostra a quantidade de transações exportadas, receitas, despesas e saldo (receitas menos despesas), calculados apenas sobre as transações que passaram pelos filtros. Exportações vazias exibem uma mensagem e totais zerados.

O relatório continua sendo escrito em fluxo, sem manter todas as transações ou páginas na memória.

## Abrir no Excel

Na tela de transações, há três opções:

- **PDF para leitura e impressão**: relatório com resumo financeiro.
- **Abrir no Excel (.csv)**: arquivo de intercâmbio que também abre em outros programas de planilhas. No Excel, pode ser importado em **Dados → De Texto/CSV**, escolhendo UTF-8 e vírgula como delimitador. O CSV mantém os identificadores de categoria e tipos originais para compatibilidade com importações.
- **Excel nativo (.xlsx)**: planilha pronta para abrir diretamente no Excel, com dados e formatação nativos.

## Planilha Excel nativa

Solicite `POST /exports/transactions` com `{ "format": "XLSX" }` e, opcionalmente, os mesmos filtros de PDF/CSV. O job, o progresso, o isolamento por usuário e o download autenticado seguem o fluxo existente.

A aba **Transações** contém as colunas **Data, Descrição, Categoria, Tipo e Valor**. Datas são células de data em `dd/mm/yyyy`; valores são números com formato monetário em reais, permitindo ordenar e calcular no Excel. Categorias padrão são exibidas em português; personalizadas e arquivadas usam os nomes do catálogo do usuário. Nomes e descrições são texto literal, inclusive quando começam com `=`, sem gerar fórmulas.

O arquivo tem cabeçalho fixo, filtros nas colunas, linhas alternadas e configuração de impressão em A4 horizontal. Exportações vazias mantêm uma aba válida com as colunas. O ExcelJS escreve e libera cada linha em fluxo, sem carregar o histórico inteiro na memória. Ao atingir o limite de 1.048.576 linhas por aba, incluindo o cabeçalho, o arquivo continua em **Transações 2**, **Transações 3** etc. Descrições que excedem 32.767 caracteres fazem a exportação falhar, sem truncar os dados ou oferecer um arquivo parcial.

Na implantação, instale as dependências e regenere o Prisma Client com o schema atualizado, que inclui `XLSX` no enum `TransactionExportFormat`. Disponibilize o backend com suporte aos três formatos antes de publicar a nova opção no frontend.

## Nome do download

O arquivo baixado usa o mês e a data de geração, por exemplo `transacoes-outubro-2026-gerado-em-13-10-2026.pdf`. Com filtros de período, o nome usa o mês consultado ou os meses inicial e final; sem filtros, usa o mês de geração. CSV e XLSX seguem a mesma convenção. `GET /exports/status` retorna `downloadName`. O armazenamento interno mantém o ID por segurança; o conteúdo e o processamento em lotes permanecem iguais.
