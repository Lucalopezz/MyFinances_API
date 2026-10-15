import { BadRequestException } from '@nestjs/common';
import { CardRuleViolation } from '../domain/card-rules';

/** Impede que identificadores inválidos cheguem ao adaptador MongoDB. */
export function checkCardId(id: string) {
  if (!/^[a-f\d]{24}$/i.test(id))
    throw new BadRequestException('Cartão inválido.');
}

/** Traduz apenas erros de regra conhecidos, preservando falhas de programação e infraestrutura. */
export function cardRule<T>(evaluate: () => T): T {
  try {
    return evaluate();
  } catch (error) {
    if (error instanceof CardRuleViolation)
      throw new BadRequestException(error.message);
    throw error;
  }
}
