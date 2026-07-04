import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

type EncryptedField = string;

@Injectable()
export class FinancialDataEncryptionService {
  private readonly logger = new Logger(FinancialDataEncryptionService.name);
  // A 32-byte key is required for AES-256-GCM encryption
  private readonly key: Buffer;

  constructor() {
    this.key = this.resolveKey();
  }

  encrypt(value: unknown): EncryptedField {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = JSON.stringify(value);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // The encrypted value is returned in the format: version:iv:authTag:encrypted
    return [
      'v1',
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt<T>(encryptedValue: EncryptedField): T {
    const [version, iv, authTag, encrypted] = encryptedValue.split(':');

    if (version !== 'v1' || !iv || !authTag || !encrypted) {
      throw new InternalServerErrorException(
        'Formato de dado financeiro criptografado inválido.',
      );
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext) as T;
  }

  private resolveKey(): Buffer {
    const rawKey = process.env.FINANCIAL_DATA_ENCRYPTION_KEY;

    if (!rawKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new InternalServerErrorException(
          'FINANCIAL_DATA_ENCRYPTION_KEY deve ser configurada em produção.',
        );
      }

      this.logger.warn(
        'FINANCIAL_DATA_ENCRYPTION_KEY ausente. Usando chave derivada apenas para desenvolvimento.',
      );
      return createHash('sha256')
        .update('myfinances-development-financial-data-key')
        .digest();
    }

    const base64Key = Buffer.from(rawKey, 'base64');
    if (base64Key.length === 32) {
      return base64Key;
    }

    const utf8Key = Buffer.from(rawKey, 'utf8');
    if (utf8Key.length === 32) {
      return utf8Key;
    }

    return createHash('sha256').update(rawKey).digest();
  }
}
