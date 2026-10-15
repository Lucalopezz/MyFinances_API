import { once } from 'events';
import { DEFAULT_CATEGORIES } from 'src/modules/categories/domain/default-categories';
import { DecryptedTransaction } from 'src/modules/transactions/mappers/transaction-encryption.mapper';
import { TransactionPdfService } from 'src/modules/transactions/exports/generators/pdf/transaction-pdf.service';

const transaction = (
  overrides: Partial<DecryptedTransaction> = {},
): DecryptedTransaction => ({
  id: '64f000000000000000000010',
  userId: '64f000000000000000000001',
  type: 'EXPENSE',
  category: 'FOOD',
  description: 'Compra no mercado',
  value: 12.5,
  date: new Date('2026-07-06T00:00:00.000Z'),
  createdAt: new Date('2026-07-06T00:00:00.000Z'),
  updatedAt: new Date('2026-07-06T00:00:00.000Z'),
  ...overrides,
});

const renderedText = (spy: jest.SpyInstance): string =>
  spy.mock.calls.map(([text]) => text).join('\n');

async function finish(
  service: TransactionPdfService,
  document: PDFKit.PDFDocument,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = once(document, 'end');
  service.finalizeDocument(document);
  await ended;
  return Buffer.concat(chunks);
}

describe('TransactionPdfService', () => {
  it('renders every standard category in Portuguese even without a catalog', async () => {
    const service = new TransactionPdfService();
    const document = service.createDocument();
    const text = jest.spyOn(document, 'text');
    for (const category of DEFAULT_CATEGORIES) {
      service.addTransaction(document, transaction({ category: category.id }));
    }
    const content = await finish(service, document);

    expect(content.subarray(0, 4).toString()).toBe('%PDF');
    for (const category of DEFAULT_CATEGORIES) {
      expect(renderedText(text)).toContain(category.name);
      expect(text.mock.calls.some(([value]) => value === category.id)).toBe(
        false,
      );
    }
    expect(renderedText(text)).toContain('Alimentação');
    expect(renderedText(text)).toContain('Salário');
    expect(renderedText(text)).toContain('Cuidados Pessoais');
  });

  it('preserves custom names, localizes filters and handles unavailable categories', async () => {
    const service = new TransactionPdfService();
    const customId = '64f000000000000000000070';
    // O job recupera filtros persistidos em JSON, onde as datas voltam como
    // strings. O cast reproduz esse cenário sem esconder a conversão exigida
    // na renderização do cabeçalho, inclusive nas páginas seguintes.
    const document = service.createDocument(
      {
        format: 'PDF',
        startDate: '2026-07-01T00:00:00.000Z' as unknown as Date,
        endDate: '2026-07-31T00:00:00.000Z' as unknown as Date,
        type: 'EXPENSE',
        categoryId: customId,
      },
      [{ id: customId, name: 'Café especial' }],
    );
    const text = jest.spyOn(document, 'text');
    for (let index = 0; index < 30; index++) {
      service.addTransaction(document, transaction({ category: customId }));
    }
    service.addTransaction(
      document,
      transaction({ category: '64f000000000000000000099' }),
    );
    await finish(service, document);

    expect(renderedText(text)).toContain('Período: 01/07/2026 a 31/07/2026');
    expect(renderedText(text)).toContain(
      'Tipo: Despesa | Categoria: Café especial',
    );
    expect(renderedText(text)).toContain('Café especial');
    expect(renderedText(text)).toContain('Categoria indisponível');
    expect(renderedText(text)).not.toContain(customId);
    expect(renderedText(text)).not.toContain('64f000000000000000000099');
  });

  it('sums displayed amounts in cents and keeps separate documents independent', async () => {
    const service = new TransactionPdfService();
    const document = service.createDocument();
    const otherDocument = service.createDocument();
    const text = jest.spyOn(document, 'text');
    const otherText = jest.spyOn(otherDocument, 'text');
    // Estes valores expõem a diferença entre o arredondamento decimal do
    // Intl e Math.round(value * 100). O resumo deve somar 1,01 + 2,01 = 3,02
    // e descontar 0,11, exatamente como as quantias exibidas na tabela.
    service.addTransaction(
      document,
      transaction({ type: 'INCOME', value: 1.005 }),
    );
    service.addTransaction(
      document,
      transaction({ type: 'INCOME', value: 2.005 }),
    );
    service.addTransaction(document, transaction({ value: 0.105 }));
    service.addTransaction(otherDocument, transaction({ value: 1200 }));
    await finish(service, document);
    await finish(service, otherDocument);

    const result = renderedText(text).replace(/\u00a0/g, ' ');
    expect(result).toContain('3 transações exportadas');
    expect(result).toContain('R$ 3,02');
    expect(result).toContain('R$ 0,11');
    expect(result).toContain('R$ 2,91');
    expect(result).not.toContain('1.200,00');
    expect(renderedText(otherText).replace(/\u00a0/g, ' ')).toContain(
      '-R$ 1.200,00',
    );
  });

  it('exports an empty report with an explanation and zero totals', async () => {
    const service = new TransactionPdfService();
    const document = service.createDocument();
    const text = jest.spyOn(document, 'text');
    await finish(service, document);

    expect(renderedText(text)).toContain('Nenhuma transação encontrada');
    expect(renderedText(text)).toContain('0 transações exportadas');
    expect(
      text.mock.calls.filter(([value]) => value === 'R$\u00a00,00'),
    ).toHaveLength(3);
    expect(renderedText(text)).toContain('Página 1');
    expect(renderedText(text)).not.toContain('Página 2');
  });

  it('keeps a description longer than a page intact and repeats table headers', async () => {
    const service = new TransactionPdfService();
    const document = service.createDocument();
    const text = jest.spyOn(document, 'text');
    // A descrição ultrapassa uma página inteira. Reunir os fragmentos deve
    // recuperar o texto original, e a divisão não pode duplicar o lançamento
    // no resumo nem eliminar caracteres entre duas páginas.
    const description =
      'Descrição longa com acentuação e detalhes. '.repeat(160) + 'FIM';
    let pageCount = 1;
    document.on('pageAdded', () => pageCount++);
    service.addTransaction(document, transaction({ description }));
    const rowEnd = document.y;
    await finish(service, document);

    const fragments = text.mock.calls
      .filter(([, x]) => Number(x) === 114)
      .map(([value]) => value)
      .filter((value) => value !== 'Descrição');
    expect(fragments.join('')).toBe(description);
    expect(pageCount).toBeGreaterThan(1);
    expect(rowEnd).toBeLessThanOrEqual(document.page.height - 86);
    expect(
      text.mock.calls.filter(([value]) => value === 'Categoria').length,
    ).toBeGreaterThan(1);
    expect(renderedText(text)).toContain('1 transação exportada');
    for (let page = 1; page <= pageCount; page++) {
      expect(renderedText(text)).toContain(`Página ${page}`);
    }
  });
});
