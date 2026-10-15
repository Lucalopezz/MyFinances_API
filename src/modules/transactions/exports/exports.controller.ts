import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  CreateTransactionExportDto,
  CreateTransactionExportSchema,
} from './dto/create-transaction-export.dto';
import { ExportsService } from './services/exports.service';

@Controller('exports')
@UseGuards(AuthTokenGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('transactions')
  // O arquivo será gerado pelo worker; 202 indica que a solicitação entrou
  // em processamento, sem afirmar que o download já está disponível.
  @HttpCode(HttpStatus.ACCEPTED)
  async createTransactionExport(
    @Body(new ZodValidationPipe(CreateTransactionExportSchema))
    filters: CreateTransactionExportDto,
    @User('sub') userId: string,
  ) {
    return this.exportsService.createTransactionExport(userId, filters);
  }

  @Get('status')
  async getLatestExport(@User('sub') userId: string) {
    return this.exportsService.getLatestExport(userId);
  }

  @Get(':id/download')
  async downloadExport(
    @Param('id') id: string,
    @User('sub') userId: string,
  ): Promise<StreamableFile> {
    const { filePath, fileName, contentType } =
      await this.exportsService.getDownload(id, userId);
    return new StreamableFile(createReadStream(filePath), {
      type: contentType,
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
