import { z } from 'zod';

/** Valida uma data civil sem normalizar dias inexistentes, como 31 de fevereiro. */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return (
      !isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      v >= '2000-01-01' &&
      v <= '2100-12-31'
    );
  }, 'Data inválida.');
