import {
  CalendarEvent,
  CalendarReceiptSnapshot,
} from '../types/calendar.types';

/**
 * Recibos substituem previsões da mesma competência, mesmo quando a data mudou.
 * Faturas são incorporadas por último para preservar seus identificadores atuais.
 */
export function calendarEvents(
  forecast: CalendarEvent[],
  receipts: CalendarReceiptSnapshot[],
  invoices: CalendarEvent[],
  end: string,
) {
  const events = new Map(forecast.map((event) => [event.id, event]));
  for (const receipt of receipts) {
    for (const [key, pending] of events)
      if (
        pending.sourceId === receipt.sourceId &&
        pending.periodKey === receipt.periodKey
      )
        events.delete(key);
    if (receipt.event.dueDate <= end)
      events.set(receipt.event.id, receipt.event);
  }
  for (const event of invoices) events.set(event.id, event);
  return [...events.values()].sort(
    (left, right) =>
      left.dueDate.localeCompare(right.dueDate) ||
      left.id.localeCompare(right.id),
  );
}
