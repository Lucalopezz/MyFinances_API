import { BadRequestException } from '@nestjs/common';
import { TextDecoder } from 'util';
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  ImportOptions,
  ImportPayload,
  ImportRow,
} from './import.dto';

function invalid(message: string): never {
  throw new BadRequestException(message);
}

export function parseStatement(
  buffer: Buffer,
  options: ImportOptions,
): ImportPayload {
  if (!buffer?.length) invalid('Selecione um arquivo não vazio.');
  if (buffer.length > IMPORT_MAX_BYTES) invalid('O arquivo excede 2 MiB.');
  let content: string;
  try {
    content = new TextDecoder(options.encoding, { fatal: true }).decode(buffer);
  } catch {
    invalid('Codificação inválida. Selecione UTF-8 ou Windows-1252.');
  }
  content = content.replace(/^\uFEFF/, '');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(content))
    invalid('Codificação ou conteúdo não suportado.');
  return options.format === 'CSV'
    ? parseCsv(content, options)
    : parseOfx(content, options.source);
}

// Strict decimal grammar: grouping must be in groups of three; never guess locale.
export function parseMoney(raw: string, decimal: ',' | '.'): number {
  const text = raw.trim();
  const pattern =
    decimal === ','
      ? /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/
      : /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!pattern.test(text))
    throw new Error('Valor inválido para o formato decimal selecionado.');
  const normalized = text
    .split(decimal === ',' ? '.' : ',')
    .join('')
    .replace(',', '.');
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 999999999999)
    throw new Error('Valor fora do limite permitido.');
  return cents / 100;
}

export function parseCalendarDate(raw: string, format: string): string {
  const text = raw.trim();
  let iso: string;
  if (format === 'YYYY-MM-DD') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Data inválida.');
    iso = text;
  } else {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (!match) throw new Error('Data inválida.');
    iso = `${match[3]}-${format === 'DD/MM/YYYY' ? match[2] : match[1]}-${format === 'DD/MM/YYYY' ? match[1] : match[2]}`;
  }
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (
    iso < '1900-01-01' ||
    iso > '9999-12-31' ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  )
    throw new Error('Data inválida.');
  return iso;
}

function csvRecords(content: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = '';
    closed = false;
    if (row.length > 100) invalid('CSV excede 100 colunas.');
  };
  const pushRow = () => {
    pushCell();
    if (row.some((v) => v.trim())) records.push(row);
    row = [];
    if (records.length > IMPORT_MAX_ROWS + 1)
      invalid('Arquivo excede 1000 registros.');
  };
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (quoted) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === delimiter) pushCell();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && content[i + 1] === '\n') i++;
      pushRow();
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === '"' || closed)
      invalid('CSV malformado: aspas ou delimitador inválidos.');
    else cell += c;
  }
  if (quoted) invalid('CSV malformado: aspas não fechadas.');
  if (cell || row.length || closed) pushRow();
  return records;
}

function normalizeRow(
  rowId: number,
  read: () => Omit<ImportRow, 'rowId' | 'errors'>,
): ImportRow {
  try {
    const row = read();
    if (!row.description?.trim() || row.description.length > 2000)
      throw new Error('Descrição obrigatória, com até 2000 caracteres.');
    if (!row.value) throw new Error('O valor deve ser diferente de zero.');
    if (row.externalId?.length > 200)
      throw new Error('Identificador externo excede 200 caracteres.');
    if (row.category?.length > 60)
      throw new Error('Referência de categoria inválida.');
    return { rowId, ...row, errors: [] };
  } catch (error) {
    return { rowId, errors: [error.message] };
  }
}

