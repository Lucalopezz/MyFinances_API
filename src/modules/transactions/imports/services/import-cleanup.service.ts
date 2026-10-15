import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ImportsRepository } from '../repositories/imports.repository';

/** Descarta payloads expirados sem apagar os recibos duráveis de importação. */
@Injectable()
export class ImportCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(ImportCleanupService.name);
  constructor(private readonly repository: ImportsRepository) {}
  onModuleInit() {
    void this.purge();
    this.timer = setInterval(() => void this.purge(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async purge() {
    try {
      await this.repository.purgeExpired();
    } catch {
      this.logger.warn(
        'Não foi possível descartar prévias expiradas. Nova tentativa em um minuto.',
      );
    }
  }
}
