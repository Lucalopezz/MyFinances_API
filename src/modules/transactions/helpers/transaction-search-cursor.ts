type SearchCursor = {
  v: 1;
  dateIndex: number;
  id: string;
  fingerprint: string;
};

/** O cursor só pode continuar a mesma busca, usuário e ordenação. */
export function parseSearchCursor(
  value: string,
  fingerprint: string,
): SearchCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const cursor = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as SearchCursor;
    if (
      cursor.v !== 1 ||
      cursor.fingerprint !== fingerprint ||
      !Number.isInteger(cursor.dateIndex) ||
      cursor.dateIndex < 10000101 ||
      !/^[a-f\d]{24}$/i.test(cursor.id)
    )
      throw new Error();
    return cursor;
  } catch {
    throw new Error('Cursor inválido para esta busca.');
  }
}