function parseCsv(content: string, options: ImportOptions): ImportPayload {
  const csv = options.csv;
  const records = csvRecords(content, csv.delimiter);
  const width = records[0]?.length;
  if (csv.header) records.shift();
  if (!records.length) invalid('O arquivo não contém registros.');
  if (records.length > IMPORT_MAX_ROWS)
    invalid('Arquivo excede 1000 registros.');
  if (Math.max(...Object.values(csv.columns)) >= width)
    invalid('Mapeamento aponta para coluna inexistente.');
  const rows = records.map((cells, index) =>
    normalizeRow(index + 1, () => {
      if (cells.length !== width)
        throw new Error('Quantidade de colunas diferente do layout.');
      const c = csv.columns;
      let signed: number;
      if (c.value !== undefined)
        signed = parseMoney(cells[c.value], csv.decimalSeparator);
      else {
        const income = cells[c.income].trim()
          ? parseMoney(cells[c.income], csv.decimalSeparator)
          : 0;
        const expense = cells[c.expense].trim()
          ? parseMoney(cells[c.expense], csv.decimalSeparator)
          : 0;
        if (income < 0 || expense < 0 || (income > 0 && expense > 0))
          throw new Error(
            'Entrada/saída devem ser positivas e apenas uma deve estar preenchida.',
          );
        signed = income - expense;
      }
      const explicitType =
        c.type === undefined ? undefined : cells[c.type].trim();
      if (
        explicitType !== undefined &&
        explicitType !== 'INCOME' &&
        explicitType !== 'EXPENSE'
      )
        throw new Error('Tipo deve ser INCOME ou EXPENSE.');
      if (explicitType && c.value === undefined)
        throw new Error('Coluna tipo exige coluna valor.');
      if (explicitType && signed < 0 && explicitType !== 'EXPENSE')
        throw new Error('Tipo incompatível com valor negativo.');
      return {
        date: parseCalendarDate(cells[c.date], csv.dateFormat),
        description: cells[c.description].trim(),
        value: Math.abs(signed),
        type:
          (explicitType as ImportRow['type']) ??
          (signed < 0 ? 'EXPENSE' : 'INCOME'),
        category:
          c.category === undefined
            ? undefined
            : cells[c.category].trim() || undefined,
        externalId:
          c.externalId === undefined
            ? undefined
            : cells[c.externalId].trim() || undefined,
      };
    }),
  );
  return { source: options.source, rows };
}

type OfxNode = { name: string; text: string; children: OfxNode[] };
function decodeEntities(text: string): string {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return text.replace(/&([^;\s]+);/g, (_, key: string) => {
    if (key in entities) return entities[key];
    const number = /^#\d+$/.test(key)
      ? Number(key.slice(1))
      : /^#x[\da-f]+$/i.test(key)
        ? parseInt(key.slice(2), 16)
        : NaN;
    if (
      !Number.isInteger(number) ||
      number < 32 ||
      number > 0x10ffff ||
      (number >= 0xd800 && number <= 0xdfff)
    )
      invalid('Entidade OFX não suportada.');
    return String.fromCodePoint(number);
  });
}

