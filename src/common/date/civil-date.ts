/** Chave civil UTC usada nos campos que já são persistidos como data normalizada. */
export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** O dia corrente financeiro segue São Paulo, independentemente do fuso do servidor. */
export function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Meio-dia UTC mantém a chave civil estável ao avançar um dia de calendário. */
export function nextDay(day: string): string {
  return dayKey(new Date(new Date(`${day}T12:00:00Z`).getTime() + 86400000));
}
