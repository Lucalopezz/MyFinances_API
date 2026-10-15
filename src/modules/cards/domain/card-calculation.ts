/** Distribui os centavos restantes nas primeiras parcelas, preservando exatamente o total. */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < count ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 60
  )
    throw new Error('Valor ou número de parcelas inválido.');
  const base = Math.floor(totalCents / count);
  return Array.from(
    { length: count },
    (_, index) => base + (index < totalCents % count ? 1 : 0),
  );
}

/** Avança por mês mantendo a âncora original dos dias 29 a 31 em cada ciclo. */
function monthOffset(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

/** Ajusta só o mês consultado; fevereiro não altera a âncora dos meses seguintes. */
function dayInMonth(month: string, day: number) {
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
export const dueDateForCycle = dayInMonth;
/** Quando vencimento antecede o fechamento, a competência fecha no mês anterior. */
export function closingDateForCycle(
  cycle: string,
  closingDay: number,
  dueDay: number,
) {
  return dayInMonth(
    monthOffset(cycle, dueDay <= closingDay ? -1 : 0),
    closingDay,
  );
}

/** Compras no próprio dia do fechamento entram no ciclo seguinte. */
export function invoiceForPurchase(
  purchaseDate: string,
  closingDay: number,
  dueDay: number,
  installmentOffset: number,
) {
  const purchaseMonth = purchaseDate.slice(0, 7);
  const closingMonth =
    purchaseDate < dayInMonth(purchaseMonth, closingDay)
      ? purchaseMonth
      : monthOffset(purchaseMonth, 1);
  const dueMonth = monthOffset(
    closingMonth,
    (dueDay <= closingDay ? 1 : 0) + installmentOffset,
  );
  return { cycle: dueMonth, dueDate: dayInMonth(dueMonth, dueDay) };
}

/** A anuidade só se repete no mês de aniversário a partir da primeira competência. */
export function annualFeeForCycle(
  cycle: string,
  firstCycle: string,
  amountCents: number,
) {
  return cycle >= firstCycle && cycle.slice(5) === firstCycle.slice(5)
    ? amountCents
    : 0;
}
