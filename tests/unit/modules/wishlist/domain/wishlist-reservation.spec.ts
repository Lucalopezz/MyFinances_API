import {
  completedAmounts,
  completionAmounts,
  movementViolation,
  reservationSummary,
} from 'src/modules/wishlist/domain/wishlist-reservation';

describe('Reservas da wishlist', () => {
  it('preserva aportes quando uma despesa torna o saldo livre negativo e ignora metas concluídas', () => {
    const summary = reservationSummary(
      [
        { type: 'INCOME', value: 100 },
        { type: 'EXPENSE', value: 60.01 },
      ],
      [{ id: 'ativa' }, { id: 'concluida', status: 'COMPLETED' }],
      [
        { wishlistItemId: 'ativa', kind: 'DEPOSIT', value: 50 },
        { wishlistItemId: 'concluida', kind: 'DEPOSIT', value: 100 },
      ],
    );
    expect(summary).toEqual({
      financialBalance: 39.99,
      totalReserved: 50,
      freeBalance: -10.01,
      insufficient: true,
    });
  });

  it('compara limites exatos em centavos sem liberar um aporte além do saldo', () => {
    expect(movementViolation('DEPOSIT', 0.3, 0, 0.1 + 0.2)).toBeNull();
    expect(movementViolation('DEPOSIT', 0.31, 0, 0.3)).toBe(
      'INSUFFICIENT_FREE_BALANCE',
    );
    expect(movementViolation('WITHDRAWAL', 10.01, 10, -100)).toBe(
      'RESERVATION_EXCEEDED',
    );
    expect(movementViolation('WITHDRAWAL', 10, 10, -100)).toBeNull();
  });

  it('libera sobras da compra e reconstrói o mesmo resultado pelo recibo', () => {
    const expected = {
      coveredAmount: 75.25,
      releasedAmount: 24.75,
      uncoveredAmount: 0,
    };
    expect(completionAmounts(100, 75.25)).toEqual(expected);
    expect(
      completedAmounts(
        [
          { kind: 'DEPOSIT', value: 100 },
          { kind: 'CONSUMPTION', value: 75.25 },
          { kind: 'RELEASE', value: 24.75 },
        ],
        75.25,
      ),
    ).toEqual(expected);
    expect(completionAmounts(20, 30.01)).toEqual({
      coveredAmount: 20,
      releasedAmount: 0,
      uncoveredAmount: 10.01,
    });
  });
});
