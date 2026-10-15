import { parseSearchCursor } from 'src/modules/transactions/helpers/transaction-search-cursor';

describe('Continuação de buscas de transações', () => {
  const cursor = {
    v: 1,
    dateIndex: 20261015,
    id: '64f000000000000000000001',
    fingerprint: 'busca-do-usuario',
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  it('aceita um cursor somente para a mesma busca', () => {
    expect(parseSearchCursor(encode(cursor), cursor.fingerprint)).toEqual(
      cursor,
    );
  });

  it('recusa reutilização por outro usuário ou com filtros diferentes', () => {
    expect(() => parseSearchCursor(encode(cursor), 'outra-busca')).toThrow(
      'Cursor inválido',
    );
  });

  it.each([
    { ...cursor, v: 2 },
    { ...cursor, dateIndex: 0 },
    { ...cursor, dateIndex: 20261015.5 },
    { ...cursor, id: 'inválido' },
    { ...cursor, id: undefined },
    null,
  ])('recusa estrutura adulterada: %j', (value) => {
    expect(() => parseSearchCursor(encode(value), cursor.fingerprint)).toThrow(
      'Cursor inválido',
    );
  });

  it.each(['a=b', '!!!', '', Buffer.from('não é JSON').toString('base64url')])(
    'recusa conteúdo inválido: %s',
    (value) => {
      expect(() => parseSearchCursor(value, cursor.fingerprint)).toThrow(
        'Cursor inválido',
      );
    },
  );
});
