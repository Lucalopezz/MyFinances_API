import {
  Body,
  Controller,
  Get,
  Header,
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
} from './dtos/create-transaction-export.dto';
import { ExportsService } from './exports.service';

@Controller('exports')
@UseGuards(AuthTokenGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('transactions')
  @HttpCode(HttpStatus.ACCEPTED) // Forces the response to be 202 Accepted instead of 201 Created
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
  @Header('Content-Type', 'application/pdf')
  async downloadExport(
    @Param('id') id: string,
    @User('sub') userId: string,
  ): Promise<StreamableFile> {
    const { filePath, fileName } = await this.exportsService.getDownload(
      id,
      userId,
    );
    // Return the file as a streamable response with appropriate headers
    // The 'Content-Type' header is set to 'application/pdf' to indicate the file type
    return new StreamableFile(createReadStream(filePath), {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
