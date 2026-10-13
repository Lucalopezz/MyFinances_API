const months = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

type Period =
  | { startDate?: Date | null; endDate?: Date | null }
  | null
  | undefined;

/** Nome público com período e data de geração; o nome interno continua sendo o ID seguro. */
export function transactionExportFilename(
  extension: string,
  generatedAt: Date,
  filters?: Period,
) {
  // O dia de geração usa Brasília, assim como o cabeçalho do relatório.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(generatedAt);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  const generatedMonth = `${part('year')}-${part('month')}`;
  const start = filters?.startDate?.toISOString().slice(0, 7);
  const end = filters?.endDate?.toISOString().slice(0, 7);
  const monthLabel = (key: string) =>
    `${months[Number(key.slice(5)) - 1]}-${key.slice(0, 4)}`;
  const period =
    start && end
      ? start === end
        ? monthLabel(start)
        : `${monthLabel(start)}-a-${monthLabel(end)}`
      : monthLabel(start ?? end ?? generatedMonth);
  return `transacoes-${period}-gerado-em-${part('day')}-${part('month')}-${part('year')}.${extension}`;
}
