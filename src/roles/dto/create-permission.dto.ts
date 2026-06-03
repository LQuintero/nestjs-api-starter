import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Permissions follow a `resource:action` convention, lowercase and
 * colon-separated (for example `users:read`). This is enforced both here and
 * in the database seed so the whole system shares one naming scheme.
 */
export const PERMISSION_NAME_PATTERN = /^[a-z0-9-]+:[a-z0-9-]+$/;

export class CreatePermissionDto {
  @ApiProperty({
    description: 'Permission name in lowercase `resource:action` format.',
    example: 'users:read',
    pattern: PERMISSION_NAME_PATTERN.source,
  })
  @IsString()
  @MaxLength(100)
  @Matches(PERMISSION_NAME_PATTERN, {
    message:
      'name must follow the lowercase resource:action convention (e.g. "users:read")',
  })
  name!: string;

  @ApiPropertyOptional({ description: 'Human-readable permission description.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether the permission is active. Defaults to true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
