import { z } from 'zod';

const fields: Record<string, string> = {
  name: 'Nome',
  description: 'Descrição',
  amount: 'Valor',
  value: 'Valor',
  limit: 'Limite',
  annualFee: 'Anuidade',
  date: 'Data',
  dueDate: 'Vencimento',
  closingDay: 'Dia de fechamento',
  dueDay: 'Dia de vencimento',
  installments: 'Parcelas',
  cardInstallments: 'Parcelas',
  cardId: 'Cartão',
  category: 'Categoria',
  recurrence: 'Recorrência',
  email: 'E-mail',
  password: 'Senha',
  startDate: 'Data inicial',
  endDate: 'Data final',
  month: 'Mês',
};

/** Traduz as validações padrão sem expor valores recebidos ou detalhes técnicos. */
export function validationMessage(issue: z.ZodIssue): string {
  const field = fields[String(issue.path.at(-1))] ?? 'Campo informado';
  // Mensagens específicas do domínio continuam sendo a orientação principal.
  if (issue.code === 'custom') return issue.message;
  const prefix = `${field}: `;
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined' || issue.received === 'null')
        return `${prefix}preencha este campo.`;
      return `${prefix}${issue.expected === 'number' ? 'informe um número válido.' : issue.expected === 'date' ? 'informe uma data válida.' : 'informe um valor válido.'}`;
    case 'too_small':
      return `${prefix}${issue.type === 'string' ? `use pelo menos ${issue.minimum} caracteres.` : `informe um valor ${issue.inclusive ? 'maior ou igual a' : 'maior que'} ${issue.minimum}.`}`;
    case 'too_big':
      return `${prefix}${issue.type === 'string' ? `use no máximo ${issue.maximum} caracteres.` : `informe um valor ${issue.inclusive ? 'menor ou igual a' : 'menor que'} ${issue.maximum}.`}`;
    case 'invalid_string':
      return `${prefix}${issue.validation === 'email' ? 'informe um e-mail válido.' : 'confira o formato informado.'}`;
    case 'invalid_enum_value':
      return `${prefix}selecione uma opção válida.`;
    case 'invalid_date':
      return `${prefix}informe uma data válida.`;
    case 'not_multiple_of':
      return `${prefix}use no máximo duas casas decimais.`;
    case 'not_finite':
      return `${prefix}informe um número válido.`;
    default:
      return `${prefix}confira o valor informado.`;
  }
}
