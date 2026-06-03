import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const ROLE_NAME_PATTERN = /^[a-z0-9-]+$/;

export class CreateRoleDto {
  @ApiProperty({
    description: 'Unique role name (lowercase letters, digits, and dashes).',
    example: 'admin',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(ROLE_NAME_PATTERN, {
    message: 'name must contain only lowercase letters, digits, and dashes',
  })
  name!: string;

  @ApiPropertyOptional({ description: 'Human-readable role description.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether the role is active. Defaults to true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
