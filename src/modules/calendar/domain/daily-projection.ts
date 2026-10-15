import { nextDay } from 'src/common/date/civil-date';
import { toCents, fromCents } from 'src/common/money/money';
import { CalendarEvent, RealizedMovement } from '../types/calendar.types';

/**
 * Projeta o saldo registrado somando realizado e previsto em centavos, sem gravar dados.
 * Recebe datas civis YYYY-MM-DD, eventos sem duplicatas e transações até o fim do horizonte.
 * Pendências anteriores ao intervalo entram uma vez; cada dia retorna seu saldo de fechamento.
 */
export function dailyProjection(
  start: string,
  end: string,
  events: CalendarEvent[],
  actual: RealizedMovement[],
) {
  const signed = (v: number, type: string) =>
    toCents(v) * (type === 'INCOME' ? 1 : -1);
  // O saldo de abertura usa só os lançamentos anteriores ao início. Os do próprio
  // dia serão somados no laço, evitando contar uma mesma movimentação duas vezes.
  const base = actual
    .filter((t) => t.date < start)
    .reduce((n, t) => n + signed(t.value, t.type), 0);
  // Um evento liquidado já tem lançamento em actual, na data real do pagamento
  // ou recebimento. Sua data prevista não deve gerar um segundo impacto no saldo.
  const pending = events.filter((e) => e.status !== 'SETTLED');
  const overdue = pending.filter((e) => e.dueDate < start);
  // Carrega as pendências anteriores como premissa da projeção, sem repeti-las
  // em cada dia. overdueImpact permite separar esse efeito do saldo já realizado.
  let balance =
    base + overdue.reduce((n, e) => n + signed(e.amount, e.type), 0);
  const days: {
    date: string;
    balance: number;
    income: number;
    expense: number;
    realized: number;
  }[] = [];
  for (let date = start; date <= end; date = nextDay(date)) {
    const items = pending.filter((e) => e.dueDate === date);
    const income = items
      .filter((e) => e.type === 'INCOME')
      .reduce((n, e) => n + toCents(e.amount), 0);
    const expense = items
      .filter((e) => e.type === 'EXPENSE')
      .reduce((n, e) => n + toCents(e.amount), 0);
    const realized = actual
      .filter((t) => t.date === date)
      .reduce((n, t) => n + signed(t.value, t.type), 0);
    // income/expense representam previsões; realized é o líquido dos lançamentos
    // efetivos do dia. Mantemos centavos inteiros até montar a resposta em reais.
    balance += income - expense + realized;
    days.push({
      date,
      balance: fromCents(balance),
      income: fromCents(income),
      expense: fromCents(expense),
      realized: fromCents(realized),
    });
  }
  return {
    start,
    end,
    baseBalance: fromCents(base),
    overdueImpact: fromCents(
      overdue.reduce((n, e) => n + signed(e.amount, e.type), 0),
    ),
    projectedBalance: fromCents(balance),
    firstNegativeDate: days.find((d) => d.balance < 0)?.date ?? null,
    days,
  };
}
