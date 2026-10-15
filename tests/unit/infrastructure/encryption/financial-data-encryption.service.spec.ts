import { InternalServerErrorException } from '@nestjs/common';
import { FinancialDataEncryptionService } from 'src/infrastructure/encryption/financial-data-encryption.service';

describe('Criptografia financeira', () => {
  const originalKey = process.env.FINANCIAL_DATA_ENCRYPTION_KEY;
  const originalEnvironment = process.env.NODE_ENV;

  afterEach(() => {
    process.env.FINANCIAL_DATA_ENCRYPTION_KEY = originalKey;
    process.env.NODE_ENV = originalEnvironment;
  });

  it('preserva centavos, Unicode e campos opcionais sem expor o conteúdo', () => {
    const service = new FinancialDataEncryptionService();
    const value = {
      amount: 123.45,
      description: 'Pão e café ☕',
      optional: null,
    };
    const encrypted = service.encrypt(value);
    expect(encrypted).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(encrypted).not.toContain('Pão');
    expect(service.decrypt(encrypted)).toEqual(value);
    // O IV aleatório impede que valores repetidos produzam o mesmo texto cifrado.
    expect(service.encrypt(value)).not.toBe(encrypted);
  });

  it('recusa adulteração do conteúdo mesmo quando o formato continua válido', () => {
    const service = new FinancialDataEncryptionService();
    const parts = service.encrypt({ amount: 100 }).split(':');
    const ciphertext = Buffer.from(parts[3], 'base64');
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString('base64');
    expect(() => service.decrypt(parts.join(':'))).toThrow();
  });

  it('não permite ler dados com outra chave', () => {
    const encrypted = new FinancialDataEncryptionService().encrypt('sigiloso');
    process.env.FINANCIAL_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      'base64',
    );
    expect(() =>
      new FinancialDataEncryptionService().decrypt(encrypted),
    ).toThrow();
  });

  it.each(['', 'texto aberto', 'v2:a:b:c', 'v1::b:c', 'v1:a::c', 'v1:a:b:'])(
    'recusa envelope inválido: %s',
    (value) => {
      expect(() => new FinancialDataEncryptionService().decrypt(value)).toThrow(
        InternalServerErrorException,
      );
    },
  );

  it('exige chave explícita em produção', () => {
    delete process.env.FINANCIAL_DATA_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    expect(() => new FinancialDataEncryptionService()).toThrow(
      'deve ser configurada em produção',
    );
  });

  it.each(['12345678901234567890123456789012', 'chave legada derivada'])(
    'mantém compatibilidade com a chave %s',
    (key) => {
      process.env.FINANCIAL_DATA_ENCRYPTION_KEY = key;
      const encrypted = new FinancialDataEncryptionService().encrypt({
        value: 0.01,
      });
      expect(new FinancialDataEncryptionService().decrypt(encrypted)).toEqual({
        value: 0.01,
      });
    },
  );
});
