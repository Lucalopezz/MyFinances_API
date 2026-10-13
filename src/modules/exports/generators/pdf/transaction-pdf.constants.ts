export const MARGIN = 40;
export const ROW_PADDING = 8;
export const TEXT_OPTIONS = { lineGap: 1 };
export const COLORS = {
  text: '#172b3a',
  muted: '#607080',
  border: '#dce4e8',
  background: '#f3f6f8',
  income: '#157347',
  expense: '#b42318',
};
// As larguras somam 515,28 pontos: a largura de uma página A4 menos as duas
// margens de 40 pontos. Cabeçalhos e células usam a mesma divisão para alinhar
// as colunas, independentemente de quantas linhas cada texto ocupar.
export const COLUMNS = [
  { label: 'Data', width: 66 },
  { label: 'Descrição', width: 176 },
  { label: 'Categoria', width: 114 },
  { label: 'Tipo', width: 57 },
  { label: 'Valor', width: 102.28 },
];

export function pdfContentWidth(document: PDFKit.PDFDocument): number {
  return document.page.width - 2 * MARGIN;
}

export function pdfContentBottom(document: PDFKit.PDFDocument): number {
  // A tabela termina antes do rodapé, que começa a 56 pontos da base.
  // Essa reserva evita que linhas ou cartões encostem na identificação.
  return document.page.height - 86;
}
