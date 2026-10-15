import { resolveCategory } from 'src/modules/categories/rules/domain/category-resolution';

describe('Classificação por categoria', () => {
  const catalog = [
    { id: 'food', type: 'EXPENSE' as const, archived: false },
    { id: 'other', type: 'EXPENSE' as const, archived: false },
    { id: 'salary', type: 'INCOME' as const, archived: false },
    { id: 'old', type: 'EXPENSE' as const, archived: true },
  ];
  const input = { type: 'EXPENSE' as const, description: '  CAFÉ da manhã  ' };
  const rule = {
    id: 'first',
    type: 'EXPENSE' as const,
    category: 'food',
    contains: 'cafe',
    enabled: true,
  };

  it('prioriza a categoria manual sobre regras que combinam com a descrição', () => {
    expect(
      resolveCategory({ ...input, category: 'other' }, catalog, [rule]),
    ).toEqual({ category: 'other', ruleId: null, source: 'manual' });
  });

  it.each(['old', 'salary', 'missing'])(
    'recusa categoria manual indisponível: %s',
    (category) => {
      expect(
        resolveCategory({ ...input, category }, catalog, [rule]),
      ).toBeNull();
    },
  );

  it('normaliza acentos e maiúsculas e respeita a primeira regra aplicável', () => {
    expect(
      resolveCategory(input, catalog, [
        rule,
        { ...rule, id: 'second', category: 'other' },
      ]),
    ).toEqual({ category: 'food', ruleId: 'first', source: 'rule' });
  });

  it('ignora regras desativadas, de outro tipo ou com destino arquivado', () => {
    expect(
      resolveCategory(input, catalog, [
        { ...rule, enabled: false },
        { ...rule, type: 'INCOME', category: 'salary' },
        { ...rule, category: 'old' },
        { ...rule, category: 'missing' },
      ]),
    ).toEqual({ category: null, ruleId: null, source: null });
  });

  it('não classifica descrições sem correspondência', () => {
    expect(
      resolveCategory({ ...input, description: 'Aluguel' }, catalog, [rule]),
    ).toEqual({ category: null, ruleId: null, source: null });
  });
});
