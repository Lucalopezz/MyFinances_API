import {
  invoiceForPurchase,
  splitInstallments,
  annualFeeForCycle,
} from './card-calculation';

describe('credit card calculations', () => {
  it('splits cents without changing the purchase total', () => {
    expect(splitInstallments(10001, 3)).toEqual([3334, 3334, 3333]);
    expect(splitInstallments(30000, 3)).toEqual([10000, 10000, 10000]);
  });

  it('places a purchase on the current or next statement around closing day', () => {
    expect(invoiceForPurchase('2026-10-04', 5, 12, 0)).toEqual({
      cycle: '2026-10',
      dueDate: '2026-10-12',
    });
    expect(invoiceForPurchase('2026-10-05', 5, 12, 0)).toEqual({
      cycle: '2026-11',
      dueDate: '2026-11-12',
    });
    expect(invoiceForPurchase('2026-10-06', 5, 12, 2)).toEqual({
      cycle: '2027-01',
      dueDate: '2027-01-12',
    });
  });

  it('clamps closing and due dates at month end and supports due before closing', () => {
    expect(invoiceForPurchase('2026-01-30', 31, 5, 0)).toEqual({
      cycle: '2026-02',
      dueDate: '2026-02-05',
    });
    expect(invoiceForPurchase('2026-02-28', 31, 31, 0)).toEqual({
      cycle: '2026-04',
      dueDate: '2026-04-30',
    });
  });

  it('charges an annual fee once per anniversary cycle', () => {
    expect(annualFeeForCycle('2026-10', '2026-10', 12000)).toBe(12000);
    expect(annualFeeForCycle('2026-11', '2026-10', 12000)).toBe(0);
    expect(annualFeeForCycle('2027-10', '2026-10', 12000)).toBe(12000);
  });
});
