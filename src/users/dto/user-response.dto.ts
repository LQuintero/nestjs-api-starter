import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Swagger/response shape for a user. Intentionally excludes `passwordHash`
 * so credential material never leaves the service layer.
 */
export class UserResponseDto {
  @ApiProperty({ example: 'ckv9q9k8z0000abcd1234efgh' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'Ada Lovelace', nullable: true })
  name!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/**
 * Extended profile response used for the current user, including the active
 * role and permission names resolved through the RBAC layer.
 */
export class UserProfileResponseDto extends UserResponseDto {
  @ApiProperty({ type: [String], example: ['admin'] })
  roles!: string[];

  @ApiProperty({ type: [String], example: ['users:read', 'users:write'] })
  permissions!: string[];
}
