# Exportação assíncrona de transações

As exportações em PDF ou CSV são processadas pelo BullMQ dentro do mesmo processo da API NestJS. O Redis local pode ser iniciado com:

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

## Rotas

Todas as rotas exigem o mesmo Bearer token usado nas demais áreas da API.

- `POST /exports/transactions`: cria uma exportação e retorna `202 Accepted`. Aceita `startDate`, `endDate`, `categoryId`, `type` e `format` (`PDF` ou `CSV`, padrão `PDF`) como campos opcionais.
- `GET /exports/status`: consulta status, progresso e eventual erro seguro da exportação mais recente do usuário autenticado.
- `GET /exports/:id/download`: baixa PDF ou CSV quando o status for `COMPLETED`, com o content-type correspondente.

Como a categoria é criptografada com IV aleatório, esse filtro é aplicado durante a leitura em lotes, após a descriptografia. Período e tipo são filtrados diretamente no MongoDB por `dateIndex` e `type`.

CSV contém cabeçalho `id,date,type,category,description,value`, datas ISO e valores numéricos sem formatação local. O arquivo é UTF-8 com BOM para compatibilidade com planilhas; campos são escapados conforme CSV e textos que poderiam ser interpretados como fórmula recebem um apóstrofo inicial.

## Relatório PDF

O PDF usa datas em `pt-BR`, valores em reais e horário de geração de Brasília. O cabeçalho informa período, tipo e categoria selecionados; as categorias padrão aparecem em português e as personalizadas usam o nome do catálogo do usuário, inclusive quando arquivadas. Referências que não existem mais no catálogo aparecem como `Categoria indisponível`.

A tabela tem linhas alternadas, cores para receitas e despesas, cabeçalhos repetidos e numeração de páginas. Descrições longas continuam na página seguinte sem truncamento. Ao final, o resumo mostra a quantidade de transações exportadas, receitas, despesas e saldo (receitas menos despesas), calculados apenas sobre as transações que passaram pelos filtros. Exportações vazias exibem uma mensagem e totais zerados.

O relatório continua sendo escrito em fluxo, sem manter todas as transações ou páginas na memória.

## Abrir no Excel

Na tela de transações, selecione **Exportar transações → CSV para planilhas**. O arquivo pode ser aberto no Excel ou importado em **Dados → De Texto/CSV**, escolhendo UTF-8 e vírgula como delimitador. Não há exportação nativa em `.xlsx` no momento. O CSV mantém os identificadores de categoria e tipos originais para compatibilidade com importações.
