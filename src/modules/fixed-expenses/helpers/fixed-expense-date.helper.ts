import { RecurrenceType } from '@prisma/client';
import { addDays, addMonths, addYears, startOfDay } from 'date-fns';

export class FixedExpenseDateHelper {
  static normalizeDate(date: Date | string) {
    return startOfDay(new Date(date));
  }

  static getNotificationDeadline(today: Date, windowInDays: number) {
    return addDays(this.normalizeDate(today), windowInDays);
  }

  static calculateNextDueDate(
    dueDate: Date,
    recurrence: RecurrenceType,
    referenceDate: Date,
  ) {
    let nextDueDate = this.normalizeDate(dueDate);
    const normalizedReferenceDate = this.normalizeDate(referenceDate);

    while (nextDueDate < normalizedReferenceDate) {
      nextDueDate =
        recurrence === RecurrenceType.MONTHLY
          ? addMonths(nextDueDate, 1)
          : addYears(nextDueDate, 1);
    }

    return nextDueDate;
  }
}
