import { dayKey } from 'src/common/date/civil-date';

/** Deriva os limites do mês e o horizonte consultável usando a data financeira. */
export function calendarPeriod(month: string, today: string) {
  const [year, number] = month.split('-').map(Number);
  const distance =
    (year - Number(today.slice(0, 4))) * 12 +
    number -
    Number(today.slice(5, 7));
  return {
    withinHorizon: Math.abs(distance) <= 12,
    start: `${month}-01`,
    end: dayKey(new Date(Date.UTC(year, number, 0))),
    projectionStart: month === today.slice(0, 7) ? today : `${month}-01`,
  };
}
