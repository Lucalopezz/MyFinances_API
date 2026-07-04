# Criptografia de Transações

Este documento descreve como os dados sensíveis das transações são criptografados em repouso e como a aplicação mantém dashboard, comparativos, wishlist e relatórios funcionando.

---

## Campos protegidos

Os seguintes dados financeiros da transação são considerados sensíveis e ficam dentro de `Transaction.encryptedData`:

| Campo         | Motivo                                                   |
| ------------- | -------------------------------------------------------- |
| `value`       | Expõe diretamente a movimentação financeira do usuário.  |
| `date`        | Revela hábitos e momentos de receita ou despesa.         |
| `category`    | Revela o tipo de gasto ou receita.                       |
| `description` | Pode conter informações pessoais digitadas pelo usuário. |

Os campos abaixo continuam em claro por necessidade operacional:

| Campo                     | Motivo                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| `type`                    | Necessário para separar receitas e despesas sem descriptografar toda a base.  |
| `dateIndex`               | Índice numérico `YYYYMMDD` usado em filtros, ordenação e recortes de período. |
| `userId`                  | Necessário para isolamento dos dados por usuário.                             |
| `createdAt` e `updatedAt` | Usados para auditoria e controle do registro.                                 |

`dateIndex` permite consultas eficientes por data, mas revela o dia da transação. Se for necessário ocultar completamente a data no banco, os filtros por período precisarão descriptografar todas as transações do usuário em memória ou usar outro índice cego planejado para os filtros desejados.

---

## Estratégia de criptografia

A aplicação usa criptografia reversível com AES-256-GCM no serviço `FinancialDataEncryptionService`.

Cada campo sensível é criptografado separadamente e armazenado com o formato:

```text
v1:<iv-base64>:<auth-tag-base64>:<ciphertext-base64>
```

O uso de GCM fornece confidencialidade e validação de integridade. Se o valor criptografado for alterado diretamente no banco, a descriptografia falha.

A senha do usuário continua usando hash com bcrypt. Essa lógica não é reutilizada para transações porque hash de senha não é reversível, e a aplicação precisa recuperar `value`, `date`, `category` e `description` para exibir e calcular os dados financeiros.

---

## Chave de criptografia

Configure a variável de ambiente:

```env
FINANCIAL_DATA_ENCRYPTION_KEY=<chave-base64-com-32-bytes>
```

Uma chave pode ser gerada com:

```bash
openssl rand -base64 32
```

Em produção, a aplicação exige essa variável. Em desenvolvimento, se ela estiver ausente, uma chave derivada fixa é usada apenas para evitar bloqueio local. Dados gravados com uma chave não podem ser descriptografados com outra.

---

## Fluxo de gravação

1. O controller valida o DTO da transação.
2. `TransactionsService` chama `buildEncryptedTransactionData`.
3. O mapper criptografa `value`, `date`, `category` e `description`.
4. O mapper calcula `dateIndex` a partir da data em UTC no formato `YYYYMMDD`.
5. O Prisma salva `encryptedData`, `dateIndex`, `type` e metadados operacionais.

O mesmo fluxo é usado quando uma despesa fixa é marcada como paga e cria uma transação automaticamente.

---

## Fluxo de leitura

1. O service busca as transações pelo `userId`.
2. Quando há filtro por período, a consulta usa `dateIndex`.
3. O mapper chama `decryptTransaction` ou `decryptTransactions`.
4. A API retorna o contrato externo tradicional:

```ts
{
  id, value, date, category, description, type, createdAt, updatedAt, userId;
}
```

O frontend não precisa conhecer `encryptedData`.

---

## Impacto em dashboard, comparativos e wishlist

Dashboard e comparativos:

- Filtram por período usando `dateIndex`.
- Descriptografam as transações encontradas.
- Calculam totais, saldo, taxa de economia, maior categoria de gasto e agrupamento mensal em memória.

Wishlist:

- Filtra as transações do ano atual usando `dateIndex`.
- Descriptografa os valores filtrados.
- Recalcula `savedAmount` a partir de receitas menos despesas.

Relatórios futuros devem seguir o mesmo padrão: filtrar primeiro por campos operacionais permitidos e calcular valores financeiros apenas depois da descriptografia.

---

## Limitações para filtros, ordenação e agrupamentos

Como `value`, `date`, `category` e `description` estão criptografados com IV aleatório, o banco não consegue executar buscas diretas, ordenações ou agregações nesses campos.

Impactos:

- Filtro por período: suportado por `dateIndex`.
- Ordenação por data: suportada por `dateIndex`.
- Agrupamento mensal: feito em memória após descriptografia.
- Soma de receitas e despesas: feita em memória após descriptografia.
- Filtro por categoria: não deve ser feito direto no banco. Para suportar isso com performance, crie um índice cego por categoria e documente o vazamento aceito.
- Ordenação por valor: não suportada no banco com o valor criptografado. Deve ser feita em memória após descriptografia ou por um índice auxiliar planejado.

---

## Manutenção

- Não registre em log valores descriptografados.
- Não retorne `encryptedData` em endpoints públicos.
- Ao adicionar um novo campo sensível em transações, inclua-o em `TransactionSensitiveData`, no mapper e neste documento.
- Ao trocar a chave, planeje uma rotina de rotação: ler com a chave antiga, descriptografar, criptografar com a nova e salvar novamente.
- Dados antigos em claro precisam de migração para o novo formato antes de remover o acesso legado.
