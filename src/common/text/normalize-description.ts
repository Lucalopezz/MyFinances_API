/** Remove acentos e variações de caixa para classificação e deduplicação determinísticas. */
export function normalizeDescription(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}
