import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token.' })
  @IsString()
  accessToken!: string;

  @ApiProperty({ description: 'Opaque refresh token used to obtain new access tokens.' })
  @IsString()
  refreshToken!: string;
}
