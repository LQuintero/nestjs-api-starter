import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedRequestUser,
} from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/permissions.decorator';
import { Roles } from '../roles/decorators/roles.decorator';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  UserProfileResponseDto,
  UserResponseDto,
} from './dto/user-response.dto';
import { UsersService } from './users.service';

// JwtAuthGuard authenticates every request and populates `request.user`. The
// `/me` routes carry no role/permission metadata, so RolesGuard and
// PermissionsGuard pass through for them; admin routes add @Roles/@Require-
// Permissions which those guards then enforce.
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user profile' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  getCurrentUser(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.usersService.getCurrentUser(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current authenticated user profile' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  updateCurrentUser(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: UpdateCurrentUserDto,
  ) {
    return this.usersService.updateCurrentUser(user.id, dto);
  }

  @Get()
  @Roles('admin')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List users (admin)' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(UserResponseDto) },
        },
        meta: { type: 'object' },
      },
    },
  })
  findMany(@Query() query: PaginationQueryDto) {
    return this.usersService.findMany(query);
  }

  @Get(':id')
  @Roles('admin')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Get a user by id (admin)' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  getUser(@Param('id') id: string) {
    return this.usersService.getCurrentUser(id);
  }

  @Patch(':id')
  @Roles('admin')
  @RequirePermissions('users:write')
  @ApiOperation({ summary: 'Update a user (admin)' })
  @ApiOkResponse({ type: UserResponseDto })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @RequirePermissions('users:write')
  @ApiOperation({ summary: 'Deactivate a user (admin, soft delete)' })
  @ApiOkResponse({ type: UserResponseDto })
  deactivateUser(@Param('id') id: string) {
    return this.usersService.deactivateUser(id);
  }
}
