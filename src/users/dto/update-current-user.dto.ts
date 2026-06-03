import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCurrentUserDto {
  @ApiPropertyOptional({
    description: 'Display name for the current user.',
    example: 'Ada Lovelace',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;
}
