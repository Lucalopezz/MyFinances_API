import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthTokenGuard } from 'src/common/guards/auth-token.guard';
import { User } from 'src/common/decorators/get-userId-from-token.decorator';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  ConfirmImport,
  ConfirmImportSchema,
  IMPORT_MAX_BYTES,
  ImportOptionsSchema,
} from './import.dto';
import { ImportsService } from './imports.service';

@Controller('transaction-imports')
@UseGuards(AuthTokenGuard)
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: IMPORT_MAX_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 8192,
        // Busboy emits partsLimit when the counter reaches the limit; allow
        // the two expected parts to finish. files/fields still enforce 1 each.
        parts: 3,
      },
    }),
  )
  preview(
    @UploadedFile() file: { buffer: Buffer },
    @Body('options') raw: string,
    @User('sub') userId: string,
  ) {
    let options: unknown;
    try {
      options = JSON.parse(raw);
    } catch {
      throw new BadRequestException('O campo options deve conter JSON válido.');
    }
    const parsed = ImportOptionsSchema.safeParse(options);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.service.preview(file?.buffer, parsed.data, userId);
  }
  @Get(':id')
  get(@Param('id') id: string, @User('sub') userId: string) {
    return this.service.get(id, userId);
  }
  @Post(':id/confirm')
  confirm(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConfirmImportSchema)) dto: ConfirmImport,
    @User('sub') userId: string,
  ) {
    return this.service.confirm(id, dto, userId);
  }
  @Delete(':id')
  cancel(@Param('id') id: string, @User('sub') userId: string) {
    return this.service.cancel(id, userId);
  }
}
