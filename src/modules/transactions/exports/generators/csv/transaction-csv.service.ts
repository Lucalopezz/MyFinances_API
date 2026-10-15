import { Injectable } from '@nestjs/common';
import { once } from 'events';
import { WriteStream } from 'fs';
import { DecryptedTransaction } from '../../../mappers/transaction-encryption.mapper';

@Injectable()
export class TransactionCsvService {
  /**
   * Inicia o CSV com BOM UTF-8 para que o Excel reconheça os acentos.
   * As colunas mantêm o contrato usado pelas ferramentas de importação.
   */
  async writeHeader(output: WriteStream) {
    await this.write(
      output,
      '\uFEFFid,date,type,category,description,value\r\n',
    );
  }

  /**
   * Escreve um lançamento em formato de intercâmbio: datas ISO, tipos e IDs
   * originais e valor numérico com ponto decimal, sem símbolos de moeda.
   * PDF e XLSX localizam os nomes; o CSV preserva as referências originais.
   */
  async addTransaction(output: WriteStream, transaction: DecryptedTransaction) {
    const cells = [
      transaction.id,
      transaction.date.toISOString(),
      transaction.type,
      transaction.category,
      transaction.description ?? '',
      String(transaction.value),
    ];
    // O valor fica numérico para permitir cálculos nas planilhas. Os demais
    // campos são delimitados por aspas para aceitar vírgulas e quebras de
    // linha na descrição. O CRLF mantém a convenção dos arquivos CSV.
    await this.write(
      output,
      cells
        .map((value, index) =>
          index === 5 ? value : this.escapeCell(value, index === 4),
        )
        .join(',') + '\r\n',
    );
  }

  private escapeCell(value: string, protectFormula: boolean): string {
    // Descrições são texto livre e podem começar com sinais de fórmula.
    // O apóstrofo força a leitura como texto mesmo se houver espaços antes
    // do sinal. IDs, tipos e datas são controlados pelo contrato do domínio.
    const safe =
      protectFormula && /^[\s\u0000-\u001f]*[=+@-]/.test(value)
        ? `'${value}`
        : value;
    // Dentro de uma célula entre aspas, o padrão CSV representa uma aspa
    // literal como duas aspas, em vez de usar escape com barra invertida.
    return `"${safe.replaceAll('"', '""')}"`;
  }

  private async write(output: WriteStream, value: string) {
    // write() retorna false quando o buffer interno enche. Aguardar drain
    // aplica a contrapressão do stream e evita acumular o CSV todo em memória.
    if (!output.write(value)) await once(output, 'drain');
  }
}
