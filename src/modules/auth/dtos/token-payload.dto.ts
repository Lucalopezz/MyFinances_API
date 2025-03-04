export class TokenPayloadDto {
  sub: string;
  role: string;
  email: string;
  iat: number;
  exp: number;
  aud: string;
  iss: string;
}
