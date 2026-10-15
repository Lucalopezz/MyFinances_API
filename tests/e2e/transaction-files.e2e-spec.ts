import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Workbook } from 'exceljs';
import { setTimeout as delay } from 'timers/promises';
import { TRANSACTION_EXPORT_QUEUE } from 'src/modules/transactions/exports/constants/exports.constants';
import { createTestApp, TestApp, TestUser } from '../support/test-app';

describe('Importação e exportação pela API com MongoDB e Redis reais', () => {
  let context: TestApp;
  let user: TestUser;
  let other: TestUser;
  const options = {
    format: 'CSV',
    encoding: 'utf-8',
    source: 'Banco de teste',
    csv: {
      delimiter: ';',
      dateFormat: 'YYYY-MM-DD',
      decimalSeparator: ',',
      header: true,
      columns: { date: 0, description: 1, value: 2 },
    },
  };
  const csv = Buffer.from(
    'data;descricao;valor\n2026-01-15;Mercado;-10,25\n2026-01-16;Salário;100,00\n',
  );

  beforeAll(async () => {
    context = await createTestApp();
  });
  beforeEach(async () => {
    user = await context.register();
    other = await context.register();
  });
  afterAll(async () => context?.close());

  const preview = () =>
    context
      .http()
      .post('/transaction-imports/preview')
      .auth(user.token, { type: 'bearer' })
      .field('options', JSON.stringify(options))
      .attach('file', csv, 'extrato.csv');

  it('recebe multipart, mostra prévia sem gravar e confirma cada linha só uma vez', async () => {
    const batch = await preview().expect(201);
    expect(batch.body.rows).toHaveLength(2);
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(0);
    const path = `/transaction-imports/${batch.body.batchId}`;
    await context
      .http()
      .get(path)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    const choices = {
      rows: [
        { rowId: 1, selected: true, category: 'FOOD' },
        { rowId: 2, selected: true, category: 'SALARY' },
      ],
    };
    const first = await context
      .http()
      .post(`${path}/confirm`)
      .auth(user.token, { type: 'bearer' })
      .send(choices)
      .expect(201);
    expect(first.body.summary).toEqual({
      imported: 2,
      ignored: 0,
      rejected: 0,
      pending: 0,
    });
    const second = await context
      .http()
      .post(`${path}/confirm`)
      .auth(user.token, { type: 'bearer' })
      .send(choices)
      .expect(201);
    expect(second.body.results).toEqual(first.body.results);
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(2);
    const balance = await context
      .http()
      .get('/transactions/balance')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(balance.body).toMatchObject({
      totalIncome: 100,
      totalExpense: 10.25,
      balance: 89.75,
    });
    const duplicated = await preview().expect(201);
    expect(duplicated.body.rows[0]).toMatchObject({
      selected: false,
      duplicates: [expect.objectContaining({ kind: 'HISTORY' })],
    });
  });

  it('cancelar a prévia impede confirmação e não cria transações', async () => {
    const batch = await preview().expect(201);
    const path = `/transaction-imports/${batch.body.batchId}`;
    await context
      .http()
      .delete(path)
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    await context
      .http()
      .post(`${path}/confirm`)
      .auth(user.token, { type: 'bearer' })
      .send({ rows: [{ rowId: 1, selected: true }] })
      .expect(410);
    const cancelled = await context
      .http()
      .get(path)
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(cancelled.body).toMatchObject({ expired: true, rows: [] });
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(0);
  });

  it('recusa options inválido, arquivo ausente e linha repetida na confirmação', async () => {
    await context
      .http()
      .post('/transaction-imports/preview')
      .auth(user.token, { type: 'bearer' })
      .field('options', '{invalid')
      .attach('file', csv, 'extrato.csv')
      .expect(400);
    await context
      .http()
      .post('/transaction-imports/preview')
      .auth(user.token, { type: 'bearer' })
      .field('options', JSON.stringify(options))
      .expect(400);
    const batch = await preview().expect(201);
    await context
      .http()
      .post(`/transaction-imports/${batch.body.batchId}/confirm`)
      .auth(user.token, { type: 'bearer' })
      .send({
        rows: [
          { rowId: 1, selected: true },
          { rowId: 1, selected: true },
        ],
      })
      .expect(400);
    expect(
      await context.db.transaction.count({ where: { userId: user.id } }),
    ).toBe(0);
  });

  it.each([
    ['CSV', 'text/csv', 'csv'],
    [
      'XLSX',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xlsx',
    ],
    ['PDF', 'application/pdf', 'pdf'],
  ])(
    'agenda %s, processa no worker e permite download só ao dono',
    async (format, contentType, extension) => {
      await context
        .http()
        .post('/transactions')
        .auth(user.token, { type: 'bearer' })
        .send({
          type: 'EXPENSE',
          value: 10.25,
          date: '2026-01-15',
          category: 'FOOD',
          description: 'Mercado exportado',
        })
        .expect(201);
      await context
        .http()
        .post('/transactions')
        .auth(other.token, { type: 'bearer' })
        .send({
          type: 'EXPENSE',
          value: 999,
          date: '2026-01-15',
          category: 'FOOD',
          description: 'Segredo de outra conta',
        })
        .expect(201);
      await context
        .http()
        .post('/transactions')
        .auth(user.token, { type: 'bearer' })
        .send({
          type: 'EXPENSE',
          value: 88,
          date: '2025-01-15',
          category: 'FOOD',
          description: 'Fora do período',
        })
        .expect(201);
      const created = await context
        .http()
        .post('/exports/transactions')
        .auth(user.token, { type: 'bearer' })
        .send({
          format,
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          type: 'EXPENSE',
        })
        .expect(202);
      expect(created.body).toMatchObject({ format, status: 'PENDING' });
      // Espera o estado persistido do worker com prazo definido; não depende de uma pausa fixa.
      const deadline = Date.now() + 15000;
      let status: string;
      do {
        const response = await context
          .http()
          .get('/exports/status')
          .auth(user.token, { type: 'bearer' })
          .expect(200);
        status = response.body.status;
        if (status === 'COMPLETED' || status === 'FAILED') break;
        await delay(50);
      } while (Date.now() < deadline);
      expect(status).toBe('COMPLETED');
      const path = `/exports/${created.body.id}/download`;
      await context
        .http()
        .get(path)
        .auth(other.token, { type: 'bearer' })
        .expect(404);
      const download = await context
        .http()
        .get(path)
        .auth(user.token, { type: 'bearer' })
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
          response.on('error', callback);
        })
        .expect(200);
      expect(download.headers['content-type']).toContain(contentType);
      expect(download.headers['content-disposition']).toContain(
        `.${extension}`,
      );
      const bytes = download.body as Buffer;
      if (format === 'CSV') {
        expect(bytes.toString('utf8')).toContain('Mercado exportado');
        expect(bytes.toString('utf8')).not.toMatch(/Segredo|Fora do período/);
      } else if (format === 'XLSX') {
        const workbook = new Workbook();
        await workbook.xlsx.load(bytes as never);
        const sheet = workbook.getWorksheet('Transações');
        expect(sheet.rowCount).toBe(2);
        expect(sheet.getCell('B2').value).toBe('Mercado exportado');
        expect(sheet.getCell('E2').value).toBe(10.25);
      } else {
        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(1000);
      }
    },
  );

  it('bloqueia download enquanto o job aguarda execução', async () => {
    const queue = context.app.get<Queue>(
      getQueueToken(TRANSACTION_EXPORT_QUEUE),
    );
    await queue.pause();
    try {
      const created = await context
        .http()
        .post('/exports/transactions')
        .auth(user.token, { type: 'bearer' })
        .send({ format: 'CSV' })
        .expect(202);
      await context
        .http()
        .get(`/exports/${created.body.id}/download`)
        .auth(user.token, { type: 'bearer' })
        .expect(409);
    } finally {
      await queue.resume();
    }
  });
});
