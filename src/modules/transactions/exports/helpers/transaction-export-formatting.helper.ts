import { TransactionType } from '@prisma/client';
import {
  CategoryView,
  DEFAULT_CATEGORIES,
} from '../../../categories/domain/default-categories';
import { CreateTransactionExportDto } from '../dto/create-transaction-export.dto';

export type ExportCategoryCatalog = ReadonlyArray<
  Pick<CategoryView, 'id' | 'name'>
>;

// A tabela e os totais usam o mesmo arredondamento. PDF e XLSX compartilham
// também o catálogo, evitando diferenças na tradução de uma mesma categoria.
const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function buildExportCategoryNames(
  catalog: ExportCategoryCatalog = [],
): Map<string, string> {
  return new Map(
    [...DEFAULT_CATEGORIES, ...catalog].map(({ id, name }) => [id, name]),
  );
}

export function formatExportCategory(
  categoryNames: Map<string, string>,
  category: string,
): string {
  // Uma referência ausente não deve aparecer como código em inglês ou ID
  // técnico no relatório. Mantemos uma indicação legível sem inventar nome.
  return categoryNames.get(category) ?? 'Categoria indisponível';
}

export function formatExportType(type: TransactionType): string {
  return type === 'INCOME' ? 'Receita' : 'Despesa';
}

export function formatExportDate(date: Date): string {
  // As datas dos lançamentos são armazenadas em UTC. Exibi-las no fuso de
  // Brasília deslocaria uma data à meia-noite para o dia anterior.
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

export function formatExportDateTime(date: Date): string {
  // O horário de geração representa um instante, e não a data financeira
  // de um lançamento; por isso ele é mostrado no horário de Brasília.
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export function formatExportPeriod(
  filters?: CreateTransactionExportDto,
): string {
  if (!filters?.startDate && !filters?.endDate) return 'Todos os períodos';
  // Filtros recuperados do JSON persistido podem trazer datas como strings,
  // apesar do tipo do DTO. A conversão aceita os dois formatos em execução.
  const start = filters.startDate
    ? formatExportDate(new Date(filters.startDate))
    : 'início';
  const end = filters.endDate
    ? formatExportDate(new Date(filters.endDate))
    : 'hoje';
  return `${start} a ${end}`;
}

export function formatExportCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function exportValueInCents(value: number): number {
  // Usamos o arredondamento do mesmo Intl que desenha os valores:
  // 1.005 aparece como R$ 1,01, mas Math.round(1.005 * 100) produziria 100
  // por imprecisão binária. Juntar os dígitos formatados produz 101 centavos
  // e mantém os totais iguais à soma das quantias exibidas na tabela.
  const cents = Number(
    currencyFormatter
      .formatToParts(value)
      .filter(({ type }) => type === 'integer' || type === 'fraction')
      .map(({ value }) => value)
      .join(''),
  );
  // As partes numéricas não incluem o sinal; ele precisa ser reaplicado
  // para preservar o comportamento de registros com valores negativos.
  return value < 0 ? -cents : cents;
}
