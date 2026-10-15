/** Avança exatamente uma competência, mantendo o dia âncora e a hora UTC legada. */
export function nextExpenseDueDate(
  dueDate: Date,
  recurrence: 'MONTHLY' | 'YEARLY',
  anchorDay: number,
) {
  // Avança apenas um ciclo, preservando meses não pagos e o dia original 29/30/31.
  const month = dueDate.getUTCMonth() + (recurrence === 'MONTHLY' ? 1 : 12);
  const first = new Date(Date.UTC(dueDate.getUTCFullYear(), month, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      first.getUTCFullYear(),
      first.getUTCMonth(),
      Math.min(anchorDay, last),
      12,
    ),
  );
}
