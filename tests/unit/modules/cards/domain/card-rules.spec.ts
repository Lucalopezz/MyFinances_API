import { buildCardDetail, invoiceAnnualFee } from 'src/modules/cards/domain/card-invoices';
import {
  paidRefundCents,
  planPurchase,
  settlementItems,
  validateInvoicePayment,
  validatePurchase,
} from 'src/modules/cards/domain/card-rules';
import {
  Card,
  Installment,
  NewPurchase,
  Payment,
  Purchase,
} from 'src/modules/cards/types/cards.types';

const card: Card = {
  id: 'card',
  name: 'Principal',
  limitCents: 10000,
  annualFeeCents: 0,
  feeFirstCycle: '2026-01',
  closingDay: 5,
  dueDay: 12,
  archivedAt: null,
  revision: 0,
};
const input: NewPurchase = {
  description: 'Plano',
  amount: 300,
  installments: 3,
  date: '2026-01-01',
  category: 'OTHER',
};
const installment = (cycle: string, amountCents: number): Installment => ({
  id: cycle,
  purchaseId: 'purchase',
  number: 1,
  cycle,
  amountCents,
});
const purchase: Purchase = {
  id: 'purchase',
  purchaseDate: input.date,
  refundedAt: null,
  fixedExpenseId: null,
  fixedExpenseDueDate: null,
  description: 'Plano',
  amountCents: 30000,
  category: 'SHOPPING',
  installments: 3,
};
const payment: Payment = {
  cycle: '2026-01',
  date: '2026-01-06',
  amountCents: 10000,
  transactionIds: ['transaction'],
};

describe('regras financeiras de cartões', () => {
  it('valida o limite por fatura e não pelo valor inteiro da compra', () => {
    expect(
      planPurchase(card, input, [], []).map((entry) => entry.amount),
    ).toEqual([10000, 10000, 10000]);
    // A primeira parcela cabe; a segunda competência já contém outro compromisso.
    expect(() =>
      planPurchase(card, input, [installment('2026-02', 1)], []),
    ).toThrow('02/2026');
  });

  it('inclui anuidade na verificação e aceita exatamente o limite em centavos', () => {
    const terms = { ...card, annualFeeCents: 2500 };
    expect(
      planPurchase(terms, { ...input, amount: 75, installments: 1 }, [], [])[0]
        .amount,
    ).toBe(7500);
    expect(() =>
      planPurchase(terms, { ...input, amount: 75.01, installments: 1 }, [], []),
    ).toThrow('Limite insuficiente');
  });

  it('impede compra retroativa em qualquer fatura já liquidada', () => {
    expect(() =>
      planPurchase(card, input, [], [{ ...payment, cycle: '2026-02' }]),
    ).toThrow('já paga');
  });

  it('recusa parcelas abaixo de um centavo e datas futuras antes de planejar', () => {
    expect(() =>
      validatePurchase({ ...input, amount: 0.02 }, '2026-01-01'),
    ).toThrow('centavo');
    expect(() => validatePurchase(input, '2025-12-31')).toThrow('futuro');
  });

  it('mantém o centavo restante nas primeiras parcelas durante a liquidação', () => {
    const planned = planPurchase(card, { ...input, amount: 100.01 }, [], []);
    const rows = planned.map((entry, index) => ({
      ...installment(entry.cycle, entry.amount),
      number: index + 1,
    }));
    expect(settlementItems(rows, [purchase], 100)).toEqual([
      { amountCents: 3334, category: 'SHOPPING', description: 'Plano (1/3)' },
      { amountCents: 3334, category: 'SHOPPING', description: 'Plano (2/3)' },
      { amountCents: 3333, category: 'SHOPPING', description: 'Plano (3/3)' },
      {
        amountCents: 100,
        category: 'OTHER',
        description: 'Anuidade do cartão',
      },
    ]);
  });

  it('devolve somente parcelas pagas e preserva o saldo de compras sem pagamento', () => {
    const rows = [
      installment('2026-01', 3334),
      installment('2026-02', 3334),
      installment('2026-03', 3333),
    ];
    expect(paidRefundCents(rows, [payment])).toBe(3334);
    expect(paidRefundCents(rows, [])).toBe(0);
  });

  it('recusa fatura aberta e data anterior ao fechamento', () => {
    expect(() =>
      validateInvoicePayment(card, '2026-01', '2026-01-04', '2026-01-04'),
    ).toThrow('aberta');
    expect(() =>
      validateInvoicePayment(card, '2026-01', '2026-01-04', '2026-01-06'),
    ).toThrow('anterior');
    expect(() =>
      validateInvoicePayment(card, '2026-01', '2026-01-05', '2026-01-05'),
    ).not.toThrow();
  });

  it('preserva anuidade fechada no arquivamento e interrompe ciclos posteriores', () => {
    const archived = {
      ...card,
      annualFeeCents: 5000,
      archivedAt: new Date('2026-01-05T12:00:00Z'),
    };
    expect(invoiceAnnualFee(archived, '2026-01')).toBe(5000);
    expect(invoiceAnnualFee(archived, '2027-01')).toBe(0);
    expect(
      buildCardDetail(
        { card: archived, purchases: [], installments: [], payments: [] },
        '2026-10-14',
      ).invoices.map((invoice) => invoice.cycle),
    ).toEqual(['2026-01']);
  });

  it('usa a maior fatura pendente e mantém os recibos da fatura paga', () => {
    const detail = buildCardDetail(
      {
        card,
        purchases: [purchase],
        installments: [
          installment('2026-01', 3334),
          installment('2026-02', 3333),
        ],
        payments: [payment],
      },
      '2026-01-13',
    );
    expect(detail.used).toBe(33.33);
    expect(detail.available).toBe(66.67);
    expect(detail.invoices[0]).toMatchObject({
      status: 'PAID',
      paymentDate: payment.date,
      transactionIds: payment.transactionIds,
    });
  });
});
