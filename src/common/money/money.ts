/** Normaliza valores da API em centavos antes de somar, comparar ou parcelar. */
export const toCents = (value: number): number => Math.round(value * 100);

/** Converte o resultado em centavos para o contrato monetário existente da API. */
export const fromCents = (value: number): number => value / 100;
