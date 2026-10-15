/**
 * Gera o vencimento da competência sem perder o dia original após meses curtos.
 * A âncora também impede ocorrências anteriores ao início da recorrência.
 */
export function dueInMonth(
  start: string,
  month: string,
  recurrence: string,
  anchorDay = Number(start.slice(8)),
): string | null {
  if (
    month < start.slice(0, 7) ||
    (recurrence === 'YEARLY' && month.slice(5) !== start.slice(5, 7))
  )
    return null;
  const [year, number] = month.split('-').map(Number);
  const day = Math.min(
    anchorDay,
    new Date(Date.UTC(year, number, 0)).getUTCDate(),
  );
  return `${month}-${String(day).padStart(2, '0')}`;
}
