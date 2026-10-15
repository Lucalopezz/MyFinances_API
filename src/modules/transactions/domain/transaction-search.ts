import type { DecryptedTransaction } from '../types/transaction.types';

/** A categoria criptografada só pode ser filtrada após a leitura, incluindo o nome do catálogo. */
export function matchesTransaction(
  item: DecryptedTransaction,
  category: string | undefined,
  searchText: string | undefined,
  catalog: readonly { id: string; name: string }[],
): boolean {
  if (category && item.category !== category) return false;
  return (
    !searchText ||
    item.category.toLocaleLowerCase('pt-BR').includes(searchText) ||
    !!catalog
      .find((entry) => entry.id === item.category)
      ?.name.toLocaleLowerCase('pt-BR')
      .includes(searchText) ||
    !!item.description?.toLocaleLowerCase('pt-BR').includes(searchText)
  );
}