function parseOfx(content: string, source: string): ImportPayload {
  if (/<!/i.test(content))
    invalid('OFX com DTD, entidades ou declarações não suportadas.');
  const start = content.search(/<OFX\s*>/i);
  if (start < 0) invalid('Layout OFX inválido.');
  const header = content.slice(0, start);
  const sgml = /OFXHEADER:\s*100/i.test(header);
  if (!sgml && header.replace(/<\?[\s\S]*?\?>/g, '').trim())
    invalid('Cabeçalho OFX não suportado.');
  const root: OfxNode = { name: 'ROOT', text: '', children: [] };
  const stack = [root];
  for (const token of content.slice(start).match(/<[^>]*>|[^<]+|</g) ?? []) {
    let current = stack[stack.length - 1];
    if (!token.startsWith('<')) {
      current.text += token;
      continue;
    }
    const match = /^<(\/?)([A-Z][A-Z0-9_.]*)(\/?)\s*>$/i.exec(token);
    if (!match) invalid('Marcação OFX não suportada.');
    const name = match[2].toUpperCase();
    if (
      sgml &&
      current.text.trim() &&
      !current.children.length &&
      (match[1] !== '/' || current.name !== name)
    ) {
      stack.pop();
      current = stack[stack.length - 1];
    }
    if (match[1]) {
      if (current.name !== name || stack.length === 1)
        invalid('OFX malformado: fechamento inválido.');
      stack.pop();
    } else {
      if (current.text.trim()) invalid('OFX contém texto fora de um campo.');
      const node = { name, text: '', children: [] };
      current.children.push(node);
      if (!match[3]) stack.push(node);
      if (stack.length > 32) invalid('OFX excede a profundidade permitida.');
    }
  }
  if (stack.length !== 1 || root.text.trim() || root.children.length !== 1)
    invalid('OFX incompleto ou malformado.');
  const all: OfxNode[] = [],
    pending = [...root.children];
  while (pending.length) {
    const node = pending.pop();
    all.push(node);
    pending.push(...node.children);
  }
  const statements = all.filter(
    (n) => n.name === 'STMTRS' || n.name === 'CCSTMTRS',
  );
  if (statements.length !== 1)
    invalid('Envie um único extrato bancário ou de cartão por arquivo.');
  const field = (nodes: OfxNode[], name: string, required = false) => {
    const found = nodes.filter((n) => n.name === name);
    if (
      found.length > 1 ||
      (required && found.length !== 1) ||
      found.some((n) => n.children.length)
    )
      throw new Error(`Campo OFX ${name} inválido ou ausente.`);
    return decodeEntities(found[0]?.text.trim() ?? '');
  };
  let identity: string;
  try {
    if (field(all, 'CURDEF', true) !== 'BRL')
      invalid('Moeda não suportada. Apenas BRL é aceita.');
    identity = JSON.stringify([
      source,
      field(all, 'BANKID'),
      field(all, 'BRANCHID'),
      field(all, 'ACCTID', true),
      field(all, 'ACCTTYPE'),
    ]);
  } catch (error) {
    invalid(error.message);
  }
  // Preserve statement order (the iterative traversal above is only for scalar lookup).
  const lists = all.filter((n) => n.name === 'BANKTRANLIST');
  if (lists.length !== 1) invalid('Lista de movimentações OFX inválida.');
  const transactions = lists[0].children.filter((n) => n.name === 'STMTTRN');
  if (transactions.length !== all.filter((n) => n.name === 'STMTTRN').length)
    invalid('Movimentação fora da lista OFX.');
  if (!transactions.length || transactions.length > IMPORT_MAX_ROWS)
    invalid('OFX deve conter entre 1 e 1000 registros.');
  return {
    source: identity,
    rows: transactions.map((node, index) =>
      normalizeRow(index + 1, () => {
        for (const currency of node.children.filter((child) =>
          ['CURRENCY', 'ORIGCURRENCY'].includes(child.name),
        )) {
          if (field(currency.children, 'CURSYM', true) !== 'BRL')
            throw new Error(
              'Moeda da movimentação não suportada. Apenas BRL é aceita.',
            );
        }
        const rawDate = field(node.children, 'DTPOSTED', true);
        if (
          !/^\d{8}(?:\d{6}(?:\.\d+)?(?:\[[+-]?\d+(?:\.\d+)?:[A-Z]+\])?)?$/.test(
            rawDate,
          )
        )
          throw new Error('Data OFX inválida.');
        const date = parseCalendarDate(
          `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
          'YYYY-MM-DD',
        );
        const amount = field(node.children, 'TRNAMT', true);
        if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(amount))
          throw new Error('Valor OFX inválido.');
        const signed = parseMoney(amount, '.');
        return {
          date,
          value: Math.abs(signed),
          type: signed < 0 ? 'EXPENSE' : 'INCOME',
          description: [
            field(node.children, 'NAME'),
            field(node.children, 'MEMO'),
          ]
            .filter(Boolean)
            .join(' - '),
          externalId: field(node.children, 'FITID') || undefined,
        };
      }),
    ),
  };
}
