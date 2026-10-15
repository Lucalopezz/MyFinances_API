export type PdfReportState = {
  categoryNames: Map<string, string>;
  period: string;
  generatedAt: string;
  filters: string;
  page: number;
  tableStart: number;
  count: number;
  incomeCents: number;
  expenseCents: number;
};
