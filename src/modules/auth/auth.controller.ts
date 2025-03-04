import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { LoginDtoSchema, LoginType } from './dtos/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post()
  login(@Body(new ZodValidationPipe(LoginDtoSchema)) loginDto: LoginType) {
    return this.authService.login(loginDto);
  }
}
