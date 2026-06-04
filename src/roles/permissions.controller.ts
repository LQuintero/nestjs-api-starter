import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermissions } from './decorators/permissions.decorator';
import { Roles } from './decorators/roles.decorator';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { ListQueryDto } from './dto/list-query.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionsService } from './permissions.service';

// The global JwtAuthGuard authenticates first, then RolesGuard and
// PermissionsGuard enforce admin-only access.
@ApiTags('permissions')
@ApiBearerAuth()
@Roles('admin')
@UseGuards(RolesGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions('permissions:read')
  @ApiOperation({ summary: 'List permissions' })
  findAll(@Query() query: ListQueryDto) {
    return this.permissionsService.findAll(query.includeInactive ?? false);
  }

  @Post()
  @RequirePermissions('permissions:write')
  @ApiOperation({ summary: 'Create a permission' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('permissions:write')
  @ApiOperation({ summary: 'Update a permission' })
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }
}
