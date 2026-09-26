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
